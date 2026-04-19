import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const items = await prisma.material.findMany({
    where: { unit: { tenantId: session.user.tenantId } },
    include: { _count: { select: { analytes: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;
  if (!session.user.unitId) return NextResponse.json({ error: "No unit" }, { status: 400 });

  const body = await req.json();
  const { name, lot, generation, expiresAt } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  const item = await prisma.material.create({
    data: {
      unitId: session.user.unitId,
      name: name.trim(),
      lot: lot?.trim() || null,
      generation: generation?.trim() || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "material.create",
    entity: "Material",
    entityId: item.id,
    meta: { name: item.name, lot: item.lot, generation: item.generation },
    ip: getClientIp(req),
  });

  return NextResponse.json(item, { status: 201 });
}
