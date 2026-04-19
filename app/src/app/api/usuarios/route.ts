import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireRole, ROLES_ADMIN } from "@/lib/authz";
import { validatePassword } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";

const ALLOWED_ROLES = ["ADMIN", "SUPERVISOR", "ANALYST", "VIEWER"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export async function GET() {
  const { session, error } = await requireRole(ROLES_ADMIN);
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true, name: true, email: true, role: true, active: true,
      createdAt: true, unitId: true,
      unit: { select: { id: true, name: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const withSelf = users.map((u) => ({ ...u, isSelf: u.id === session.user.id }));
  return NextResponse.json(withSelf);
}

export async function POST(req: Request) {
  const { session, error } = await requireRole(ROLES_ADMIN);
  if (error) return error;

  const body = await req.json();
  const { name, email, password, role, unitId } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: "E-mail obrigatório" }, { status: 400 });

  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) return NextResponse.json({ error: pwCheck.error }, { status: 400 });

  if (!ALLOWED_ROLES.includes(role as AllowedRole)) {
    return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (exists) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });

  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, tenantId: session.user.tenantId } });
    if (!unit) return NextResponse.json({ error: "Unidade inválida" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      unitId: unitId || session.user.unitId || null,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: role as AllowedRole,
    },
    select: { id: true, name: true, email: true, role: true, active: true, unitId: true },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user.create",
    entity: "User",
    entityId: user.id,
    meta: { role: user.role, email: user.email },
    ip: getClientIp(req),
  });

  return NextResponse.json(user, { status: 201 });
}
