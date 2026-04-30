import { prisma } from "@/lib/db";
import { checkWestgard } from "@/lib/westgard";
import { calculateStats } from "@/lib/stats";
import { NextResponse } from "next/server";
import { requireRole, ROLES_WRITE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

const SETUP_THRESHOLD = 20; // runs needed to establish StatPeriod

export async function POST(req: Request) {
  const { session, error } = await requireRole(ROLES_WRITE);
  if (error) return error;

  const body = await req.json();
  const { analyteId, value, note, level: rawLevel, analyteMaterialId: providedAmId } = body;

  if (!analyteId) return NextResponse.json({ error: "analyteId obrigatório" }, { status: 400 });
  const numValue = Number(value);
  if (isNaN(numValue)) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

  // Verify analyte belongs to this tenant — busca todos os AMs para auto-resolver
  const analyte = await prisma.analyte.findFirst({
    where: { id: analyteId, unitRel: { tenantId: session.user.tenantId } },
    include: {
      analyteMaterials: { include: { material: { select: { id: true, name: true } } } },
    },
  });
  if (!analyte) return NextResponse.json({ error: "Analito não encontrado" }, { status: 404 });

  // Resolve qual AnalyteMaterial vincular à corrida.
  // Prioridade: 1) providedAmId  2) AM no nível solicitado  3) primeiro AM do analito
  // Se nada existe e level foi passado, cria um AM novo com PREPARO + material
  // herdado (preferindo o AM existente em qualquer nível, fallback para a.materialId).
  const targetLevel = rawLevel != null ? Math.min(3, Math.max(1, Number(rawLevel) || 0)) : null;
  let analyteMaterialId: string | null = null;

  if (providedAmId && analyte.analyteMaterials.some((am) => am.id === providedAmId)) {
    analyteMaterialId = providedAmId;
  } else if (targetLevel) {
    const existing = analyte.analyteMaterials.find((am) => am.level === targetLevel);
    if (existing) {
      analyteMaterialId = existing.id;
    } else {
      // Auto-cria AM no nível solicitado, herdando material de outro AM ou do legado
      const refAm = analyte.analyteMaterials[0];
      const materialId = refAm?.material.id ?? analyte.materialId;
      const created = await prisma.analyteMaterial.create({
        data: {
          analyteId: analyte.id,
          equipmentId: analyte.equipmentId,
          materialId,
          level: targetLevel,
          status: "PREPARO",
        },
        select: { id: true },
      });
      analyteMaterialId = created.id;
    }
  } else {
    analyteMaterialId = analyte.analyteMaterials[0]?.id ?? null;
  }

  // Get existing runs for this analyte (chronological)
  const existingRuns = await prisma.run.findMany({
    where: { analyteId },
    orderBy: { runAt: "asc" },
    select: { value: true },
  });

  const history = existingRuns.map((r) => r.value);

  // Get active StatPeriod for Westgard check
  const statPeriod = await prisma.statPeriod.findFirst({
    where: { analyteId },
    orderBy: { createdAt: "desc" },
  });

  let status: "OK" | "ALERT" | "REJECT" = "OK";
  let violations: string[] = [];

  if (statPeriod && statPeriod.n >= SETUP_THRESHOLD) {
    // Passa westgardRules do analito — se null, checkWestgard usa DEFAULT_WESTGARD_RULES
    const result = checkWestgard(
      numValue,
      statPeriod.mean,
      statPeriod.sd,
      history,
      analyte.westgardRules
    );
    status = result.status;
    violations = result.violations;
  }

  // Save the run (popula tanto analyteId legado quanto analyteMaterialId novo)
  const run = await prisma.run.create({
    data: {
      analyteId,
      analyteMaterialId,
      equipmentId: analyte.equipmentId,
      userId: session.user.id,
      value: numValue,
      status,
      violations,
      note: note?.trim() || null,
    },
    include: {
      user: { select: { name: true } },
    },
  });

  // Auto-create StatPeriod after SETUP_THRESHOLD runs if none exists
  const totalRuns = history.length + 1;
  if (!statPeriod && totalRuns >= SETUP_THRESHOLD) {
    const allValues = [...history, numValue];
    const s = calculateStats(allValues);
    if (s) {
      await prisma.statPeriod.create({
        data: {
          analyteId,
          period: "USO",
          mean: s.mean,
          sd: s.sd,
          cv: s.cv,
          n: s.n,
        },
      });
    }
  }

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "run.create",
    entity: "Run",
    entityId: run.id,
    meta: {
      analyteId,
      analyteName: analyte.name,
      value: numValue,
      status,
      violations,
    },
    ip: getClientIp(req),
  });

  return NextResponse.json(run, { status: 201 });
}
