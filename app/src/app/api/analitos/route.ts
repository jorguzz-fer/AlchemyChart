import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.analyte.findMany({
    where: { unitRel: { tenantId: session.user.tenantId } },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.unitId) return NextResponse.json({ error: "No unit" }, { status: 400 });

  const body = await req.json();
  const { name, unit, level, equipmentId, materialId } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!equipmentId) return NextResponse.json({ error: "Equipamento obrigatório" }, { status: 400 });
  if (!materialId) return NextResponse.json({ error: "Material obrigatório" }, { status: 400 });

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

  return NextResponse.json(item, { status: 201 });
}
