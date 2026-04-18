import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const ALLOWED_ROLES = ["ADMIN", "SUPERVISOR", "ANALYST", "VIEWER"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, email, password, role, unitId, active } = body;

  const target = await prisma.user.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isSelf = target.id === session.user.id;
  if (isSelf && (role !== undefined && role !== target.role)) {
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
    if (password.length < 8) return NextResponse.json({ error: "Senha deve ter ao menos 8 caracteres" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true, unitId: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Você não pode excluir seu próprio usuário" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.user.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
