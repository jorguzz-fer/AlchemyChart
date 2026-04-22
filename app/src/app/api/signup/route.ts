import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "lab";
  // try root, then root-2, root-3, ..., finally root-<random>
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const exists = await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const ip = getClientIp(req) ?? "unknown";

  // Rate limit: 5 signups per hour per IP
  const rl = await rateLimit({ key: `signup:${ip}`, windowSec: 60 * 60, max: 5 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: {
    labName?: string;
    userName?: string;
    email?: string;
    password?: string;
    unitName?: string;
    acceptedTerms?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const labName = (body.labName ?? "").trim();
  const userName = (body.userName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const unitName = (body.unitName ?? "").trim() || "Matriz";
  const acceptedTerms = Boolean(body.acceptedTerms);

  if (!labName || labName.length < 2) {
    return NextResponse.json({ error: "Nome do laboratório obrigatório" }, { status: 400 });
  }
  if (labName.length > 120) {
    return NextResponse.json({ error: "Nome do laboratório muito longo" }, { status: 400 });
  }
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

  // Check email availability
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = await uniqueSlug(slugify(labName));

  // Transaction: Tenant → Unit → User
  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: labName, slug, plan: "FREE", active: true },
        select: { id: true, slug: true },
      });

      const unit = await tx.unit.create({
        data: { tenantId: tenant.id, name: unitName, active: true },
        select: { id: true },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          unitId: unit.id,
          name: userName,
          email,
          passwordHash,
          role: "ADMIN",
          active: true,
        },
        select: { id: true, email: true, role: true },
      });

      return { tenant, unit, user };
    });

    await logAudit({
      tenantId: result.tenant.id,
      userId: result.user.id,
      action: "signup.tenant",
      entity: "Tenant",
      entityId: result.tenant.id,
      meta: {
        labName,
        slug: result.tenant.slug,
        unitName,
        userEmail: result.user.email,
        userRole: result.user.role,
      },
      ip,
    });

    return NextResponse.json(
      { ok: true, email: result.user.email, slug: result.tenant.slug },
      { status: 201 },
    );
  } catch (err) {
    // Handle race on unique email (double-submit between the check above and create)
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
    }
    console.error("[signup] failed", err);
    return NextResponse.json({ error: "Erro ao criar conta. Tente novamente." }, { status: 500 });
  }
}
