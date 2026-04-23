import { prisma } from "@/lib/db";
import { calculateStats } from "@/lib/stats";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const url = new URL(req.url);
  const raw = url.searchParams.get("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > 3) return NextResponse.json({ error: "máximo 3 ids" }, { status: 400 });

  // Verify all analytes belong to this tenant
  const analytes = await prisma.analyte.findMany({
    where: { id: { in: ids }, unitRel: { tenantId: session.user.tenantId } },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
      _count: { select: { stats: true } },
    },
    orderBy: { level: "asc" },
  });

  if (analytes.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch runs + stat periods for each analyte in parallel
  const [runsByAnalyte, statPeriods] = await Promise.all([
    Promise.all(
      analytes.map((a) =>
        prisma.run.findMany({
          where: { analyteId: a.id },
          orderBy: { runAt: "asc" },
          include: { user: { select: { name: true } } },
        })
      )
    ),
    Promise.all(
      analytes.map((a) =>
        prisma.statPeriod.findFirst({
          where: { analyteId: a.id },
          orderBy: { createdAt: "desc" },
        })
      )
    ),
  ]);

  const maxRuns = Math.max(...runsByAnalyte.map((r) => r.length), 0);

  // Align rows by sequential index (runs are synced by entry order)
  const rows = Array.from({ length: maxRuns }, (_, i) => ({
    no: i + 1,
    values: analytes.map((_, ai) => runsByAnalyte[ai][i]?.value ?? null),
    statuses: analytes.map((_, ai) => (runsByAnalyte[ai][i]?.status ?? null) as string | null),
    violations: analytes.map((_, ai) => (runsByAnalyte[ai][i]?.violations ?? null) as string[] | null),
    runIds: analytes.map((_, ai) => runsByAnalyte[ai][i]?.id ?? null),
    runAt: analytes.map((_, ai) => runsByAnalyte[ai][i]?.runAt?.toISOString() ?? null),
  }));

  const stats = analytes.map((_, i) => ({
    statPeriod: statPeriods[i]
      ? {
          mean: statPeriods[i]!.mean,
          sd: statPeriods[i]!.sd,
          cv: statPeriods[i]!.cv,
          n: statPeriods[i]!.n,
        }
      : null,
    currentStats: calculateStats(runsByAnalyte[i].map((r) => r.value)),
  }));

  return NextResponse.json({ analytes, rows, stats, total: maxRuns });
}
