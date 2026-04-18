import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, unit, level, equipmentId, materialId, active } = body;

  const updated = await prisma.analyte.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(unit !== undefined && { unit: unit?.trim() || null }),
      ...(level !== undefined && { level: Number(level) }),
      ...(equipmentId !== undefined && { equipmentId }),
      ...(materialId !== undefined && { materialId }),
      ...(active !== undefined && { active }),
    },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.analyte.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
