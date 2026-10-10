import { prisma } from "@/lib/db";
import { sendControlAlerts, type ControlAlertItem } from "@/lib/email";

// Fila de alertas de controle com envio em RESUMO.
//
// Por que existe: o "Lançamento em Massa" salva ~80 corridas em paralelo, e
// cada uma que cai em Alerta/Rejeitar mandava um e-mail próprio na hora.
// Resultado: 80 e-mails no mesmo segundo (limite do Resend é 10/s) e a cota
// mensal do plano consumida em poucos dias. Aqui tudo que chega dentro da
// janela vira UM e-mail por laboratório, agrupado por equipamento.
//
// Estado em memória: o app roda como um único processo Node persistente
// (standalone no Coolify), então o buffer sobrevive entre requisições. Se o
// processo reiniciar dentro da janela, os alertas pendentes se perdem — as
// corridas já estão gravadas, só a notificação não sai. Aceitável.

const WINDOW_MS = 60_000; // junta tudo que chegar em 1 minuto
const QUOTA_PAUSE_MS = 24 * 60 * 60 * 1000; // cota mensal esgotada: pausa 24 h

// Interruptor. DESLIGADO por padrão: só envia com CONTROL_ALERT_EMAILS=on no
// ambiente (Coolify → Environment Variables → restart). Pedido do laboratório
// em 10/10/2026, depois de a cota do Resend estourar; religa sem deploy.
// Corridas continuam gravadas e avaliadas normalmente — só o e-mail não sai.
const ENABLED = process.env.CONTROL_ALERT_EMAILS === "on";
let disabledNoticeShown = false;

type Bucket = {
  items: ControlAlertItem[];
  timer: ReturnType<typeof setTimeout> | null;
};

const buckets = new Map<string, Bucket>();

// Disjuntor: quando o Resend responde "cota mensal esgotada", não adianta
// insistir — cada tentativa é um 429 no log. Pausa e registra UMA linha
// por descarte, com a contagem, em vez de uma por alerta.
let quotaBlockedUntil = 0;
let droppedWhileBlocked = 0;

export function queueControlAlert(tenantId: string, item: ControlAlertItem): void {
  if (!ENABLED) {
    if (!disabledNoticeShown) {
      console.log("[alertas] e-mails de alerta DESLIGADOS (CONTROL_ALERT_EMAILS != on) — corridas seguem gravadas e avaliadas; só a notificação não sai");
      disabledNoticeShown = true;
    }
    return;
  }
  let bucket = buckets.get(tenantId);
  if (!bucket) {
    bucket = { items: [], timer: null };
    buckets.set(tenantId, bucket);
  }
  bucket.items.push(item);
  if (!bucket.timer) {
    bucket.timer = setTimeout(() => {
      void flush(tenantId);
    }, WINDOW_MS);
  }
}

async function flush(tenantId: string): Promise<void> {
  const bucket = buckets.get(tenantId);
  if (!bucket) return;
  buckets.delete(tenantId);
  const items = bucket.items;
  if (items.length === 0) return;

  if (Date.now() < quotaBlockedUntil) {
    droppedWhileBlocked += items.length;
    console.warn(
      `[alertas] cota de e-mail esgotada — ${items.length} alerta(s) não enviado(s) agora (${droppedWhileBlocked} desde a pausa; retoma ${new Date(quotaBlockedUntil).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})`
    );
    return;
  }

  try {
    const recipients = await prisma.user.findMany({
      where: { tenantId, active: true, role: { in: ["SUPERVISOR", "ADMIN", "SUPERADMIN"] } },
      select: { email: true },
    });
    const to = recipients.map((r) => r.email).filter((e): e is string => !!e);
    if (to.length === 0) return;

    let result = await sendControlAlerts(to, items);

    // Estouro de 10/s só acontece se vários laboratórios flusharem juntos;
    // uma espera curta resolve. Cota mensal não tem retry que resolva.
    if (result.error === "rate_limit_exceeded") {
      await new Promise((r) => setTimeout(r, 1500));
      result = await sendControlAlerts(to, items);
    }

    if (result.error === "monthly_quota_exceeded") {
      quotaBlockedUntil = Date.now() + QUOTA_PAUSE_MS;
      droppedWhileBlocked = items.length;
      console.error(
        `[alertas] COTA MENSAL DE E-MAIL ESGOTADA no Resend — ${items.length} alerta(s) descartado(s); envio pausado por 24 h. Aumente o plano ou aguarde a virada do mês.`
      );
    } else if (result.error) {
      console.error(`[alertas] falha ao enviar resumo com ${items.length} alerta(s): ${result.error}`);
    }
  } catch (e) {
    console.error("[alertas] exceção ao enviar resumo:", e);
  }
}

