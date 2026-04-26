import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { DEFAULT_WESTGARD_RULES } from "@/lib/westgard-config";

// GET /api/analitos
// Retorna a lista LEGADA (1 registro por combinação analito+equip+material+nivel),
// agora enriquecida com analyteMaterials[] aninhado para suporte ao novo modelo.
// Para a visão deduplicada (1 por exame), use GET /api/analitos/list.
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const items = await prisma.analyte.findMany({
    where: { unitRel: { tenantId: session.user.tenantId } },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
      _count: { select: { stats: true } },
      analyteMaterials: {
        include: {
          equipment: { select: { id: true, name: true } },
          material: { select: { id: true, name: true, lot: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;
  if (!session.user.unitId) return NextResponse.json({ error: "No unit" }, { status: 400 });

  const body = await req.json();
  const {
    name,
    unit,
    level,
    equipmentId,
    materialId,
    // Novos campos da Fase 1
    decimalPlaces,
    maxImprecision,
    imprecisionSource,
    westgardRules,
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!equipmentId) return NextResponse.json({ error: "Equipamento obrigatório" }, { status: 400 });
  if (!materialId) return NextResponse.json({ error: "Material obrigatório" }, { status: 400 });

  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, unit: { tenantId: session.user.tenantId } },
    select: { id: true },
  });
  if (!equipment) return NextResponse.json({ error: "Equipamento inválido" }, { status: 400 });

  const material = await prisma.material.findFirst({
    where: { id: materialId, unit: { tenantId: session.user.tenantId } },
    select: { id: true },
  });
  if (!material) return NextResponse.json({ error: "Material inválido" }, { status: 400 });

  // Sanitiza decimalPlaces (max 3, default 3)
  const safeDecimals = decimalPlaces !== undefined
    ? Math.min(3, Math.max(0, Number(decimalPlaces) || 0))
    : 3;

  // Cria Analyte + AnalyteMaterial em transação (para garantir consistência)
  const item = await prisma.$transaction(async (tx) => {
    const analyte = await tx.analyte.create({
      data: {
        unitId: session.user.unitId!,
        equipmentId,
        materialId,
        name: name.trim(),
        unit: unit?.trim() || null,
        level: Number(level) || 1,
        decimalPlaces: safeDecimals,
        maxImprecision: maxImprecision !== undefined && maxImprecision !== null && maxImprecision !== ""
          ? Number(maxImprecision)
          : null,
        imprecisionSource: imprecisionSource?.trim() || null,
        westgardRules: westgardRules ?? DEFAULT_WESTGARD_RULES,
      },
    });

    // Cria AnalyteMaterial correspondente automaticamente
    await tx.analyteMaterial.create({
      data: {
        analyteId: analyte.id,
        equipmentId,
        materialId,
        level: Number(level) || 1,
        status: "PREPARO",
      },
    });

    return tx.analyte.findUnique({
      where: { id: analyte.id },
      include: {
        equipment: { select: { id: true, name: true } },
        material: { select: { id: true, name: true } },
        analyteMaterials: {
          include: {
            equipment: { select: { id: true, name: true } },
            material: { select: { id: true, name: true } },
          },
        },
      },
    });
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyte.create",
    entity: "Analyte",
    entityId: item!.id,
    meta: { name: item!.name, level: item!.level, equipmentId, materialId },
    ip: getClientIp(req),
  });

  return NextResponse.json(item, { status: 201 });
}
