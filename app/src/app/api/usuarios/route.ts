import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const ALLOWED_ROLES = ["ADMIN", "SUPERVISOR", "ANALYST", "VIEWER"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true, name: true, email: true, role: true, active: true,
      createdAt: true, unitId: true,
      unit: { select: { id: true, name: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, unitId } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: "E-mail obrigatório" }, { status: 400 });
  if (!password || password.length < 8) return NextResponse.json({ error: "Senha deve ter ao menos 8 caracteres" }, { status: 400 });
  if (!ALLOWED_ROLES.includes(role as AllowedRole)) return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });

  const exists = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
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
      email: email.trim().toLowerCase(),
      passwordHash,
      role: role as AllowedRole,
    },
    select: { id: true, name: true, email: true, role: true, active: true, unitId: true },
  });

  return NextResponse.json(user, { status: 201 });
}
