import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.equipment.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, model, serial, active, lastMaint, nextMaint } = body;

  const updated = await prisma.equipment.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(model !== undefined && { model: model?.trim() || null }),
      ...(serial !== undefined && { serial: serial?.trim() || null }),
      ...(active !== undefined && { active }),
      ...(lastMaint !== undefined && { lastMaint: lastMaint ? new Date(lastMaint) : null }),
      ...(nextMaint !== undefined && { nextMaint: nextMaint ? new Date(nextMaint) : null }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.equipment.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.equipment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
