import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.material.findMany({
    where: { unit: { tenantId: session.user.tenantId } },
    include: { _count: { select: { analytes: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  return NextResponse.json(item, { status: 201 });
}
