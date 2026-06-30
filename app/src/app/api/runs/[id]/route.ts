import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_WRITE, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { checkWestgard } from "@/lib/westgard";
import { calculateStats } from "@/lib/stats";
import { equipmentGroupKey } from "@/lib/equipment-group";

const SETUP_THRESHOLD = 20;

// Recomputa StatPeriod e Westgard para todas as corridas do mesmo analito.
// Chamado após editar/deletar para manter consistência.
async function recomputeAnalyteStats(analyteId: string) {
  const runs = await prisma.run.findMany({
    where: { analyteId },
    orderBy: { runAt: "asc" },
    select: { id: true, value: true, runAt: true },
  });

  const analyte = await prisma.analyte.findUnique({
    where: { id: analyteId },
    select: {
      westgardRules: true,
      name: true,
      level: true,
      unitRel: { select: { tenantId: true } },
      equipment: { select: { name: true } },
    },
  });

  // Atualiza StatPeriod USO se atingiu threshold
  const existingStat = await prisma.statPeriod.findFirst({
    where: { analyteId, period: "USO" },
    orderBy: { createdAt: "desc" },
  });

  if (runs.length >= SETUP_THRESHOLD) {
    const values = runs.map((r) => r.value);
    const s = calculateStats(values);
    if (s) {
      if (existingStat) {
        await prisma.statPeriod.update({
          where: { id: existingStat.id },
          data: { mean: s.mean, sd: s.sd, cv: s.cv, n: s.n },
        });
      } else {
        await prisma.statPeriod.create({
          data: { analyteId, period: "USO", mean: s.mean, sd: s.sd, cv: s.cv, n: s.n },
        });
      }
    }
  } else if (existingStat) {
    // Caiu abaixo do threshold após delete — remove StatPeriod
    await prisma.statPeriod.delete({ where: { id: existingStat.id } });
  }

  // Recomputa Westgard de cada corrida.
  // Alvo manual do grupo (ControlTarget) tem prioridade sobre a StatPeriod "USO".
  const statForCheck =
    runs.length >= SETUP_THRESHOLD
      ? await prisma.statPeriod.findFirst({
          where: { analyteId, period: "USO" },
          orderBy: { createdAt: "desc" },
        })
      : null;

  const manualTarget = analyte
    ? await prisma.controlTarget.findUnique({
        where: {
          tenantId_groupKey_analyteName_level: {
            tenantId: analyte.unitRel.tenantId,
            groupKey: equipmentGroupKey(analyte.equipment?.name ?? ""),
            analyteName: analyte.name,
            level: analyte.level,
          },
        },
      })
    : null;

  const centerMean = manualTarget?.mean ?? (statForCheck ? statForCheck.mean : null);
  const centerSd = manualTarget?.sd ?? (statForCheck ? statForCheck.sd : null);

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const history = runs.slice(0, i).map((r) => r.value);
    let status: "OK" | "ALERT" | "REJECT" = "OK";
    let violations: string[] = [];

    if (centerMean != null && centerSd != null) {
      const result = checkWestgard(
        run.value,
        centerMean,
        centerSd,
        history,
        analyte?.westgardRules ?? null
      );
      status = result.status;
      violations = result.violations;
    }

    await prisma.run.update({
      where: { id: run.id },
      data: { status, violations },
    });
  }
}

// PATCH /api/runs/[id] — edita o valor e/ou nota da corrida
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_WRITE);
  if (error) return error;

  const { id } = await ctx.params;
  const body = await req.json();
  const { value, note } = body;

  const run = await prisma.run.findFirst({
    where: { id, analyte: { unitRel: { tenantId: session.user.tenantId } } },
    include: { analyte: { select: { id: true, name: true } } },
  });
  if (!run) return NextResponse.json({ error: "Corrida não encontrada" }, { status: 404 });

  const data: { value?: number; note?: string | null } = {};
  if (value !== undefined) {
    const numValue = Number(value);
    if (isNaN(numValue)) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    data.value = numValue;
  }
  if (note !== undefined) {
    data.note = note?.toString().trim() || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  await prisma.run.update({ where: { id }, data });

  // Recalcula stats e Westgard se valor mudou
  if (data.value !== undefined) {
    await recomputeAnalyteStats(run.analyteId);
  }

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "run.update",
    entity: "Run",
    entityId: id,
    meta: {
      analyteId: run.analyteId,
      analyteName: run.analyte.name,
      previousValue: run.value,
      newValue: data.value ?? run.value,
    },
    ip: getClientIp(req),
  });

  const updated = await prisma.run.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  return NextResponse.json(updated);
}

// DELETE /api/runs/[id] — remove a corrida
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await ctx.params;

  const run = await prisma.run.findFirst({
    where: { id, analyte: { unitRel: { tenantId: session.user.tenantId } } },
    include: { analyte: { select: { id: true, name: true } } },
  });
  if (!run) return NextResponse.json({ error: "Corrida não encontrada" }, { status: 404 });

  await prisma.run.delete({ where: { id } });
  await recomputeAnalyteStats(run.analyteId);

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "run.delete",
    entity: "Run",
    entityId: id,
    meta: {
      analyteId: run.analyteId,
      analyteName: run.analyte.name,
      value: run.value,
      runAt: run.runAt.toISOString(),
    },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
