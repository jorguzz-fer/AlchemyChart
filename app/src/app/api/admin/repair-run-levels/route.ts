import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { calculateStats } from "@/lib/stats";

export const maxDuration = 300;

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN"] as const;
const SETUP_THRESHOLD = 20;

// Corrige o vínculo de nível das corridas importadas.
// A importação do QualiChart ligava TODAS as corridas de um controle a um
// único analito (resolvia por nome+equipamento, ignorando o nível). O nível
// real fica no AnalyteMaterial. Aqui detectamos AnalyteMaterials cujo nível
// difere do nível do analito-pai ("mal-alocados") e re-vinculamos as corridas
// para o analito do nível correto (criando-o se não existir).

type AnalyteRow = {
  id: string;
  name: string;
  equipmentId: string;
  level: number;
  unitId: string;
  materialId: string;
  unit: string | null;
  decimalPlaces: number;
  maxImprecision: number | null;
  imprecisionSource: string | null;
  westgardRules: Prisma.JsonValue;
};

async function loadScope(tenantId: string) {
  const [analytes, ams, equipments] = await Promise.all([
    prisma.analyte.findMany({
      where: { unitRel: { tenantId } },
      select: {
        id: true, name: true, equipmentId: true, level: true, unitId: true,
        materialId: true, unit: true, decimalPlaces: true, maxImprecision: true,
        imprecisionSource: true, westgardRules: true,
      },
    }) as Promise<AnalyteRow[]>,
    prisma.analyteMaterial.findMany({
      where: { analyte: { unitRel: { tenantId } } },
      select: {
        id: true, analyteId: true, equipmentId: true, materialId: true, level: true,
        _count: { select: { runs: true } },
      },
    }),
    prisma.equipment.findMany({
      where: { unit: { tenantId } },
      select: { id: true, name: true },
    }),
  ]);

  const byId = new Map(analytes.map((a) => [a.id, a]));
  const eqName = new Map(equipments.map((e) => [e.id, e.name]));

  // AM mal-alocado: nível do vínculo difere do nível do analito-pai.
  // Restringe a N1/N2 (am.level <= 2) para não recriar nível 3 — que é
  // tratado separadamente pela ferramenta de exclusão de nível 3.
  const misfiled = ams.filter((am) => {
    const parent = byId.get(am.analyteId);
    return parent && am.level <= 2 && parent.level !== am.level;
  });

  return { analytes, byId, eqName, ams, misfiled };
}

function summarize(
  misfiled: Awaited<ReturnType<typeof loadScope>>["misfiled"],
  byId: Awaited<ReturnType<typeof loadScope>>["byId"],
  byKey: Set<string>,
  eqName: Map<string, string>
) {
  const groups = new Map<
    string,
    { exam: string; equipment: string; fromLevel: number; toLevel: number; runs: number; needsCreate: boolean }
  >();
  let totalRuns = 0;
  let toCreate = 0;
  const willCreate = new Set<string>();

  for (const am of misfiled) {
    const parent = byId.get(am.analyteId)!;
    const targetKey = `${parent.name}|${parent.equipmentId}|${am.level}`;
    const needsCreate = !byKey.has(targetKey) && !willCreate.has(targetKey);
    if (needsCreate) {
      willCreate.add(targetKey);
      toCreate++;
    }
    const gKey = `${parent.name}|${parent.equipmentId}|${parent.level}->${am.level}`;
    const g = groups.get(gKey) ?? {
      exam: parent.name,
      equipment: eqName.get(parent.equipmentId) ?? parent.equipmentId,
      fromLevel: parent.level,
      toLevel: am.level,
      runs: 0,
      needsCreate: false,
    };
    g.runs += am._count.runs;
    g.needsCreate = g.needsCreate || !byKey.has(targetKey);
    groups.set(gKey, g);
    totalRuns += am._count.runs;
  }

  const details = Array.from(groups.values()).sort((a, b) => b.runs - a.runs);
  return {
    misfiledLinks: misfiled.length,
    runsAffected: totalRuns,
    analytesToCreate: toCreate,
    details,
  };
}

// GET — prévia (não altera nada)
export async function GET() {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const { misfiled, byId, analytes, eqName } = await loadScope(session.user.tenantId);
  const byKey = new Set(analytes.map((a) => `${a.name}|${a.equipmentId}|${a.level}`));
  return NextResponse.json(summarize(misfiled, byId, byKey, eqName));
}

// POST — executa a correção (idempotente; pode rodar de novo com segurança)
export async function POST(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const tenantId = session.user.tenantId;
  const { misfiled, byId, ams } = await loadScope(tenantId);

  if (misfiled.length === 0) {
    return NextResponse.json({
      ok: true,
      result: { runsRelinked: 0, amsMoved: 0, amsMerged: 0, analytesCreated: 0, statsRecomputed: 0 },
      message: "Nenhuma corrida mal-alocada encontrada.",
    });
  }

  // Índices auxiliares
  const analyteByKey = new Map<string, string>(); // name|equip|level -> analyteId
  for (const a of byId.values()) analyteByKey.set(`${a.name}|${a.equipmentId}|${a.level}`, a.id);
  const amByKey = new Map<string, string>(); // analyteId|equip|material|level -> amId
  for (const am of ams) amByKey.set(`${am.analyteId}|${am.equipmentId}|${am.materialId}|${am.level}`, am.id);

  const affected = new Set<string>();
  let runsRelinked = 0;
  let amsMoved = 0;
  let amsMerged = 0;
  let analytesCreated = 0;

  for (const am of misfiled) {
    const parent = byId.get(am.analyteId)!;
    affected.add(parent.id);

    const targetKey = `${parent.name}|${parent.equipmentId}|${am.level}`;
    let targetId = analyteByKey.get(targetKey);
    if (!targetId) {
      const created = await prisma.analyte.create({
        data: {
          unitId: parent.unitId,
          equipmentId: parent.equipmentId,
          materialId: parent.materialId,
          name: parent.name,
          unit: parent.unit,
          level: am.level,
          decimalPlaces: parent.decimalPlaces,
          maxImprecision: parent.maxImprecision,
          imprecisionSource: parent.imprecisionSource,
          westgardRules: parent.westgardRules ?? Prisma.JsonNull,
        },
        select: { id: true },
      });
      targetId = created.id;
      analyteByKey.set(targetKey, targetId);
      analytesCreated++;
    }
    affected.add(targetId);

    // Colisão: o analito destino já tem um AM para (equip, material, nível)?
    const collisionKey = `${targetId}|${am.equipmentId}|${am.materialId}|${am.level}`;
    const existingAmId = amByKey.get(collisionKey);

    if (existingAmId && existingAmId !== am.id) {
      // Merge: corridas deste AM passam para o AM existente + analito destino
      const r = await prisma.run.updateMany({
        where: { analyteMaterialId: am.id },
        data: { analyteId: targetId, analyteMaterialId: existingAmId },
      });
      runsRelinked += r.count;
      await prisma.analyteMaterial.delete({ where: { id: am.id } });
      amsMerged++;
    } else {
      const r = await prisma.run.updateMany({
        where: { analyteMaterialId: am.id },
        data: { analyteId: targetId },
      });
      runsRelinked += r.count;
      await prisma.analyteMaterial.update({ where: { id: am.id }, data: { analyteId: targetId } });
      amByKey.set(collisionKey, am.id);
      amsMoved++;
    }
  }

  // Recalcula StatPeriod "USO" dos analitos afetados (origem e destino)
  let statsRecomputed = 0;
  for (const aid of affected) {
    const runs = await prisma.run.findMany({ where: { analyteId: aid }, select: { value: true } });
    const existing = await prisma.statPeriod.findFirst({
      where: { analyteId: aid, period: "USO" },
      orderBy: { createdAt: "desc" },
    });
    if (runs.length >= SETUP_THRESHOLD) {
      const s = calculateStats(runs.map((r) => r.value));
      if (s) {
        if (existing) {
          await prisma.statPeriod.update({ where: { id: existing.id }, data: { mean: s.mean, sd: s.sd, cv: s.cv, n: s.n } });
        } else {
          await prisma.statPeriod.create({ data: { analyteId: aid, period: "USO", mean: s.mean, sd: s.sd, cv: s.cv, n: s.n } });
        }
        statsRecomputed++;
      }
    } else if (existing) {
      await prisma.statPeriod.delete({ where: { id: existing.id } });
      statsRecomputed++;
    }
  }

  const result = { runsRelinked, amsMoved, amsMerged, analytesCreated, statsRecomputed };

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "admin.repairRunLevels",
    entity: "Tenant",
    entityId: tenantId,
    meta: result,
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true, result });
}
