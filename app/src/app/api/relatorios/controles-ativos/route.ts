import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const analytes = await prisma.analyte.findMany({
    where: { unitRel: { tenantId: session.user.tenantId }, active: true },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true, lot: true } },
      stats: { orderBy: { createdAt: "desc" }, take: 1 },
      runs: { select: { id: true }, orderBy: { runAt: "desc" } },
    },
    orderBy: [{ equipment: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(
    analytes.map((a) => ({
      id: a.id,
      name: a.name,
      unit: a.unit,
      level: a.level,
      equipment: a.equipment,
      material: a.material,
      totalRuns: a.runs.length,
      statPeriod: a.stats[0] ?? null,
      inSetup: a.stats.length === 0 || a.runs.length < 20,
    }))
  );
}
