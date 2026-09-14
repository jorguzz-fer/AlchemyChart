import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { checkWestgard } from "@/lib/westgard";
import { resolveControlCenter, type CenterSource } from "@/lib/control-center";

export const maxDuration = 300;

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN"] as const;

// Reavalia o status Westgard (OK/ALERTA/REJEITAR) de TODAS as corridas contra
// o centro de referência atual (manual > bula > calculada).
//
// O status é calculado na hora do lançamento e fica gravado na corrida. Quando
// o alvo muda — como agora, que a bula passou na frente da média calculada —
// as corridas antigas continuam com o veredito de antes: um DP apertado
// demais deixou uma fileira de "rejeitar" falsos. Esta ferramenta refaz o
// veredito de cada corrida com o alvo novo. Não toca em valor, data nem
// autor; só em status/violations.
//
// Aceita uma data "a partir de": só corridas desse dia em diante mudam de
// veredito. O histórico anterior continua entrando no cálculo das regras que
// olham corridas passadas (2:2s, 4:1s, 10x…) — o que fica preservado é só o
// status já gravado das corridas antigas.

type RunStatus = "OK" | "ALERT" | "REJECT";

type Change = { runId: string; from: RunStatus; to: RunStatus; violations: string[] };

type AnalyteReport = {
  analyte: string;
  equipment: string;
  level: number;
  source: CenterSource | null; // null = sem referência, pulado
  runs: number;
  changes: number;
  transitions: Record<string, number>; // "REJECT→OK": n
};

// Data no fuso do laboratório (São Paulo, -03:00 fixo desde 2019).
// "2026-09-01" vira meia-noite em Brasília — não meia-noite UTC, que seria
// 21h do dia anterior e puxaria corridas da noite de 31/08.
function parseFrom(raw: string | null): { from: Date | null; error?: string } {
  if (!raw) return { from: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { from: null, error: "Data inválida (use AAAA-MM-DD)" };
  const d = new Date(`${raw}T00:00:00-03:00`);
  if (isNaN(d.getTime())) return { from: null, error: "Data inválida" };
  return { from: d };
}

function sameViolations(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function buildPlan(tenantId: string, from: Date | null) {
  // Nível 3 nunca é usado neste laboratório — fica fora.
  const analytes = await prisma.analyte.findMany({
    where: { unitRel: { tenantId }, active: true, level: { lte: 2 } },
    select: {
      id: true,
      name: true,
      level: true,
      equipmentId: true,
      westgardRules: true,
      equipment: { select: { name: true } },
    },
    orderBy: [{ name: "asc" }, { equipmentId: "asc" }, { level: "asc" }],
  });

  const changes: Change[] = [];
  const report: AnalyteReport[] = [];

  for (const a of analytes) {
    const runs = await prisma.run.findMany({
      where: { analyteId: a.id },
      orderBy: { runAt: "asc" },
      select: { id: true, value: true, status: true, violations: true, runAt: true },
    });
    if (runs.length === 0) continue;

    // Só corridas dentro da janela mudam; as anteriores ficam só como histórico.
    const inWindow = from ? runs.filter((r) => r.runAt >= from) : runs;
    if (inWindow.length === 0) continue;

    const center = await resolveControlCenter({
      tenantId,
      analyteId: a.id,
      analyteName: a.name,
      equipmentId: a.equipmentId,
      equipmentName: a.equipment?.name ?? "",
      level: a.level,
    });

    const entry: AnalyteReport = {
      analyte: a.name,
      equipment: a.equipment?.name ?? a.equipmentId,
      level: a.level,
      source: center?.source ?? null,
      runs: inWindow.length,
      changes: 0,
      transitions: {},
    };

    if (!center) {
      // Sem referência não há como avaliar — reporta e não mexe.
      report.push(entry);
      continue;
    }

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (from && run.runAt < from) continue; // fora da janela: só serve de histórico
      const history = runs.slice(0, i).map((r) => r.value);
      const result = checkWestgard(run.value, center.mean, center.sd, history, a.westgardRules ?? null);
      // "prev", não "from": "from" é a janela de data (parâmetro) — o nome
      // repetido aqui fazia sombra e quebrava a comparação de datas acima.
      const prev = run.status as RunStatus;
      if (prev !== result.status || !sameViolations(run.violations, result.violations)) {
        changes.push({ runId: run.id, from: prev, to: result.status, violations: result.violations });
        entry.changes++;
        const key = `${prev}→${result.status}`;
        entry.transitions[key] = (entry.transitions[key] ?? 0) + 1;
      }
    }
    report.push(entry);
  }

  return { changes, report, from };
}

function summarize(plan: Awaited<ReturnType<typeof buildPlan>>) {
  const { changes, report } = plan;

  const bySource: Record<string, number> = { manual: 0, bula: 0, calculada: 0, nenhuma: 0 };
  for (const r of report) bySource[r.source ?? "nenhuma"]++;

  const transitions: Record<string, number> = {};
  for (const c of changes) {
    const key = `${c.from}→${c.to}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
  }

  return {
    from: plan.from ? plan.from.toISOString() : null,
    totals: {
      analytes: report.length,
      runs: report.reduce((s, r) => s + r.runs, 0),
      changes: changes.length,
      bySource,
      transitions,
    },
    // Só quem muda — a lista completa seria dezenas de linhas sem informação
    details: report
      .filter((r) => r.changes > 0)
      .sort((a, b) => b.changes - a.changes || a.analyte.localeCompare(b.analyte, "pt-BR")),
    semReferencia: report
      .filter((r) => r.source === null)
      .map((r) => ({ analyte: r.analyte, equipment: r.equipment, level: r.level, runs: r.runs })),
  };
}

// GET — prévia (não altera nada)
export async function GET(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const parsed = parseFrom(new URL(req.url).searchParams.get("from"));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const plan = await buildPlan(session.user.tenantId, parsed.from);
  return NextResponse.json(summarize(plan));
}

// POST — aplica (idempotente: rodar de novo não muda nada)
export async function POST(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const tenantId = session.user.tenantId;
  // Data inválida aqui seria perigoso: aplicaria em TODAS as corridas achando
  // que está limitado. Por isso é erro, não fallback.
  const parsed = parseFrom(new URL(req.url).searchParams.get("from"));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const plan = await buildPlan(tenantId, parsed.from);
  const summary = summarize(plan);

  // Em lotes para não abrir uma transação gigante
  const BATCH = 100;
  let updated = 0;
  for (let i = 0; i < plan.changes.length; i += BATCH) {
    const slice = plan.changes.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((c) =>
        prisma.run.update({
          where: { id: c.runId },
          data: { status: c.to, violations: c.violations },
        })
      )
    );
    updated += slice.length;
  }

  const result = {
    updated,
    from: summary.from,
    transitions: summary.totals.transitions,
    bySource: summary.totals.bySource,
  };

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "admin.reevaluateRuns",
    entity: "Tenant",
    entityId: tenantId,
    meta: result,
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true, result });
}
