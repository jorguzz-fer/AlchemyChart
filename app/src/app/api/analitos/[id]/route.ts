import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, unit, level, equipmentId, materialId, active } = body;

  if (equipmentId !== undefined) {
    const eq = await prisma.equipment.findFirst({
      where: { id: equipmentId, unit: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!eq) return NextResponse.json({ error: "Equipamento inválido" }, { status: 400 });
  }

  if (materialId !== undefined) {
    const mat = await prisma.material.findFirst({
      where: { id: materialId, unit: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!mat) return NextResponse.json({ error: "Material inválido" }, { status: 400 });
  }

  const data: {
    name?: string;
    unit?: string | null;
    level?: number;
    equipmentId?: string;
    materialId?: string;
    active?: boolean;
  } = {};
  if (name !== undefined) data.name = name.trim();
  if (unit !== undefined) data.unit = unit?.trim() || null;
  if (level !== undefined) data.level = Number(level);
  if (equipmentId !== undefined) data.equipmentId = equipmentId;
  if (materialId !== undefined) data.materialId = materialId;
  if (active !== undefined) data.active = active;

  const updated = await prisma.analyte.update({
    where: { id },
    data,
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyte.update",
    entity: "Analyte",
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

  const existing = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.analyte.delete({ where: { id } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyte.delete",
    entity: "Analyte",
    entityId: id,
    meta: { name: existing.name },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
