import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.RESEND_FROM ?? "Alchemy Control Chart <noreply@businesscalcv2.tudomudou.com.br>";
const APP_URL = process.env.NEXTAUTH_URL ?? "https://qualicontrol.tudomudou.com.br";

export async function sendPasswordReset(to: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f8f9fa;font-family:'Raleway',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:40px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#61396f 0%,#9155a7 100%);padding:36px 40px;text-align:center;">
                <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                  Alchemy Control Chart
                </p>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">
                  Sistema de Controle de Qualidade
                </p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0c0b0b;">
                  Redefinir senha
                </h1>
                <p style="margin:0 0 24px;font-size:15px;color:#5a5a5a;line-height:1.6;">
                  Recebemos uma solicitação para redefinir a senha da sua conta.
                  Clique no botão abaixo para criar uma nova senha.
                </p>
                <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:linear-gradient(135deg,#61396f 0%,#9155a7 100%);border-radius:10px;padding:14px 28px;">
                      <a href="${resetUrl}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;display:block;">
                        Criar nova senha →
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#9aa1ae;">
                  O link expira em <strong>1 hora</strong>. Se você não solicitou isso, ignore este e-mail.
                </p>
                <p style="margin:0;font-size:12px;color:#c2c8d1;word-break:break-all;">
                  Ou acesse: ${resetUrl}
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f8f9fa;padding:20px 40px;border-top:1px solid #eef0f2;">
                <p style="margin:0;font-size:12px;color:#9aa1ae;text-align:center;">
                  © ${new Date().getFullYear()} Alchemypet · Alchemy Control Chart<br>
                  Este é um e-mail automático, não responda.
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  if (!resend) {
    // Resend não configurado — loga o link pra debug em desenvolvimento
    console.log("[email] RESEND_API_KEY não configurada — e-mail não enviado.");
    console.log(`[email] Link de reset: ${resetUrl}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Redefinir sua senha — Alchemy Control Chart",
    html,
  });

  if (error) {
    console.error("[email] Falha ao enviar e-mail de reset:", error);
    throw new Error("Falha ao enviar e-mail");
  }
}

// ─── Alerta de controle fora dos limites ──────────────────────────────────────

export interface ControlAlertItem {
  analyteName: string;
  unit?: string | null; // unidade de medida (ex: mg/dL)
  level: number;
  equipmentName: string;
  value: number;
  status: "ALERT" | "REJECT";
  violations: string[];
  analystName?: string | null;
  runAt: Date;
  mean?: number | null;
  sd?: number | null;
}

export interface SendResult {
  sent: boolean;
  // nome do erro do Resend (ex.: "monthly_quota_exceeded", "rate_limit_exceeded")
  error?: string;
}

const fmtNum = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const fmtWhen = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Envia UM e-mail com todos os alertas de uma janela, agrupados por
// equipamento, Rejeitar antes de Alerta. Nunca lança — falha de e-mail não
// pode quebrar o registro da corrida; devolve o nome do erro para a fila
// decidir se tenta de novo ou pausa.
export async function sendControlAlerts(to: string[], items: ControlAlertItem[]): Promise<SendResult> {
  if (to.length === 0 || items.length === 0) return { sent: false };

  const rejects = items.filter((i) => i.status === "REJECT").length;
  const alerts = items.length - rejects;

  // Agrupa por equipamento; dentro, Rejeitar primeiro, depois analito/nível
  const byEquipment = new Map<string, ControlAlertItem[]>();
  for (const it of items) {
    const arr = byEquipment.get(it.equipmentName) ?? [];
    arr.push(it);
    byEquipment.set(it.equipmentName, arr);
  }
  const equipments = Array.from(byEquipment.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const arr of byEquipment.values()) {
    arr.sort(
      (a, b) =>
        (a.status === "REJECT" ? 0 : 1) - (b.status === "REJECT" ? 0 : 1) ||
        a.analyteName.localeCompare(b.analyteName, "pt-BR") ||
        a.level - b.level
    );
  }

  const badge = (status: "ALERT" | "REJECT") =>
    status === "REJECT"
      ? `<span style="display:inline-block;background:#fbeae9;color:#c0322b;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">REJEITAR</span>`
      : `<span style="display:inline-block;background:#fdf6e7;color:#b7791f;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">ALERTA</span>`;

  const sections = equipments
    .map((eq) => {
      const rows = byEquipment
        .get(eq)!
        .map((it) => {
          const accent = it.status === "REJECT" ? "#c0322b" : "#b7791f";
          const ref = it.mean != null && it.sd != null ? `${fmtNum(it.mean)} / ${fmtNum(it.sd)}` : "—";
          return `
            <tr>
              <td style="padding:8px 6px;border-top:1px solid #eef0f2;font-size:13px;color:#0c0b0b;">
                <strong>${esc(it.analyteName)}</strong>${it.unit ? ` <span style="color:#9aa1ae;">(${esc(it.unit)})</span>` : ""}
                <span style="color:#9aa1ae;"> · N${it.level}</span>
              </td>
              <td style="padding:8px 6px;border-top:1px solid #eef0f2;font-size:14px;color:${accent};font-weight:700;text-align:right;white-space:nowrap;">${fmtNum(it.value)}</td>
              <td style="padding:8px 6px;border-top:1px solid #eef0f2;font-size:12px;color:#5a5a5a;text-align:right;white-space:nowrap;">${ref}</td>
              <td style="padding:8px 6px;border-top:1px solid #eef0f2;text-align:center;">${badge(it.status)}</td>
              <td style="padding:8px 6px;border-top:1px solid #eef0f2;font-size:12px;color:#5a5a5a;">${esc(it.violations.join(" ")) || "—"}</td>
              <td style="padding:8px 6px;border-top:1px solid #eef0f2;font-size:12px;color:#5a5a5a;white-space:nowrap;">${esc(it.analystName ?? "—")}<br><span style="color:#9aa1ae;">${fmtWhen(it.runAt)}</span></td>
            </tr>`;
        })
        .join("");
      return `
        <h2 style="margin:26px 0 8px;font-size:15px;font-weight:700;color:#61396f;">${esc(eq)} <span style="font-weight:500;color:#9aa1ae;">· ${byEquipment.get(eq)!.length}</span></h2>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th align="left" style="padding:4px 6px;font-size:11px;color:#9aa1ae;font-weight:600;text-transform:uppercase;">Analito</th>
            <th align="right" style="padding:4px 6px;font-size:11px;color:#9aa1ae;font-weight:600;text-transform:uppercase;">Valor</th>
            <th align="right" style="padding:4px 6px;font-size:11px;color:#9aa1ae;font-weight:600;text-transform:uppercase;">Média / DP</th>
            <th align="center" style="padding:4px 6px;font-size:11px;color:#9aa1ae;font-weight:600;text-transform:uppercase;">Status</th>
            <th align="left" style="padding:4px 6px;font-size:11px;color:#9aa1ae;font-weight:600;text-transform:uppercase;">Regras</th>
            <th align="left" style="padding:4px 6px;font-size:11px;color:#9aa1ae;font-weight:600;text-transform:uppercase;">Analista</th>
          </tr>
          ${rows}
        </table>`;
    })
    .join("");

  const summary = [rejects ? `${rejects} rejeitar` : null, alerts ? `${alerts} alerta` : null]
    .filter(Boolean)
    .join(" · ");
  const subject = `⚠ CQ: ${summary} — ${equipments.join(", ")}`;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f8f9fa;font-family:'Raleway',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:40px 0;">
        <tr><td align="center">
          <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:linear-gradient(135deg,#61396f 0%,#9155a7 100%);padding:30px 40px;text-align:center;">
                <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Alchemy Control Chart</p>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Resumo de alertas de controle de qualidade</p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 40px 36px;">
                <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0c0b0b;">${items.length} corrida${items.length > 1 ? "s" : ""} fora dos limites</p>
                <p style="margin:0;font-size:14px;color:#5a5a5a;">${summary}</p>
                ${sections}
                <p style="margin:26px 0 0;font-size:13px;">
                  <a href="${APP_URL}/analitos/painel" style="color:#9155a7;font-weight:600;">Abrir o painel de controle →</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f8f9fa;padding:18px 40px;border-top:1px solid #eef0f2;">
                <p style="margin:0;font-size:12px;color:#9aa1ae;text-align:center;">
                  © ${new Date().getFullYear()} Alchemypet · Alchemy Control Chart<br>
                  E-mail automático enviado a supervisores e administradores. Não responda.
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  if (!resend) {
    console.log(`[email] RESEND_API_KEY não configurada — resumo com ${items.length} alerta(s) não enviado para ${to.join(", ")}`);
    return { sent: false, error: "not_configured" };
  }

  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error("[email] Falha ao enviar resumo de alertas:", error);
      return { sent: false, error: error.name };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] Exceção ao enviar resumo de alertas:", e);
    return { sent: false, error: e instanceof Error ? e.name : "exception" };
  }
}
