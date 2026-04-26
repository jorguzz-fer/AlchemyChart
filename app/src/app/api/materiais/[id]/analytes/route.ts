import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

// POST /api/materiais/[id]/analytes
// Associa um analito ao material, criando AnalyteMaterial.
// Body: { analyteId, equipmentId, level, manufacturerMean?, manufacturerSD? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id: materialId } = await params;
  const body = await req.json();
  const { analyteId, equipmentId, level, manufacturerMean, manufacturerSD } = body;

  // Validações
  if (!analyteId) return NextResponse.json({ error: "analyteId obrigatório" }, { status: 400 });
  if (!equipmentId) return NextResponse.json({ error: "equipmentId obrigatório" }, { status: 400 });
  const lvl = Math.min(3, Math.max(1, Number(level) || 1));

  const material = await prisma.material.findFirst({
    where: { id: materialId, unit: { tenantId: session.user.tenantId } },
    select: { id: true },
  });
  if (!material) return NextResponse.json({ error: "Material não encontrado" }, { status: 404 });

  const analyte = await prisma.analyte.findFirst({
    where: { id: analyteId, unitRel: { tenantId: session.user.tenantId } },
    select: { id: true, name: true },
  });
  if (!analyte) return NextResponse.json({ error: "Analito inválido" }, { status: 400 });

  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, unit: { tenantId: session.user.tenantId } },
    select: { id: true, name: true },
  });
  if (!equipment) return NextResponse.json({ error: "Equipamento inválido" }, { status: 400 });

  // Cria AnalyteMaterial (ou retorna existente se já há esta combinação)
  try {
    const am = await prisma.analyteMaterial.create({
      data: {
        analyteId,
        equipmentId,
        materialId,
        level: lvl,
        manufacturerMean: manufacturerMean !== undefined && manufacturerMean !== null && manufacturerMean !== ""
          ? Number(manufacturerMean)
          : null,
        manufacturerSD: manufacturerSD !== undefined && manufacturerSD !== null && manufacturerSD !== ""
          ? Number(manufacturerSD)
          : null,
        status: "PREPARO",
      },
      include: {
        analyte: { select: { id: true, name: true, unit: true } },
        equipment: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "analyteMaterial.create",
      entity: "AnalyteMaterial",
      entityId: am.id,
      meta: {
        materialId,
        analyteId,
        analyteName: analyte.name,
        equipmentId,
        equipmentName: equipment.name,
        level: lvl,
      },
      ip: getClientIp(req),
    });

    return NextResponse.json(am, { status: 201 });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "Esta combinação analito × equipamento × nível já está associada a este material" },
        { status: 409 }
      );
    }
    throw e;
  }
}
