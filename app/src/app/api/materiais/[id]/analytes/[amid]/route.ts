import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

// PATCH /api/materiais/[id]/analytes/[amid]
// Atualiza Xm/DP/level/status de uma AnalyteMaterial existente.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; amid: string }> }
) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id: materialId, amid } = await params;
  const body = await req.json();
  const { manufacturerMean, manufacturerSD, level, status } = body;

  // Valida ownership via tenant
  const am = await prisma.analyteMaterial.findFirst({
    where: { id: amid, materialId, material: { unit: { tenantId: session.user.tenantId } } },
  });
  if (!am) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const data: {
    manufacturerMean?: number | null;
    manufacturerSD?: number | null;
    level?: number;
    status?: string;
  } = {};
  if (manufacturerMean !== undefined) {
    data.manufacturerMean = (manufacturerMean === null || manufacturerMean === "")
      ? null
      : Number(manufacturerMean);
  }
  if (manufacturerSD !== undefined) {
    data.manufacturerSD = (manufacturerSD === null || manufacturerSD === "")
      ? null
      : Number(manufacturerSD);
  }
  if (level !== undefined) data.level = Math.min(3, Math.max(1, Number(level) || 1));
  if (status !== undefined) {
    const allowed = ["PRONTO", "PREPARO", "EXPIRADO", "DESABILITADO"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    data.status = status;
  }

  const updated = await prisma.analyteMaterial.update({
    where: { id: amid },
    data,
    include: {
      analyte: { select: { id: true, name: true, unit: true } },
      equipment: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyteMaterial.update",
    entity: "AnalyteMaterial",
    entityId: amid,
    meta: { fieldsChanged: Object.keys(data) },
    ip: getClientIp(req),
  });

  return NextResponse.json(updated);
}

// DELETE /api/materiais/[id]/analytes/[amid]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; amid: string }> }
) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id: materialId, amid } = await params;

  const am = await prisma.analyteMaterial.findFirst({
    where: { id: amid, materialId, material: { unit: { tenantId: session.user.tenantId } } },
    include: { _count: { select: { runs: true } } },
  });
  if (!am) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Bloqueia exclusão se houver corridas — usuário deve marcar DESABILITADO em vez disso
  if (am._count.runs > 0) {
    return NextResponse.json(
      {
        error: `Não é possível remover: existem ${am._count.runs} corrida(s) associada(s). Use status DESABILITADO em vez disso.`,
      },
      { status: 409 }
    );
  }

  await prisma.analyteMaterial.delete({ where: { id: amid } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyteMaterial.delete",
    entity: "AnalyteMaterial",
    entityId: amid,
    meta: { materialId, analyteId: am.analyteId, level: am.level },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
