import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const items = await prisma.analyte.findMany({
    where: { unitRel: { tenantId: session.user.tenantId } },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
      _count: { select: { stats: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;
  if (!session.user.unitId) return NextResponse.json({ error: "No unit" }, { status: 400 });

  const body = await req.json();
  const { name, unit, level, equipmentId, materialId } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!equipmentId) return NextResponse.json({ error: "Equipamento obrigatório" }, { status: 400 });
  if (!materialId) return NextResponse.json({ error: "Material obrigatório" }, { status: 400 });

  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, unit: { tenantId: session.user.tenantId } },
    select: { id: true },
  });
  if (!equipment) return NextResponse.json({ error: "Equipamento inválido" }, { status: 400 });

  const material = await prisma.material.findFirst({
    where: { id: materialId, unit: { tenantId: session.user.tenantId } },
    select: { id: true },
  });
  if (!material) return NextResponse.json({ error: "Material inválido" }, { status: 400 });

  const item = await prisma.analyte.create({
    data: {
      unitId: session.user.unitId,
      equipmentId,
      materialId,
      name: name.trim(),
      unit: unit?.trim() || null,
      level: Number(level) || 1,
    },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyte.create",
    entity: "Analyte",
    entityId: item.id,
    meta: { name: item.name, level: item.level, equipmentId, materialId },
    ip: getClientIp(req),
  });

  return NextResponse.json(item, { status: 201 });
}
