import { prisma } from "@/lib/db";
import { RunStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const maxDuration = 300;

interface QCSample {
  id: number;
  name: string;
  batch: string;
  manufacturer: string;
  expires: string;
}

interface QCRun {
  first: {
    values: { level1: number | null; level2: number | null; level3: number | null };
    date: string;
    user: string;
  };
  sample: {
    level1: QCSample | null;
    level2: QCSample | null;
    level3: QCSample | null;
  };
  id: number;
  deleted: boolean;
}

interface QCControl {
  controlId: number;
  analyteName: string;
  equipmentName: string;
  runs: QCRun[];
}

interface QCExport {
  extractedAt: string;
  source: string;
  controls: QCControl[];
}

// POST /api/admin/import-qualichart-runs
// Importa corridas históricas do qualichart-export.json gerado pelo script de extração.
// Idempotente: ignora corridas já presentes por (analyteMaterialId, value, dia).
// Requer ADMIN ou SUPERADMIN.
export async function POST(req: Request) {
  const { session, error } = await requireRole(["SUPERADMIN", "ADMIN"]);
  if (error) return error;
  if (!session.user.unitId) {
    return NextResponse.json({ error: "Usuário sem unidade vinculada" }, { status: 400 });
  }

  // Tenta encontrar o arquivo em dois locais
  const candidates = [
    join(process.cwd(), "prisma", "seed-data", "qualichart-export.json"),
    join(process.cwd(), "..", "base", "extract-v2", "qualichart-export (25).json"),
    join(process.cwd(), "..", "base", "extract", "qualichart-export.json"),
  ];
  const filePath = candidates.find((p) => existsSync(p));
  if (!filePath) {
    return NextResponse.json(
      {
        error:
          "Arquivo qualichart-export.json não encontrado. Copie-o para prisma/seed-data/qualichart-export.json",
      },
      { status: 500 }
    );
  }

  let data: QCExport;
  try {
    data = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Erro ao ler arquivo: ${msg}` }, { status: 500 });
  }

  const tenantId = session.user.tenantId;
  const unitId = session.user.unitId;
  const userId = session.user.id;

  const summary = {
    controlsProcessed: 0,
    materialsCreated: 0,
    analyteMaterialsCreated: 0,
    runsCreated: 0,
    runsSkipped: 0,
    deletedSkipped: 0,
    skippedControls: [] as string[],
  };

  // ── Caches em memória para evitar round-trips repetidos ───────────────────
  const equipCache = new Map<string, string>(); // name → id
  const analyteCache = new Map<string, string>(); // "name_lower:equipId" → id
  const materialCache = new Map<string, string>(); // "name::lot" → id
  const amCache = new Map<string, string>(); // "analyteId:equipId:materialId:level" → id

  // Pré-carrega corridas existentes para deduplicação O(1)
  const existingRuns = await prisma.run.findMany({
    where: { analyte: { unitRel: { tenantId } } },
    select: { analyteMaterialId: true, value: true, runAt: true },
  });
  const existingKeys = new Set<string>();
  for (const r of existingRuns) {
    if (r.analyteMaterialId) {
      existingKeys.add(
        `${r.analyteMaterialId}:${r.value}:${r.runAt.toISOString().slice(0, 10)}`
      );
    }
  }

  // Buffer de corridas a criar (flush em lotes de 500)
  type RunInput = {
    analyteId: string;
    analyteMaterialId: string;
    equipmentId: string;
    userId: string;
    value: number;
    runAt: Date;
    status: RunStatus;
    violations: string[];
    note: string;
  };
  const buffer: RunInput[] = [];

  async function flush(force = false) {
    while (buffer.length >= 500 || (force && buffer.length > 0)) {
      const batch = buffer.splice(0, 500);
      await prisma.run.createMany({ data: batch });
      summary.runsCreated += batch.length;
    }
  }

  async function getEquip(name: string): Promise<string | null> {
    if (equipCache.has(name)) return equipCache.get(name)!;
    const eq = await prisma.equipment.findFirst({
      where: { name, unit: { tenantId } },
      select: { id: true },
    });
    if (!eq) return null;
    equipCache.set(name, eq.id);
    return eq.id;
  }

  async function getAnalyte(name: string, equipId: string): Promise<string | null> {
    const key = `${name.toLowerCase()}:${equipId}`;
    if (analyteCache.has(key)) return analyteCache.get(key)!;
    const a = await prisma.analyte.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, equipmentId: equipId, unitRel: { tenantId } },
      select: { id: true },
    });
    if (!a) return null;
    analyteCache.set(key, a.id);
    return a.id;
  }

  // Resolve o analito do NÍVEL correto (cria se faltar, herdando atributos de
  // outro nível do mesmo exame). Evita amontoar N1/N2/N3 sob um único analito.
  async function getAnalyteForLevel(
    name: string,
    equipId: string,
    level: number,
    materialId: string
  ): Promise<string> {
    const key = `${name.toLowerCase()}:${equipId}:L${level}`;
    if (analyteCache.has(key)) return analyteCache.get(key)!;
    let a = await prisma.analyte.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, equipmentId: equipId, level, unitRel: { tenantId } },
      select: { id: true },
    });
    if (!a) {
      const template = await prisma.analyte.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, equipmentId: equipId, unitRel: { tenantId } },
        select: { unit: true, decimalPlaces: true, maxImprecision: true, imprecisionSource: true, westgardRules: true },
      });
      a = await prisma.analyte.create({
        data: {
          unitId,
          equipmentId: equipId,
          materialId,
          name,
          level,
          unit: template?.unit ?? null,
          decimalPlaces: template?.decimalPlaces ?? 3,
          maxImprecision: template?.maxImprecision ?? null,
          imprecisionSource: template?.imprecisionSource ?? null,
          ...(template?.westgardRules != null
            ? { westgardRules: template.westgardRules as Prisma.InputJsonValue }
            : {}),
        },
        select: { id: true },
      });
    }
    analyteCache.set(key, a.id);
    return a.id;
  }

  async function getMaterial(name: string, lot: string): Promise<string> {
    const lotTrimmed = lot.trim();
    const key = `${name}::${lotTrimmed}`;
    if (materialCache.has(key)) return materialCache.get(key)!;
    let mat = await prisma.material.findFirst({
      where: { name, lot: lotTrimmed, unit: { tenantId } },
      select: { id: true },
    });
    if (!mat) {
      mat = await prisma.material.create({
        data: { name, lot: lotTrimmed, unitId },
        select: { id: true },
      });
      summary.materialsCreated++;
    }
    materialCache.set(key, mat.id);
    return mat.id;
  }

  async function getAM(analyteId: string, equipId: string, matId: string, level: number): Promise<string> {
    const key = `${analyteId}:${equipId}:${matId}:${level}`;
    if (amCache.has(key)) return amCache.get(key)!;
    let am = await prisma.analyteMaterial.findFirst({
      where: { analyteId, equipmentId: equipId, materialId: matId, level },
      select: { id: true },
    });
    if (!am) {
      am = await prisma.analyteMaterial.create({
        data: { analyteId, equipmentId: equipId, materialId: matId, level, status: "PRONTO" },
        select: { id: true },
      });
      summary.analyteMaterialsCreated++;
    }
    amCache.set(key, am.id);
    return am.id;
  }

  const LEVELS = [
    { level: 1, key: "level1" as const },
    { level: 2, key: "level2" as const },
    { level: 3, key: "level3" as const },
  ];

  for (const ctrl of data.controls) {
    summary.controlsProcessed++;

    const equipId = await getEquip(ctrl.equipmentName);
    if (!equipId) {
      summary.skippedControls.push(`Equipamento não encontrado: ${ctrl.equipmentName}`);
      continue;
    }

    const anyAnalyte = await getAnalyte(ctrl.analyteName, equipId);
    if (!anyAnalyte) {
      summary.skippedControls.push(`Analito não encontrado: ${ctrl.analyteName} / ${ctrl.equipmentName}`);
      continue;
    }

    for (const run of ctrl.runs) {
      if (run.deleted) {
        summary.deletedSkipped++;
        continue;
      }

      const runAt = new Date(run.first.date);
      const dayKey = runAt.toISOString().slice(0, 10);

      for (const { level, key } of LEVELS) {
        const value = run.first.values[key];
        if (value === null || value === undefined) continue;

        const sample = run.sample[key];
        if (!sample) continue;

        const matId = await getMaterial(sample.name, sample.batch);
        const analyteId = await getAnalyteForLevel(ctrl.analyteName, equipId, level, matId);
        const amId = await getAM(analyteId, equipId, matId, level);

        const runKey = `${amId}:${value}:${dayKey}`;
        if (existingKeys.has(runKey)) {
          summary.runsSkipped++;
          continue;
        }
        existingKeys.add(runKey);

        buffer.push({
          analyteId,
          analyteMaterialId: amId,
          equipmentId: equipId,
          userId,
          value,
          runAt,
          status: RunStatus.OK,
          violations: [],
          note: `QualiChart #${run.id}`,
        });
      }

      await flush();
    }
  }

  await flush(true);

  await logAudit({
    tenantId,
    userId,
    action: "qualichart_runs.import",
    entity: "Tenant",
    entityId: tenantId,
    meta: { extractedAt: data.extractedAt, controls: data.controls.length, filePath, ...summary },
    ip: getClientIp(req),
  });

  return NextResponse.json({
    ok: true,
    summary,
    source: { extractedAt: data.extractedAt, controls: data.controls.length, filePath },
  });
}
