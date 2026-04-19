import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.material.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, lot, generation, expiresAt, active } = body;

  const data: {
    name?: string;
    lot?: string | null;
    generation?: string | null;
    expiresAt?: Date | null;
    active?: boolean;
  } = {};
  if (name !== undefined) data.name = name.trim();
  if (lot !== undefined) data.lot = lot?.trim() || null;
  if (generation !== undefined) data.generation = generation?.trim() || null;
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (active !== undefined) data.active = active;

  const updated = await prisma.material.update({ where: { id }, data });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "material.update",
    entity: "Material",
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

  const existing = await prisma.material.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.material.delete({ where: { id } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "material.delete",
    entity: "Material",
    entityId: id,
    meta: { name: existing.name, lot: existing.lot },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
