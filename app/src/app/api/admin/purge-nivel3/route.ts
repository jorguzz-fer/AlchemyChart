import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

export const maxDuration = 120;

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN"] as const;

// Coleta os ids de TUDO que é nível 3 no tenant:
// - Analitos legados com level=3
// - AnalyteMaterials (vínculos/controles) com level=3
// Os AMs nível 3 podem pertencer a analitos de nível 1/2 (criados on-demand),
// por isso são coletados separadamente dos analitos legados nível 3.
async function collectLevel3(tenantId: string) {
  const [analytes, ams] = await Promise.all([
    prisma.analyte.findMany({
      where: { level: 3, unitRel: { tenantId } },
      select: { id: true },
    }),
    prisma.analyteMaterial.findMany({
      where: { level: 3, analyte: { unitRel: { tenantId } } },
      select: { id: true },
    }),
  ]);
  return { analyteIds: analytes.map((a) => a.id), amIds: ams.map((a) => a.id) };
}

// Monta o filtro de corridas atingidas (vínculo nível 3 OU analito legado nível 3).
function runWhereFor(analyteIds: string[], amIds: string[]): Prisma.RunWhereInput | null {
  const or: Prisma.RunWhereInput[] = [];
  if (amIds.length) or.push({ analyteMaterialId: { in: amIds } });
  if (analyteIds.length) or.push({ analyteId: { in: analyteIds } });
  return or.length ? { OR: or } : null;
}

async function countImpact(tenantId: string) {
  const { analyteIds, amIds } = await collectLevel3(tenantId);
  const runWhere = runWhereFor(analyteIds, amIds);
  const [runs, statPeriods] = await Promise.all([
    runWhere ? prisma.run.count({ where: runWhere }) : Promise.resolve(0),
    analyteIds.length
      ? prisma.statPeriod.count({ where: { analyteId: { in: analyteIds } } })
      : Promise.resolve(0),
  ]);
  return {
    analyteIds,
    amIds,
    counts: {
      analytes: analyteIds.length,
      analyteMaterials: amIds.length,
      runs,
      statPeriods,
    },
  };
}

// GET /api/admin/purge-nivel3 — prévia (não apaga nada)
export async function GET() {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const { counts } = await countImpact(session.user.tenantId);
  return NextResponse.json(counts);
}

// DELETE /api/admin/purge-nivel3 — apaga todos os registros de nível 3 do tenant
export async function DELETE(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const tenantId = session.user.tenantId;
  const { analyteIds, amIds } = await collectLevel3(tenantId);

  if (analyteIds.length === 0 && amIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deleted: { runs: 0, statPeriods: 0, analyteMaterials: 0, analytes: 0 },
      message: "Nenhum registro de nível 3 encontrado.",
    });
  }

  const deleted = await prisma.$transaction(async (tx) => {
    // 1) Corridas atingidas — NonConformity cascateia (onDelete: Cascade)
    const runWhere = runWhereFor(analyteIds, amIds);
    const runs = runWhere ? (await tx.run.deleteMany({ where: runWhere })).count : 0;

    // 2) Estatísticas dos analitos nível 3
    const statPeriods = analyteIds.length
      ? (await tx.statPeriod.deleteMany({ where: { analyteId: { in: analyteIds } } })).count
      : 0;

    // 3) Vínculos (AnalyteMaterials) nível 3 — já sem corridas
    const analyteMaterials = amIds.length
      ? (await tx.analyteMaterial.deleteMany({ where: { id: { in: amIds } } })).count
      : 0;

    // 4) Analitos legados nível 3 (cascateia o que restar)
    const analytes = analyteIds.length
      ? (await tx.analyte.deleteMany({ where: { id: { in: analyteIds } } })).count
      : 0;

    return { runs, statPeriods, analyteMaterials, analytes };
  });

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "admin.purgeLevel3",
    entity: "Analyte",
    entityId: tenantId,
    meta: deleted,
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true, deleted });
}
