import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { equipmentGroupKey } from "@/lib/equipment-group";

// Resolve grupo/exame/nível a partir de um analyteId do tenant.
async function resolveScope(tenantId: string, analyteId: string) {
  const analyte = await prisma.analyte.findFirst({
    where: { id: analyteId, unitRel: { tenantId } },
    include: { equipment: { select: { name: true } } },
  });
  if (!analyte) return null;
  return {
    groupKey: equipmentGroupKey(analyte.equipment?.name ?? ""),
    analyteName: analyte.name,
    level: analyte.level,
  };
}

// POST /api/control-targets — cria/atualiza a média/DP-alvo manual do grupo.
// Body: { analyteId, mean, sd }
export async function POST(req: Request) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { analyteId, mean, sd } = await req.json();
  if (!analyteId) return NextResponse.json({ error: "analyteId obrigatório" }, { status: 400 });

  const meanNum = Number(String(mean).replace(",", "."));
  const sdNum = Number(String(sd).replace(",", "."));
  if (!isFinite(meanNum)) return NextResponse.json({ error: "Média inválida" }, { status: 400 });
  if (!isFinite(sdNum) || sdNum <= 0)
    return NextResponse.json({ error: "DP inválido (deve ser > 0)" }, { status: 400 });

  const scope = await resolveScope(session.user.tenantId, analyteId);
  if (!scope) return NextResponse.json({ error: "Analito não encontrado" }, { status: 404 });

  const target = await prisma.controlTarget.upsert({
    where: {
      tenantId_groupKey_analyteName_level: {
        tenantId: session.user.tenantId,
        groupKey: scope.groupKey,
        analyteName: scope.analyteName,
        level: scope.level,
      },
    },
    create: {
      tenantId: session.user.tenantId,
      groupKey: scope.groupKey,
      analyteName: scope.analyteName,
      level: scope.level,
      mean: meanNum,
      sd: sdNum,
    },
    update: { mean: meanNum, sd: sdNum },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "controlTarget.set",
    entity: "ControlTarget",
    entityId: target.id,
    meta: { groupKey: scope.groupKey, analyteName: scope.analyteName, level: scope.level, mean: meanNum, sd: sdNum },
    ip: getClientIp(req),
  });

  return NextResponse.json(target);
}

// DELETE /api/control-targets?analyteId=... — remove o alvo manual (volta ao automático).
export async function DELETE(req: Request) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const url = new URL(req.url);
  const analyteId = url.searchParams.get("analyteId");
  if (!analyteId) return NextResponse.json({ error: "analyteId obrigatório" }, { status: 400 });

  const scope = await resolveScope(session.user.tenantId, analyteId);
  if (!scope) return NextResponse.json({ error: "Analito não encontrado" }, { status: 404 });

  const deleted = await prisma.controlTarget.deleteMany({
    where: {
      tenantId: session.user.tenantId,
      groupKey: scope.groupKey,
      analyteName: scope.analyteName,
      level: scope.level,
    },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "controlTarget.clear",
    entity: "ControlTarget",
    entityId: `${scope.groupKey}|${scope.analyteName}|${scope.level}`,
    meta: { ...scope, removed: deleted.count },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true, removed: deleted.count });
}
