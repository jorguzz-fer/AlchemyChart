import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireRole, ROLES_ADMIN } from "@/lib/authz";
import { validatePassword } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";

const ALLOWED_ROLES = ["ADMIN", "SUPERVISOR", "ANALYST", "VIEWER"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_ADMIN);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, email, password, role, unitId, active } = body;

  const target = await prisma.user.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isSelf = target.id === session.user.id;
  if (isSelf && role !== undefined && role !== target.role) {
    return NextResponse.json({ error: "Você não pode alterar seu próprio perfil" }, { status: 400 });
  }
  if (isSelf && active === false) {
    return NextResponse.json({ error: "Você não pode desativar seu próprio usuário" }, { status: 400 });
  }

  if (role !== undefined && !ALLOWED_ROLES.includes(role as AllowedRole)) {
    return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  }

  if (email !== undefined && email.trim() && email.trim().toLowerCase() !== target.email) {
    const exists = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (exists) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
  }

  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, tenantId: session.user.tenantId } });
    if (!unit) return NextResponse.json({ error: "Unidade inválida" }, { status: 400 });
  }

  const data: {
    name?: string;
    email?: string;
    role?: AllowedRole;
    unitId?: string | null;
    active?: boolean;
    passwordHash?: string;
  } = {};
  if (name !== undefined) data.name = name.trim();
  if (email !== undefined) data.email = email.trim().toLowerCase();
  if (role !== undefined) data.role = role as AllowedRole;
  if (unitId !== undefined) data.unitId = unitId || null;
  if (active !== undefined) data.active = active;
  if (password) {
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true, unitId: true },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user.update",
    entity: "User",
    entityId: updated.id,
    meta: {
      fieldsChanged: Object.keys(data),
      passwordChanged: Boolean(password),
      targetEmail: updated.email,
    },
    ip: getClientIp(req),
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole(ROLES_ADMIN);
  if (error) return error;

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Você não pode excluir seu próprio usuário" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.user.update({ where: { id }, data: { active: false } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user.deactivate",
    entity: "User",
    entityId: id,
    meta: { targetEmail: target.email },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
