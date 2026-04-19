import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const items = await prisma.nonConformity.findMany({
    where: { run: { analyte: { unitRel: { tenantId: session.user.tenantId } } } },
    include: {
      run: {
        include: {
          analyte: { select: { id: true, name: true, level: true } },
          equipment: { select: { id: true, name: true } },
          user: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

export async function PATCH(req: Request) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id, action } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existing = await prisma.nonConformity.findFirst({
    where: { id, run: { analyte: { unitRel: { tenantId: session.user.tenantId } } } },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nc = await prisma.nonConformity.update({
    where: { id },
    data: { action: action?.trim() || null, resolvedAt: new Date() },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "nonconformity.resolve",
    entity: "NonConformity",
    entityId: nc.id,
    meta: { actionText: nc.action },
    ip: getClientIp(req),
  });

  return NextResponse.json(nc);
}
