import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { calculateStats } from "@/lib/stats";
import { SETUP_THRESHOLD } from "@/lib/control-center";

export const maxDuration = 300;

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN"] as const;

// Apaga TODAS as corridas anteriores a uma data (fuso de Brasília), em
// definitivo. Pedido do laboratório para começar do zero: o histórico
// importado do QualiChart veio com níveis misturados e materiais trocados, e
// eles preferem manter só o que foi lançado já no sistema corrigido.
//
// O que cai junto:
//   - NonConformity das corridas apagadas (cascade; apagamos explicitamente
//     antes, para não depender do ON DELETE do banco).
//   - StatPeriod "USO" dos analitos afetados é recalculada com as corridas que
//     sobram (janela das 20 primeiras) ou removida se sobrarem menos de 20 —
//     nesse caso o rótulo do controle volta a "Preparo" até completar 20 de
//     novo (a bula continua valendo como alvo, então o Westgard não para).
//
// Não toca em: materiais, analitos, equipamentos, usuários, auditoria.
//
// GET ?before=AAAA-MM-DD            → prévia
// GET ?before=AAAA-MM-DD&format=csv → backup das corridas que seriam apagadas
// DELETE ?before=AAAA-MM-DD         → apaga

// Meia-noite em Brasília (-03:00 fixo desde 2019), não meia-noite UTC.
function parseBefore(raw: string | null): { before: Date | null; error?: string } {
  if (!raw) return { before: null, error: "Informe a data (AAAA-MM-DD)" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { before: null, error: "Data inválida (use AAAA-MM-DD)" };
  const d = new Date(`${raw}T00:00:00-03:00`);
  if (isNaN(d.getTime())) return { before: null, error: "Data inválida" };
  return { before: d };
}

function scopeWhere(tenantId: string, before: Date) {
  return { runAt: { lt: before }, analyte: { unitRel: { tenantId } } };
}

async function loadPreview(tenantId: string, before: Date) {
  const [runs, keep, nonConformities] = await Promise.all([
    prisma.run.findMany({
      where: scopeWhere(tenantId, before),
      orderBy: { runAt: "asc" },
      select: {
        id: true,
        runAt: true,
        value: true,
        status: true,
        violations: true,
        note: true,
        analyteId: true,
        analyte: { select: { name: true, level: true, unit: true } },
        equipment: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.run.count({ where: { runAt: { gte: before }, analyte: { unitRel: { tenantId } } } }),
    prisma.nonConformity.count({ where: { run: scopeWhere(tenantId, before) } }),
  ]);

  const byEquipment = new Map<string, { equipment: string; runs: number; oldest: Date; newest: Date }>();
  const analytes = new Set<string>();
  for (const r of runs) {
    analytes.add(r.analyteId);
    const key = r.equipment?.name ?? "—";
    const e = byEquipment.get(key) ?? { equipment: key, runs: 0, oldest: r.runAt, newest: r.runAt };
    e.runs++;
    if (r.runAt < e.oldest) e.oldest = r.runAt;
    if (r.runAt > e.newest) e.newest = r.runAt;
    byEquipment.set(key, e);
  }

  return {
    runs,
    summary: {
      before: before.toISOString(),
      totals: {
        runsToDelete: runs.length,
        runsToKeep: keep,
        nonConformities,
        analytes: analytes.size,
      },
      oldest: runs[0]?.runAt.toISOString() ?? null,
      newest: runs[runs.length - 1]?.runAt.toISOString() ?? null,
      byEquipment: Array.from(byEquipment.values())
        .map((e) => ({ ...e, oldest: e.oldest.toISOString(), newest: e.newest.toISOString() }))
        .sort((a, b) => a.equipment.localeCompare(b.equipment, "pt-BR")),
    },
  };
}

// CSV para o Excel em português: ";" como separador, BOM para acentuar certo.
function toCsv(runs: Awaited<ReturnType<typeof loadPreview>>["runs"]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const fmt = (d: Date) =>
    d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const header = ["Analito", "Unidade", "Equipamento", "Nível", "Data/Hora", "Valor", "Status", "Violações", "Observação", "Quem digitou"];
  const lines = runs.map((r) =>
    [
      r.analyte?.name,
      r.analyte?.unit,
      r.equipment?.name,
      r.analyte?.level,
      fmt(r.runAt),
      String(r.value).replace(".", ","),
      r.status,
      r.violations.join(" "),
      r.note,
      r.user?.name,
    ]
      .map(q)
      .join(";")
  );
  return "﻿" + [header.map(q).join(";"), ...lines].join("\r\n");
}

// GET — prévia ou backup CSV (não altera nada)
export async function GET(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const url = new URL(req.url);
  const parsed = parseBefore(url.searchParams.get("before"));
  if (!parsed.before) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { runs, summary } = await loadPreview(session.user.tenantId, parsed.before);

  if (url.searchParams.get("format") === "csv") {
    const stamp = url.searchParams.get("before");
    return new NextResponse(toCsv(runs), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="backup-corridas-antes-de-${stamp}.csv"`,
      },
    });
  }

  return NextResponse.json(summary);
}

// DELETE — apaga em definitivo
export async function DELETE(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const tenantId = session.user.tenantId;
  const url = new URL(req.url);
  const parsed = parseBefore(url.searchParams.get("before"));
  if (!parsed.before) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const before = parsed.before;

  // Analitos afetados ANTES de apagar — depois não dá mais para saber.
  const affectedRows = await prisma.run.findMany({
    where: scopeWhere(tenantId, before),
    select: { analyteId: true },
    distinct: ["analyteId"],
  });
  const affected = affectedRows.map((r) => r.analyteId);

  const [nc, deleted] = await prisma.$transaction([
    prisma.nonConformity.deleteMany({ where: { run: scopeWhere(tenantId, before) } }),
    prisma.run.deleteMany({ where: scopeWhere(tenantId, before) }),
  ]);

  // Recalcula a StatPeriod "USO" de quem perdeu corridas — janela das 20
  // primeiras que SOBRARAM (mesma regra do recompute em /api/runs/[id]).
  let statsRecomputed = 0;
  let statsRemoved = 0;
  for (const aid of affected) {
    const remaining = await prisma.run.findMany({
      where: { analyteId: aid },
      orderBy: { runAt: "asc" },
      select: { value: true },
    });
    const existing = await prisma.statPeriod.findFirst({
      where: { analyteId: aid, period: "USO" },
      orderBy: { createdAt: "desc" },
    });
    if (remaining.length >= SETUP_THRESHOLD) {
      const s = calculateStats(remaining.slice(0, SETUP_THRESHOLD).map((r) => r.value));
      if (!s) continue;
      if (existing) {
        await prisma.statPeriod.update({ where: { id: existing.id }, data: { mean: s.mean, sd: s.sd, cv: s.cv, n: s.n } });
      } else {
        await prisma.statPeriod.create({ data: { analyteId: aid, period: "USO", mean: s.mean, sd: s.sd, cv: s.cv, n: s.n } });
      }
      statsRecomputed++;
    } else if (existing) {
      await prisma.statPeriod.delete({ where: { id: existing.id } });
      statsRemoved++;
    }
  }

  const result = {
    before: before.toISOString(),
    runsDeleted: deleted.count,
    nonConformitiesDeleted: nc.count,
    analytesAffected: affected.length,
    statsRecomputed,
    statsRemoved,
  };

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "admin.purgeRunsBefore",
    entity: "Tenant",
    entityId: tenantId,
    meta: result,
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true, result });
}
