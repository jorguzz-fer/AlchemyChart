import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { readFileSync } from "fs";
import { join } from "path";

interface SeedAnalyte {
  refId: string;
  name: string;
  unit: string | null;
  decimalPlaces: number;
  maxImprecision: number | null;
  imprecisionSource: string | null;
  westgardRules: Record<string, "OFF" | "ALERT" | "REJECT">;
}

interface SeedMaterial {
  analyteRefId: string;
  materialName: string;
  equipmentName: string;
  situacao: string;
  level: number;
}

interface SeedData {
  generatedAt: string;
  source: string;
  analytes: SeedAnalyte[];
  materials: SeedMaterial[];
}

const STATUS_MAP: Record<string, string> = {
  "Pronto": "PRONTO",
  "Preparo": "PREPARO",
  "Expirado": "EXPIRADO",
  "Desabilitado": "DESABILITADO",
};

// POST /api/admin/import-qualichart
// Importa dados do seed-data/qualichart.json (gerado a partir do
// qualichart_analitos_estruturado.xlsx) para o tenant + unit do usuário logado.
// Idempotente: pode rodar várias vezes sem duplicar.
//
// Permissão: ADMIN ou SUPERADMIN.
export async function POST(req: Request) {
  const { session, error } = await requireRole(["SUPERADMIN", "ADMIN"]);
  if (error) return error;
  if (!session.user.unitId) {
    return NextResponse.json({ error: "Usuário sem unidade vinculada" }, { status: 400 });
  }

  // Carrega seed JSON
  let seed: SeedData;
  try {
    const seedPath = join(process.cwd(), "prisma", "seed-data", "qualichart.json");
    const raw = readFileSync(seedPath, "utf8");
    seed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Seed data não encontrado: ${msg}` }, { status: 500 });
  }

  const tenantId = session.user.tenantId;
  const unitId = session.user.unitId;

  const summary = {
    analytesUpdated: 0,
    analytesCreatedDuringMaterials: 0,
    equipmentsCreated: 0,
    materialsCreated: 0,
    analyteMaterialsCreated: 0,
    analyteMaterialsExisting: 0,
    legacyCleaned: 0,        // AnalyteMaterials órfãs (sem corridas) removidas
    legacyPreserved: 0,      // AnalyteMaterials órfãs preservadas por terem corridas
    skippedRows: [] as string[],
  };

  // ── 1) Atualiza Analytes existentes com params do seed ──────────────────
  // Match por nome (em qualquer unit). Sincroniza fields exam-level entre
  // duplicatas com mesmo nome+unidade.
  for (const seedA of seed.analytes) {
    const existing = await prisma.analyte.findMany({
      where: { name: seedA.name, unitRel: { tenantId } },
    });

    if (existing.length === 0) continue; // será criado na fase de materials

    for (const a of existing) {
      await prisma.analyte.update({
        where: { id: a.id },
        data: {
          unit: seedA.unit,
          decimalPlaces: seedA.decimalPlaces,
          maxImprecision: seedA.maxImprecision,
          imprecisionSource: seedA.imprecisionSource,
          westgardRules: seedA.westgardRules,
        },
      });
      summary.analytesUpdated++;
    }
  }

  // ── 2) Cria Equipments faltantes ────────────────────────────────────────
  const equipmentNames = Array.from(new Set(seed.materials.map((m) => m.equipmentName)));
  const equipmentByName = new Map<string, { id: string; name: string }>();
  for (const name of equipmentNames) {
    let eq = await prisma.equipment.findFirst({
      where: { name, unit: { tenantId } },
      select: { id: true, name: true },
    });
    if (!eq) {
      eq = await prisma.equipment.create({
        data: { name, unitId },
        select: { id: true, name: true },
      });
      summary.equipmentsCreated++;
    }
    equipmentByName.set(name, eq);
  }

  // ── 3) Cria Materials faltantes ─────────────────────────────────────────
  const materialNames = Array.from(new Set(seed.materials.map((m) => m.materialName)));
  const materialByName = new Map<string, { id: string; name: string }>();
  for (const name of materialNames) {
    let mat = await prisma.material.findFirst({
      where: { name, unit: { tenantId } },
      select: { id: true, name: true },
    });
    if (!mat) {
      mat = await prisma.material.create({
        data: { name, unitId },
        select: { id: true, name: true },
      });
      summary.materialsCreated++;
    }
    materialByName.set(name, mat);
  }

  // ── 4) Map seed analyte refId → seed data ───────────────────────────────
  const seedById = new Map(seed.analytes.map((a) => [a.refId, a]));

  // ── 5) Para cada vínculo de material, garante Analyte legado + AnalyteMaterial ──
  for (const m of seed.materials) {
    const seedA = seedById.get(m.analyteRefId);
    if (!seedA) {
      summary.skippedRows.push(`Material com refId desconhecido: ${m.analyteRefId}`);
      continue;
    }

    const eq = equipmentByName.get(m.equipmentName);
    const mat = materialByName.get(m.materialName);
    if (!eq || !mat) continue;

    const status = STATUS_MAP[m.situacao] ?? "PRONTO";
    const level = Math.min(3, Math.max(1, m.level || 1));

    // Encontra ou cria o Analyte legado para esta combinação
    let analyte = await prisma.analyte.findFirst({
      where: {
        name: seedA.name,
        equipmentId: eq.id,
        materialId: mat.id,
        level,
        unitRel: { tenantId },
      },
      select: { id: true },
    });

    if (!analyte) {
      analyte = await prisma.analyte.create({
        data: {
          unitId,
          equipmentId: eq.id,
          materialId: mat.id,
          name: seedA.name,
          unit: seedA.unit,
          level,
          decimalPlaces: seedA.decimalPlaces,
          maxImprecision: seedA.maxImprecision,
          imprecisionSource: seedA.imprecisionSource,
          westgardRules: seedA.westgardRules,
        },
        select: { id: true },
      });
      summary.analytesCreatedDuringMaterials++;
    }

    // Encontra ou cria o AnalyteMaterial
    const existingAM = await prisma.analyteMaterial.findFirst({
      where: {
        analyteId: analyte.id,
        equipmentId: eq.id,
        materialId: mat.id,
        level,
      },
      select: { id: true },
    });

    if (existingAM) {
      summary.analyteMaterialsExisting++;
    } else {
      await prisma.analyteMaterial.create({
        data: {
          analyteId: analyte.id,
          equipmentId: eq.id,
          materialId: mat.id,
          level,
          status,
        },
      });
      summary.analyteMaterialsCreated++;
    }
  }

  // ── 6) Cleanup de vínculos legados não cobertos pelo seed ──────────────
  // Para cada (nome de analito, equipamento) presente no seed, encontra
  // AnalyteMaterials no DB que NÃO casam com nenhuma combinação do seed.
  // Remove apenas AMs com 0 corridas (preserva histórico real do laboratório).

  // Set de combinações esperadas, pelas chaves (analyteName, equipName, materialName, level)
  const expectedCombos = new Set<string>();
  for (const m of seed.materials) {
    expectedCombos.add(`${m.analyteRefId ? seedById.get(m.analyteRefId)?.name ?? "" : ""}||${m.equipmentName}||${m.materialName}||${m.level}`);
  }

  // Set de (analyteName, equipName) que o seed cobre — só deletamos AMs DENTRO
  // desses escopos para não tocar em combos que o seed não fala nada
  const seedScope = new Set<string>();
  for (const m of seed.materials) {
    const aName = seedById.get(m.analyteRefId)?.name;
    if (aName) seedScope.add(`${aName}||${m.equipmentName}`);
  }

  // Busca todas as AMs cujos analitos têm nome cobertos pelo seed
  const seedAnalyteNames = Array.from(new Set(seed.analytes.map((a) => a.name)));
  const candidateAMs = await prisma.analyteMaterial.findMany({
    where: {
      material: { unit: { tenantId } },
      analyte: { name: { in: seedAnalyteNames } },
    },
    include: {
      analyte: { select: { id: true, name: true } },
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
      _count: { select: { runs: true } },
    },
  });

  for (const am of candidateAMs) {
    const scopeKey = `${am.analyte.name}||${am.equipment.name}`;
    if (!seedScope.has(scopeKey)) continue; // seed não fala nada desse escopo, pula

    const comboKey = `${am.analyte.name}||${am.equipment.name}||${am.material.name}||${am.level}`;
    if (expectedCombos.has(comboKey)) continue; // está no seed, mantém

    // É um vínculo legado — remove se não tem corridas
    if (am._count.runs > 0) {
      summary.legacyPreserved++;
      summary.skippedRows.push(
        `Vínculo legado preservado (tem ${am._count.runs} corridas): ${am.analyte.name} / ${am.equipment.name} / ${am.material.name} / N${am.level}`
      );
      continue;
    }

    // Deleta a AnalyteMaterial
    await prisma.analyteMaterial.delete({ where: { id: am.id } });

    // Se o legacy Analyte ficou órfão (sem outras AMs e sem runs próprios),
    // remove também — evita poluir a lista deduplicada com placeholders mortos
    const remainingAMs = await prisma.analyteMaterial.count({
      where: { analyteId: am.analyte.id },
    });
    if (remainingAMs === 0) {
      const runCount = await prisma.run.count({ where: { analyteId: am.analyte.id } });
      if (runCount === 0) {
        await prisma.analyte.delete({ where: { id: am.analyte.id } });
      }
    }
    summary.legacyCleaned++;
  }

  // ── 7) Audit log ────────────────────────────────────────────────────────
  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "qualichart.import",
    entity: "Tenant",
    entityId: tenantId,
    meta: {
      seedAnalytes: seed.analytes.length,
      seedMaterials: seed.materials.length,
      ...summary,
    },
    ip: getClientIp(req),
  });

  return NextResponse.json({
    ok: true,
    summary,
    seed: {
      analytes: seed.analytes.length,
      materials: seed.materials.length,
      generatedAt: seed.generatedAt,
    },
  });
}
