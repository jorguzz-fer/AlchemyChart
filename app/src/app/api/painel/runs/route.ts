import { prisma } from "@/lib/db";
import { calculateStats } from "@/lib/stats";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";
import { equipmentGroupKey } from "@/lib/equipment-group";
import { resolveControlCenter } from "@/lib/control-center";

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

  // Fetch runs + stat periods + centro de referência para cada analito em paralelo
  const [runsByAnalyte, statPeriods, centers] = await Promise.all([
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
    Promise.all(
      analytes.map((a) =>
        resolveControlCenter({
          tenantId: session.user.tenantId,
          analyteId: a.id,
          analyteName: a.name,
          equipmentId: a.equipmentId,
          equipmentName: a.equipment?.name ?? "",
          level: a.level,
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
    // Quem digitou — o supervisor precisa disso sem ter que cruzar data com escala
    userNames: analytes.map((_, ai) => runsByAnalyte[ai][i]?.user?.name ?? null),
  }));

  const stats = analytes.map((a, i) => {
    const center = centers[i];
    const current = calculateStats(runsByAnalyte[i].map((r) => r.value));
    return {
      statPeriod: statPeriods[i]
        ? {
            mean: statPeriods[i]!.mean,
            sd: statPeriods[i]!.sd,
            cv: statPeriods[i]!.cv,
            n: statPeriods[i]!.n,
          }
        : null,
      currentStats: current,
      // CV "referente ao meu": dispersão das corridas sobre a média de
      // referência (bula/manual), não sobre uma média recalculada.
      currentCv:
        current && center && center.mean !== 0
          ? (current.sd / center.mean) * 100
          : current?.cv ?? null,
      // Centro efetivo do gráfico/Westgard e de onde ele veio
      center,
      manualTarget:
        center?.source === "manual" ? { mean: center.mean, sd: center.sd } : null,
      groupKey: equipmentGroupKey(a.equipment?.name ?? ""),
    };
  });

  return NextResponse.json({ analytes, rows, stats, total: maxRuns });
}
