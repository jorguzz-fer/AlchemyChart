import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateStats } from "@/lib/stats";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const analyte = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
    },
  });
  if (!analyte) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const runs = await prisma.run.findMany({
    where: { analyteId: id },
    orderBy: { runAt: "asc" },
    include: { user: { select: { name: true } } },
  });

  const statPeriod = await prisma.statPeriod.findFirst({
    where: { analyteId: id },
    orderBy: { createdAt: "desc" },
  });

  const values = runs.map((r) => r.value);
  const currentStats = calculateStats(values);

  return NextResponse.json({
    analyte,
    runs,
    statPeriod,
    currentStats,
  });
}
