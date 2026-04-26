import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";

// GET /api/analitos/list
// Retorna lista DEDUPLICADA por nome+unidade — 1 linha por exame,
// agregando todos os AnalyteMaterials (combinações equipamento × material × nível).
// Os campos exam-level (decimalPlaces, maxImprecision, ..., westgardRules) são
// herdados da primeira ocorrência (canônica) — após a deduplicação real numa
// fase futura, esse campo passa a ter um único valor verdadeiro por exame.
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const items = await prisma.analyte.findMany({
    where: { unitRel: { tenantId: session.user.tenantId } },
    include: {
      _count: { select: { stats: true, runs: true } },
      analyteMaterials: {
        include: {
          equipment: { select: { id: true, name: true } },
          material: { select: { id: true, name: true, lot: true, expiresAt: true } },
          _count: { select: { runs: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Agrupa por nome+unidade
  type GroupedAnalyte = {
    masterId: string;          // ID do Analyte canônico (primeiro com esse nome+unidade)
    name: string;
    unit: string | null;
    active: boolean;
    decimalPlaces: number;
    maxImprecision: number | null;
    imprecisionSource: string | null;
    westgardRules: unknown;
    duplicateIds: string[];    // IDs de TODOS os Analytes com mesmo nome+unidade
    analyteMaterials: unknown[]; // todos os AMs agregados
    totalRuns: number;
    totalStats: number;
    equipmentCount: number;
    levelCount: number;        // níveis únicos configurados
  };

  const grouped = new Map<string, GroupedAnalyte>();

  for (const a of items) {
    const key = `${a.name}||${a.unit ?? ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        masterId: a.id,
        name: a.name,
        unit: a.unit,
        active: a.active,
        decimalPlaces: a.decimalPlaces,
        maxImprecision: a.maxImprecision,
        imprecisionSource: a.imprecisionSource,
        westgardRules: a.westgardRules,
        duplicateIds: [],
        analyteMaterials: [],
        totalRuns: 0,
        totalStats: 0,
        equipmentCount: 0,
        levelCount: 0,
      });
    }
    const g = grouped.get(key)!;
    g.duplicateIds.push(a.id);
    g.totalRuns += a._count.runs;
    g.totalStats += a._count.stats;
    // Se algum dos analitos legados está ativo, considera o exame ativo
    if (a.active) g.active = true;
    // Adiciona AMs ao grupo (incluindo o analyteId original p/ rastreabilidade)
    for (const am of a.analyteMaterials) {
      g.analyteMaterials.push({
        ...am,
        analyteId: a.id,
      });
    }
  }

  // Calcula equipment/level counts por grupo
  for (const g of grouped.values()) {
    const ams = g.analyteMaterials as Array<{ equipmentId: string; level: number }>;
    g.equipmentCount = new Set(ams.map((am) => am.equipmentId)).size;
    g.levelCount = new Set(ams.map((am) => am.level)).size;
  }

  return NextResponse.json(Array.from(grouped.values()));
}
