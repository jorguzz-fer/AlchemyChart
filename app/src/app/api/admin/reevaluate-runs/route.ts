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

function sameViolations(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function buildPlan(tenantId: string) {
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
      select: { id: true, value: true, status: true, violations: true },
    });
    if (runs.length === 0) continue;

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
      runs: runs.length,
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
      const history = runs.slice(0, i).map((r) => r.value);
      const result = checkWestgard(run.value, center.mean, center.sd, history, a.westgardRules ?? null);
      const from = run.status as RunStatus;
      if (from !== result.status || !sameViolations(run.violations, result.violations)) {
        changes.push({ runId: run.id, from, to: result.status, violations: result.violations });
        entry.changes++;
        const key = `${from}→${result.status}`;
        entry.transitions[key] = (entry.transitions[key] ?? 0) + 1;
      }
    }
    report.push(entry);
  }

  return { changes, report };
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
export async function GET() {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const plan = await buildPlan(session.user.tenantId);
  return NextResponse.json(summarize(plan));
}

// POST — aplica (idempotente: rodar de novo não muda nada)
export async function POST(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const tenantId = session.user.tenantId;
  const plan = await buildPlan(tenantId);
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
