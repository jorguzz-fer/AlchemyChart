import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { sendPasswordReset } from "@/lib/email";
import { getClientIp } from "@/lib/audit";
import crypto from "crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

export async function POST(req: Request) {
  const ip = getClientIp(req) ?? "unknown";

  // Rate limit por IP: 5 por hora
  const ipRl = await rateLimit({ key: `pwreset:ip:${ip}`, windowSec: 3600, max: 5 });
  if (!ipRl.allowed) {
    // Responde igual ao sucesso — não revelar que o IP está bloqueado
    return NextResponse.json({ ok: true });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }

  // Rate limit por e-mail: 3 por hora
  const emailRl = await rateLimit({ key: `pwreset:email:${email}`, windowSec: 3600, max: 3 });
  if (!emailRl.allowed) {
    // Responde igual ao sucesso — não revelar enumeração de e-mails
    return NextResponse.json({ ok: true });
  }

  // Busca o usuário — resposta sempre igual independente de existir ou não (evita enumeração)
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true, name: true },
  });

  if (!user || !user.active) {
    // Não revela se o e-mail existe
    return NextResponse.json({ ok: true });
  }

  // Remove tokens anteriores do mesmo e-mail
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  // Gera token seguro
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  // Envia e-mail (falha silenciosa — usuário não sabe se o e-mail foi enviado ou não)
  try {
    await sendPasswordReset(email, token);
  } catch (err) {
    console.error("[password-reset/request] falha ao enviar e-mail:", err);
  }

  return NextResponse.json({ ok: true });
}
