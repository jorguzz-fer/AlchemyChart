import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const nc = await prisma.nonConformity.update({
    where: { id },
    data: { action: action?.trim() || null, resolvedAt: new Date() },
  });

  return NextResponse.json(nc);
}
