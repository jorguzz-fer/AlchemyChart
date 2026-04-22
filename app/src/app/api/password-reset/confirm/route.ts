import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { validatePassword } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const ip = getClientIp(req) ?? "unknown";

  // Rate limit por IP: 10 tentativas por hora
  const ipRl = await rateLimit({ key: `pwconfirm:ip:${ip}`, windowSec: 3600, max: 10 });
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429 },
    );
  }

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const password = body.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 400 });
  }

  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) {
    return NextResponse.json({ error: pwCheck.error }, { status: 400 });
  }

  // Busca o token
  const vt = await prisma.verificationToken.findUnique({ where: { token } });

  if (!vt || vt.expires < new Date()) {
    // Token não encontrado ou expirado — remove se ainda estiver lá
    if (vt) await prisma.verificationToken.delete({ where: { token } });
    return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 400 });
  }

  // Busca o usuário pelo identifier (e-mail)
  const user = await prisma.user.findUnique({
    where: { email: vt.identifier },
    select: { id: true, tenantId: true, active: true },
  });

  if (!user || !user.active) {
    await prisma.verificationToken.delete({ where: { token } });
    return NextResponse.json({ error: "Usuário não encontrado ou inativo" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Atualiza senha e remove token — em transação
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  await logAudit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "user.password_reset",
    entity: "User",
    entityId: user.id,
    meta: { method: "email_token" },
    ip,
  });

  return NextResponse.json({ ok: true });
}
