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
