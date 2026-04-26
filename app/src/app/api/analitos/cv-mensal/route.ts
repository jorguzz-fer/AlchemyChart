import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";

// GET /api/analitos/cv-mensal?name=X&eq=Y&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Retorna a evolução mensal do CV (coeficiente de variação) por nível e por
// material/lote para um analito × equipamento, num período.
//
// Estrutura: por Nível (1,2,3) → por Material (lote) → por mês.
// Cada mês tem CV calculado a partir das corridas naquele mês usando aquele
// material. Mínimo 2 corridas/mês para CV ser válido.
export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const equipmentId = url.searchParams.get("eq") ?? "";
  const fromStr = url.searchParams.get("from") ?? "";
  const toStr = url.searchParams.get("to") ?? "";

  if (!name) return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
  if (!equipmentId) return NextResponse.json({ error: "eq obrigatório" }, { status: 400 });

  // Default range: últimos 24 meses
  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(to.getFullYear(), to.getMonth() - 23, 1);

  // Busca AnalyteMaterials que casam (name + equipmentId) no tenant
  const ams = await prisma.analyteMaterial.findMany({
    where: {
      equipmentId,
      analyte: {
        unitRel: { tenantId: session.user.tenantId },
        name,
      },
    },
    include: {
      analyte: { select: { name: true, unit: true } },
      material: { select: { id: true, name: true, lot: true } },
      equipment: { select: { id: true, name: true } },
      runs: {
        where: { runAt: { gte: from, lte: to } },
        select: { value: true, runAt: true },
        orderBy: { runAt: "asc" },
      },
    },
    orderBy: [{ level: "asc" }, { createdAt: "asc" }],
  });

  if (ams.length === 0) {
    return NextResponse.json({
      analyteName: name,
      analyteUnit: null,
      equipmentName: null,
      levels: [],
      fromDate: from.toISOString().slice(0, 10),
      toDate: to.toISOString().slice(0, 10),
    });
  }

  // Agrupa por level → material
  type MaterialMonths = {
    materialId: string;
    materialName: string;
    materialLot: string | null;
    months: Array<{ ym: string; cv: number | null; mean: number | null; sd: number | null; n: number }>;
  };
  type LevelGroup = { level: number; materials: MaterialMonths[] };

  const byLevel = new Map<number, Map<string, MaterialMonths>>();

  for (const am of ams) {
    if (!byLevel.has(am.level)) byLevel.set(am.level, new Map());
    const matMap = byLevel.get(am.level)!;

    if (!matMap.has(am.materialId)) {
      matMap.set(am.materialId, {
        materialId: am.materialId,
        materialName: am.material.name,
        materialLot: am.material.lot,
        months: [],
      });
    }
    const entry = matMap.get(am.materialId)!;

    // Agrupa runs por YYYY-MM
    const monthMap = new Map<string, number[]>();
    for (const r of am.runs) {
      const d = new Date(r.runAt);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(ym)) monthMap.set(ym, []);
      monthMap.get(ym)!.push(r.value);
    }

    // Calcula CV para cada mês
    const months = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, values]) => {
        const n = values.length;
        if (n < 2) return { ym, cv: null, mean: null, sd: null, n };
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
        const sd = Math.sqrt(variance);
        const cv = mean !== 0 ? (sd / mean) * 100 : 0;
        return { ym, cv, mean, sd, n };
      });

    // Acumula meses (caso o mesmo materialId tenha múltiplos AMs entre níveis,
    // em tese impossível pois agrupamos por level — mas para segurança fazemos merge)
    entry.months.push(...months);
  }

  const levels: LevelGroup[] = Array.from(byLevel.entries())
    .sort(([a], [b]) => a - b)
    .map(([level, matMap]) => ({
      level,
      materials: Array.from(matMap.values()),
    }));

  return NextResponse.json({
    analyteName: ams[0].analyte.name,
    analyteUnit: ams[0].analyte.unit,
    equipmentName: ams[0].equipment.name,
    levels,
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  });
}
