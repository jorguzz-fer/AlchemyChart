import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.equipment.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, model, serial, active, lastMaint, nextMaint } = body;

  const data: {
    name?: string;
    model?: string | null;
    serial?: string | null;
    active?: boolean;
    lastMaint?: Date | null;
    nextMaint?: Date | null;
  } = {};
  if (name !== undefined) data.name = name.trim();
  if (model !== undefined) data.model = model?.trim() || null;
  if (serial !== undefined) data.serial = serial?.trim() || null;
  if (active !== undefined) data.active = active;
  if (lastMaint !== undefined) data.lastMaint = lastMaint ? new Date(lastMaint) : null;
  if (nextMaint !== undefined) data.nextMaint = nextMaint ? new Date(nextMaint) : null;

  const updated = await prisma.equipment.update({ where: { id }, data });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "equipment.update",
    entity: "Equipment",
    entityId: updated.id,
    meta: { fieldsChanged: Object.keys(data) },
    ip: getClientIp(req),
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.equipment.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.equipment.delete({ where: { id } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "equipment.delete",
    entity: "Equipment",
    entityId: id,
    meta: { name: existing.name },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
