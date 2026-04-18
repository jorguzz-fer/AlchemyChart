import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [nonConformities, expiringMaterials, inObservation, allStats, equipments] = await Promise.all([
    prisma.nonConformity.count({
      where: { resolvedAt: null, run: { analyte: { unitRel: { tenantId } } } },
    }),

    prisma.material.count({
      where: { unit: { tenantId }, active: true, expiresAt: { lte: thirtyDaysLater, gte: now } },
    }),

    prisma.analyte.count({
      where: {
        unitRel: { tenantId },
        active: true,
        runs: { some: { runAt: { gte: sevenDaysAgo }, status: { in: ["ALERT", "REJECT"] } } },
      },
    }),

    prisma.statPeriod.findMany({
      where: { analyte: { unitRel: { tenantId }, active: true } },
      select: { analyteId: true, cv: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),

    prisma.equipment.findMany({
      where: { unit: { tenantId }, active: true },
      include: {
        runs: { where: { runAt: { gte: ninetyDaysAgo } }, select: { status: true } },
        analytes: {
          where: { active: true },
          include: { stats: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Latest StatPeriod per analyte → count high CV (> 5%)
  const latestCvMap = new Map<string, number>();
  for (const sp of allStats) {
    if (!latestCvMap.has(sp.analyteId)) latestCvMap.set(sp.analyteId, sp.cv);
  }
  const highCvCount = Array.from(latestCvMap.values()).filter((cv) => cv > 5).length;

  const equipmentStats = equipments.map((eq) => {
    const total = eq.runs.length;
    const alerts = eq.runs.filter((r) => r.status === "ALERT").length;
    const rejects = eq.runs.filter((r) => r.status === "REJECT").length;
    const oks = total - alerts - rejects;

    const alertPct = total > 0 ? Math.round(((oks + alerts) / total) * 1000) / 10 : 0;
    const errorPct = total > 0 ? Math.round((rejects / total) * 1000) / 10 : 0;

    const highCvAnalytes = eq.analytes.filter((a) => {
      const stat = a.stats[0];
      return stat && stat.cv > 5;
    });

    return {
      id: eq.id,
      name: eq.name,
      alertPct,
      errorPct,
      lastMaint: eq.lastMaint ?? null,
      nextMaint: eq.nextMaint ?? null,
      cvHighPct: eq.analytes.length > 0 ? Math.round((highCvAnalytes.length / eq.analytes.length) * 1000) / 10 : 0,
      cvHighCount: highCvAnalytes.length,
      hasData: total > 0,
    };
  });

  return NextResponse.json({
    kpis: { nonConformities, expiringMaterials, highCvCount, inObservation },
    equipments: equipmentStats,
  });
}
