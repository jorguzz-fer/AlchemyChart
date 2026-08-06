import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export const maxDuration = 300;

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN"] as const;
const LEVELS = [1, 2] as const; // laboratório usa apenas N1 e N2

// Corrige o pareamento material ↔ nível de controle.
//
// Neste laboratório cada material cadastrado É um nível do controle:
// "Bioquímica 147" = N1 e "Bioquímica 148" = N2, "Controle Hemato 90137" = N1
// e "90138" = N2, "Hormônio 144" = N1 e "145" = N2. Quem cadastrou tratou o
// material como "o controle daquele aparelho" — o AU 480 (1) ficou com o 147
// nos dois níveis e o AU 480 (2) com o 148 nos dois —, então o Nível 2 nunca
// apontou para o frasco certo.
//
// Aqui as famílias são deduzidas do nome (prefixo + número final) entre os
// materiais ATIVOS: o menor número é o N1, o maior é o N2. Família que não
// tiver exatamente 2 materiais ativos é ignorada e reportada, nunca chutada.

type MaterialRow = { id: string; name: string; lot: string | null };

function parseMaterialName(name: string): { family: string; num: number } | null {
  const m = name.trim().match(/^(.*?)[\s-]*(\d+)\s*$/);
  if (!m) return null;
  const family = m[1]
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos: "Hormônio" cai na mesma família de "Hormonio"
    .replace(/\s+/g, " ");
  const num = Number(m[2]);
  if (!family || !Number.isFinite(num)) return null;
  return { family, num };
}

type Family = { family: string; byLevel: Map<number, MaterialRow> };

async function loadScope(tenantId: string) {
  const [materials, allMaterials, analytes, ams, equipments] = await Promise.all([
    prisma.material.findMany({
      where: { unit: { tenantId }, active: true },
      select: { id: true, name: true, lot: true },
    }),
    // Inclui inativos só para conseguir NOMEAR o material de origem na prévia.
    prisma.material.findMany({
      where: { unit: { tenantId } },
      select: { id: true, name: true },
    }),
    prisma.analyte.findMany({
      where: { unitRel: { tenantId }, active: true },
      select: { id: true, name: true, equipmentId: true, level: true },
    }),
    prisma.analyteMaterial.findMany({
      where: { analyte: { unitRel: { tenantId } } },
      select: {
        id: true,
        analyteId: true,
        equipmentId: true,
        materialId: true,
        level: true,
        status: true,
        _count: { select: { runs: true } },
      },
    }),
    prisma.equipment.findMany({
      where: { unit: { tenantId } },
      select: { id: true, name: true },
    }),
  ]);

  // Agrupa materiais ativos por família (prefixo do nome).
  const grouped = new Map<string, { num: number; mat: MaterialRow }[]>();
  const unparsed: MaterialRow[] = [];
  for (const mat of materials) {
    const parsed = parseMaterialName(mat.name);
    if (!parsed) {
      unparsed.push(mat);
      continue;
    }
    const arr = grouped.get(parsed.family) ?? [];
    arr.push({ num: parsed.num, mat });
    grouped.set(parsed.family, arr);
  }

  const families = new Map<string, Family>();
  const skipped: { family: string; reason: string; materials: string[] }[] = [];
  for (const [family, arr] of grouped) {
    if (arr.length !== 2) {
      skipped.push({
        family,
        reason:
          arr.length < 2
            ? "só há 1 material ativo nesta família — não dá para dizer qual é o Nível 2"
            : `há ${arr.length} materiais ativos nesta família — ambíguo qual é N1 e qual é N2`,
        materials: arr.map((x) => x.mat.name),
      });
      continue;
    }
    arr.sort((a, b) => a.num - b.num); // menor = N1
    families.set(family, {
      family,
      byLevel: new Map([
        [1, arr[0].mat],
        [2, arr[1].mat],
      ]),
    });
  }
  for (const mat of unparsed) {
    skipped.push({
      family: mat.name,
      reason: "nome sem número no final — não dá para deduzir o nível",
      materials: [mat.name],
    });
  }

  // Família de cada equipamento: a mais frequente entre os materiais já ligados.
  const matFamily = new Map<string, string>();
  for (const f of families.values()) {
    for (const mat of f.byLevel.values()) matFamily.set(mat.id, f.family);
  }
  const tally = new Map<string, Map<string, number>>();
  for (const am of ams) {
    const fam = matFamily.get(am.materialId);
    if (!fam) continue;
    const t = tally.get(am.equipmentId) ?? new Map<string, number>();
    t.set(fam, (t.get(fam) ?? 0) + 1);
    tally.set(am.equipmentId, t);
  }
  const equipFamily = new Map<string, Family>();
  for (const [equipId, t] of tally) {
    let best: string | null = null;
    let bestN = 0;
    for (const [fam, n] of t) {
      if (n > bestN) {
        best = fam;
        bestN = n;
      }
    }
    const f = best ? families.get(best) : undefined;
    if (f) equipFamily.set(equipId, f);
  }

  const materialName = new Map(allMaterials.map((m) => [m.id, m.name]));

  return { analytes, ams, equipments, families, skipped, equipFamily, materialName };
}

type Plan = {
  reassign: { amId: string; analyteId: string; equipmentId: string; level: number; toMaterialId: string }[];
  create: { analyteId: string; equipmentId: string; level: number; materialId: string; status: string }[];
  merge: { fromAmId: string; toAmId: string; runs: number }[];
  details: Map<string, { equipment: string; level: number; from: string; to: string; action: string; count: number }>;
};

function buildPlan(scope: Awaited<ReturnType<typeof loadScope>>): Plan {
  const { analytes, ams, equipments, equipFamily } = scope;
  const eqName = new Map(equipments.map((e) => [e.id, e.name]));

  const plan: Plan = { reassign: [], create: [], merge: [], details: new Map() };

  const addDetail = (
    equipment: string,
    level: number,
    from: string,
    to: string,
    action: string
  ) => {
    const key = `${equipment}|${level}|${from}|${to}|${action}`;
    const d = plan.details.get(key) ?? { equipment, level, from, to, action, count: 0 };
    d.count++;
    plan.details.set(key, d);
  };

  // AMs indexados por analito+equipamento+nível
  const amsByKey = new Map<string, typeof ams>();
  for (const am of ams) {
    if (am.level > 2) continue;
    const key = `${am.analyteId}|${am.equipmentId}|${am.level}`;
    const arr = amsByKey.get(key) ?? [];
    arr.push(am);
    amsByKey.set(key, arr);
  }

  // Analitos agrupados por nome+equipamento — precisamos do registro de cada nível
  const byNameEquip = new Map<string, typeof analytes>();
  for (const a of analytes) {
    const key = `${a.name}|${a.equipmentId}`;
    const arr = byNameEquip.get(key) ?? [];
    arr.push(a);
    byNameEquip.set(key, arr);
  }

  for (const [, group] of byNameEquip) {
    const equipmentId = group[0].equipmentId;
    const family = equipFamily.get(equipmentId);
    if (!family) continue; // equipamento sem família identificada — não mexe
    const equipment = eqName.get(equipmentId) ?? equipmentId;

    for (const level of LEVELS) {
      const target = family.byLevel.get(level);
      if (!target) continue;

      // Percorre TODOS os registros de analito do grupo, não só um: o modelo
      // legado pode ter mais de um Analyte para o mesmo nome+equipamento, e
      // deixar os extras de fora corrigiria a tela pela metade em silêncio.
      // A unificação acontece só entre vínculos do MESMO analito — juntar
      // corridas de analitos diferentes é assunto de "Corrigir níveis das
      // corridas", não desta ferramenta.
      let anyAmAtLevel = false;

      for (const a of group) {
        const existing = amsByKey.get(`${a.id}|${equipmentId}|${level}`) ?? [];
        if (existing.length === 0) continue;
        anyAmAtLevel = true;

        // Mantém o vínculo que já aponta para o material certo; se nenhum
        // aponta, elege o que tem mais corridas e reaponta.
        const keeper =
          existing.find((am) => am.materialId === target.id) ??
          [...existing].sort((x, y) => y._count.runs - x._count.runs)[0];

        if (keeper.materialId !== target.id) {
          plan.reassign.push({
            amId: keeper.id,
            analyteId: a.id,
            equipmentId,
            level,
            toMaterialId: target.id,
          });
          addDetail(
            equipment,
            level,
            scope.materialName.get(keeper.materialId) ?? "material desconhecido",
            target.name,
            "reapontar"
          );
        }

        // Vínculos duplicados no mesmo nível e mesmo analito: junta no keeper.
        for (const am of existing) {
          if (am.id === keeper.id) continue;
          plan.merge.push({ fromAmId: am.id, toAmId: keeper.id, runs: am._count.runs });
          addDetail(equipment, level, "vínculo duplicado", target.name, "unificar");
        }
      }

      if (!anyAmAtLevel) {
        // Nenhum vínculo neste nível — cria um, no Analyte do nível certo
        // quando ele existir. Herda o status do nível 1, senão entra em PREPARO.
        const analyte = group.find((a) => a.level === level) ?? group[0];
        const sibling = amsByKey.get(`${analyte.id}|${equipmentId}|1`)?.[0];
        plan.create.push({
          analyteId: analyte.id,
          equipmentId,
          level,
          materialId: target.id,
          status: sibling?.status ?? "PREPARO",
        });
        addDetail(equipment, level, "— (sem vínculo)", target.name, "criar");
      }
    }
  }

  return plan;
}

function serialize(scope: Awaited<ReturnType<typeof loadScope>>, plan: Plan) {
  const eqName = new Map(scope.equipments.map((e) => [e.id, e.name]));
  return {
    families: Array.from(scope.families.values()).map((f) => ({
      family: f.family,
      n1: f.byLevel.get(1)?.name ?? null,
      n2: f.byLevel.get(2)?.name ?? null,
    })),
    equipments: Array.from(scope.equipFamily.entries()).map(([id, f]) => ({
      equipment: eqName.get(id) ?? id,
      family: f.family,
      n1: f.byLevel.get(1)?.name ?? null,
      n2: f.byLevel.get(2)?.name ?? null,
    })),
    skipped: scope.skipped,
    totals: {
      reassign: plan.reassign.length,
      create: plan.create.length,
      merge: plan.merge.length,
      runsAffected: plan.merge.reduce((s, m) => s + m.runs, 0),
    },
    details: Array.from(plan.details.values()).sort(
      (a, b) => a.equipment.localeCompare(b.equipment, "pt-BR") || a.level - b.level
    ),
  };
}

// GET — prévia (não altera nada)
export async function GET() {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const scope = await loadScope(session.user.tenantId);
  const plan = buildPlan(scope);
  return NextResponse.json(serialize(scope, plan));
}

// POST — aplica (idempotente: rodar de novo não muda nada)
export async function POST(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const tenantId = session.user.tenantId;
  const scope = await loadScope(tenantId);
  const plan = buildPlan(scope);

  let merged = 0;
  let runsMoved = 0;
  let reassigned = 0;
  let created = 0;

  // 1) Unifica duplicados primeiro, para liberar a constraint única antes de reapontar
  for (const m of plan.merge) {
    const r = await prisma.run.updateMany({
      where: { analyteMaterialId: m.fromAmId },
      data: { analyteMaterialId: m.toAmId },
    });
    runsMoved += r.count;
    await prisma.analyteMaterial.delete({ where: { id: m.fromAmId } });
    merged++;
  }

  // 2) Reaponta para o material do nível certo
  for (const r of plan.reassign) {
    await prisma.analyteMaterial.update({
      where: { id: r.amId },
      data: { materialId: r.toMaterialId },
    });
    reassigned++;
  }

  // 3) Cria os vínculos de nível que faltavam
  for (const c of plan.create) {
    try {
      await prisma.analyteMaterial.create({
        data: {
          analyteId: c.analyteId,
          equipmentId: c.equipmentId,
          materialId: c.materialId,
          level: c.level,
          status: c.status,
        },
      });
      created++;
    } catch {
      // Já existia (corrida concorrente) — idempotente, segue.
    }
  }

  const result = { reassigned, created, merged, runsMoved };

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "admin.repairControlLevels",
    entity: "Tenant",
    entityId: tenantId,
    meta: result,
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true, result });
}
