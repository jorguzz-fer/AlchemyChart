import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const ip = getClientIp(req) ?? "unknown";

  // Rate limit: 5 signups por hora por IP
  const rl = await rateLimit({ key: `signup:${ip}`, windowSec: 60 * 60, max: 5 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: {
    userName?: string;
    email?: string;
    password?: string;
    acceptedTerms?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const userName = (body.userName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const acceptedTerms = Boolean(body.acceptedTerms);

  if (!userName || userName.length < 2) {
    return NextResponse.json({ error: "Seu nome é obrigatório" }, { status: 400 });
  }
  if (userName.length > 120) {
    return NextResponse.json({ error: "Nome muito longo" }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }
  if (!acceptedTerms) {
    return NextResponse.json(
      { error: "É necessário aceitar os Termos de Uso e a Política de Privacidade" },
      { status: 400 },
    );
  }
  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) return NextResponse.json({ error: pwCheck.error }, { status: 400 });

  // E-mail já cadastrado?
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
  }

  // Busca o tenant ativo (sistema single-tenant — usa sempre o primeiro/único)
  const tenant = await prisma.tenant.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      units: { where: { active: true }, select: { id: true }, take: 1 },
    },
  });
  if (!tenant) {
    return NextResponse.json(
      { error: "Sistema não configurado. Contate o administrador." },
      { status: 503 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        unitId: tenant.units[0]?.id ?? null,
        name: userName,
        email,
        passwordHash,
        role: "ANALYST",
        active: false, // pendente aprovação do administrador
      },
      select: { id: true, email: true, role: true },
    });

    await logAudit({
      tenantId: tenant.id,
      userId: user.id,
      action: "signup.request",
      entity: "User",
      entityId: user.id,
      meta: { userName, email: user.email, role: user.role, pendingApproval: true },
      ip,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
    }
    console.error("[signup] failed", err);
    return NextResponse.json({ error: "Erro ao enviar cadastro. Tente novamente." }, { status: 500 });
  }
}
