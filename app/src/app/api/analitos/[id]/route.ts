import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

// GET /api/analitos/[id]
// Retorna um Analyte específico com analyteMaterials[] aninhado.
// Útil para a tela de edição.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;
  const item = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
    include: {
      equipment: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
      _count: { select: { stats: true, runs: true } },
      analyteMaterials: {
        include: {
          equipment: { select: { id: true, name: true } },
          material: { select: { id: true, name: true, lot: true } },
          _count: { select: { runs: true } },
        },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    name,
    unit,
    level,
    equipmentId,
    materialId,
    active,
    // Novos campos exam-level (Fase 1)
    decimalPlaces,
    maxImprecision,
    imprecisionSource,
    westgardRules,
  } = body;

  if (equipmentId !== undefined) {
    const eq = await prisma.equipment.findFirst({
      where: { id: equipmentId, unit: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!eq) return NextResponse.json({ error: "Equipamento inválido" }, { status: 400 });
  }

  if (materialId !== undefined) {
    const mat = await prisma.material.findFirst({
      where: { id: materialId, unit: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!mat) return NextResponse.json({ error: "Material inválido" }, { status: 400 });
  }

  // Campos exclusivos da combinação (legacy) — só atualizam o registro alvo
  const localData: {
    level?: number;
    equipmentId?: string;
    materialId?: string;
    active?: boolean;
  } = {};
  if (level !== undefined) localData.level = Number(level);
  if (equipmentId !== undefined) localData.equipmentId = equipmentId;
  if (materialId !== undefined) localData.materialId = materialId;
  if (active !== undefined) localData.active = active;

  // Campos exam-level — sincronizam entre todos os Analytes com mesmo nome+unidade
  // (durante a transição com duplicatas; após dedup vira simples update)
  const sharedData: {
    name?: string;
    unit?: string | null;
    decimalPlaces?: number;
    maxImprecision?: number | null;
    imprecisionSource?: string | null;
    westgardRules?: unknown;
  } = {};
  if (name !== undefined) sharedData.name = name.trim();
  if (unit !== undefined) sharedData.unit = unit?.trim() || null;
  if (decimalPlaces !== undefined) {
    sharedData.decimalPlaces = Math.min(3, Math.max(0, Number(decimalPlaces) || 0));
  }
  if (maxImprecision !== undefined) {
    sharedData.maxImprecision = (maxImprecision === null || maxImprecision === "")
      ? null
      : Number(maxImprecision);
  }
  if (imprecisionSource !== undefined) {
    sharedData.imprecisionSource = imprecisionSource?.trim() || null;
  }
  if (westgardRules !== undefined) sharedData.westgardRules = westgardRules;

  const updated = await prisma.$transaction(async (tx) => {
    // Atualiza o registro específico (com campos locais + compartilhados)
    const updatedItem = await tx.analyte.update({
      where: { id },
      // @ts-expect-error - Prisma checked update não suporta FKs raw; usamos unchecked aqui
      data: { ...localData, ...sharedData },
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

    // Sincroniza campos exam-level nas duplicatas (mesmo nome+unidade, exceto este)
    if (Object.keys(sharedData).length > 0) {
      await tx.analyte.updateMany({
        where: {
          unitRel: { tenantId: session.user.tenantId },
          name: existing.name,
          unit: existing.unit,
          id: { not: id },
        },
        // @ts-expect-error - westgardRules é Json; Prisma aceita unknown aqui
        data: sharedData,
      });
    }

    return updatedItem;
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyte.update",
    entity: "Analyte",
    entityId: updated.id,
    meta: {
      fieldsChanged: [...Object.keys(localData), ...Object.keys(sharedData)],
      synced: Object.keys(sharedData).length > 0,
    },
    ip: getClientIp(req),
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.analyte.findFirst({
    where: { id, unitRel: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.analyte.delete({ where: { id } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "analyte.delete",
    entity: "Analyte",
    entityId: id,
    meta: { name: existing.name },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
