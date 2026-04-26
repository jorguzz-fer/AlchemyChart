import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";

// GET /api/materiais/[id]
// Retorna material com analyteMaterials[] aninhado para a tela de edição.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const item = await prisma.material.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
    include: {
      analyteMaterials: {
        include: {
          analyte: { select: { id: true, name: true, unit: true } },
          equipment: { select: { id: true, name: true } },
          _count: { select: { runs: true } },
        },
        orderBy: [{ analyte: { name: "asc" } }, { level: "asc" }],
      },
      _count: { select: { analyteMaterials: true } },
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

  const existing = await prisma.material.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    name,
    lot,
    generation,
    expiresAt,
    active,
    // Novos campos
    fabricante,
    alertEnabled,
    alertDays,
    naoEnsaiado,
  } = body;

  const data: {
    name?: string;
    lot?: string | null;
    generation?: string | null;
    expiresAt?: Date | null;
    active?: boolean;
    fabricante?: string | null;
    alertEnabled?: boolean;
    alertDays?: number;
    naoEnsaiado?: boolean;
  } = {};
  if (name !== undefined) data.name = name.trim();
  if (lot !== undefined) data.lot = lot?.trim() || null;
  if (generation !== undefined) data.generation = generation?.trim() || null;
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (active !== undefined) data.active = active;
  if (fabricante !== undefined) data.fabricante = fabricante?.trim() || null;
  if (alertEnabled !== undefined) data.alertEnabled = Boolean(alertEnabled);
  if (alertDays !== undefined) data.alertDays = Math.max(0, Number(alertDays) || 0);
  if (naoEnsaiado !== undefined) data.naoEnsaiado = Boolean(naoEnsaiado);

  const updated = await prisma.material.update({ where: { id }, data });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "material.update",
    entity: "Material",
    entityId: updated.id,
    meta: { fieldsChanged: Object.keys(data) },
    ip: getClientIp(req),
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_MANAGE);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.material.findFirst({
    where: { id, unit: { tenantId: session.user.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.material.delete({ where: { id } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "material.delete",
    entity: "Material",
    entityId: id,
    meta: { name: existing.name, lot: existing.lot },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
