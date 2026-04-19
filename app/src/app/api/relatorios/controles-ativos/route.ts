import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

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
