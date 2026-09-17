import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { calculateStats } from "@/lib/stats";
import { SETUP_THRESHOLD } from "@/lib/control-center";

export const maxDuration = 300;

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN"] as const;
const RETIRED_STATUS = new Set(["EXPIRADO", "DESABILITADO"]);

// Restaura corridas a partir do CSV gerado por "Apagar corridas anteriores a
// uma data" (/api/admin/purge-runs-before?format=csv).
//
// O que o CSV NÃO carrega, e portanto não volta:
//   - segundos do runAt (só dd/mm/aaaa, hh:mm). Corridas do mesmo controle no
//     mesmo minuto voltam na ORDEM DO ARQUIVO — que é a ordem original —
//     espaçadas de 1 s. O desempate é determinístico, então reenviar o mesmo
//     arquivo gera as mesmas datas e a deduplicação abaixo reconhece tudo.
//   - NonConformity das corridas apagadas.
//   - ids originais (as corridas nascem com id novo).
//
// Status e violações voltam COMO ESTAVAM no backup. Se o alvo mudou desde
// então, rode "Reavaliar corridas contra o alvo" depois.
//
// POST { csv: string, apply?: boolean } — sem apply é só prévia.

type RunStatus = "OK" | "ALERT" | "REJECT";

// ── CSV ──────────────────────────────────────────────────────────────────────

// Parser com aspas ("" = aspa literal), campos com quebra de linha e CRLF.
function parseCsv(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

interface ParsedRow {
  line: number;
  analyte: string;
  equipment: string;
  level: number;
  runAt: Date;
  value: number;
  status: RunStatus;
  violations: string[];
  note: string | null;
  userName: string;
}

const REQUIRED_COLUMNS = ["Analito", "Equipamento", "Nível", "Data/Hora", "Valor", "Status", "Violações", "Observação", "Quem digitou"];

function parseRows(text: string): {
  rows: ParsedRow[];
  invalid: { line: number; reason: string }[];
  error?: string;
} {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length < 2) return { rows: [], invalid: [], error: "Arquivo vazio ou sem linhas de dados" };

  const header = table[0].map((h) => h.trim());
  const ix: Record<string, number> = {};
  for (const name of REQUIRED_COLUMNS) {
    const i = header.indexOf(name);
    if (i < 0) return { rows: [], invalid: [], error: `Coluna "${name}" não encontrada — este não parece ser um backup de corridas` };
    ix[name] = i;
  }

  const rows: ParsedRow[] = [];
  const invalid: { line: number; reason: string }[] = [];
  // Desempate: nº de corridas já vistas no mesmo controle + mesmo minuto
  const seen = new Map<string, number>();

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const line = r + 1;
    const get = (name: string) => (cells[ix[name]] ?? "").trim();

    const analyte = get("Analito");
    const equipment = get("Equipamento");
    const level = Number(get("Nível"));
    if (!analyte || !equipment) { invalid.push({ line, reason: "analito ou equipamento vazio" }); continue; }
    if (!Number.isInteger(level) || level < 1 || level > 3) { invalid.push({ line, reason: `nível inválido: "${get("Nível")}"` }); continue; }

    const m = get("Data/Hora").match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})$/);
    if (!m) { invalid.push({ line, reason: `data inválida: "${get("Data/Hora")}"` }); continue; }
    // Horário de Brasília (-03:00 fixo desde 2019), como foi exportado
    const base = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`);
    if (isNaN(base.getTime())) { invalid.push({ line, reason: `data inválida: "${get("Data/Hora")}"` }); continue; }

    const value = Number(get("Valor").replace(",", "."));
    if (get("Valor") === "" || !Number.isFinite(value)) { invalid.push({ line, reason: `valor inválido: "${get("Valor")}"` }); continue; }

    const status = get("Status") as RunStatus;
    if (status !== "OK" && status !== "ALERT" && status !== "REJECT") { invalid.push({ line, reason: `status inválido: "${get("Status")}"` }); continue; }

    const tieKey = `${analyte}|${equipment}|${level}|${base.getTime()}`;
    const n = seen.get(tieKey) ?? 0;
    seen.set(tieKey, n + 1);

    rows.push({
      line,
      analyte,
      equipment,
      level,
      runAt: new Date(base.getTime() + n * 1000),
      value,
      status,
      violations: get("Violações").split(/\s+/).filter(Boolean),
      note: get("Observação") || null,
      userName: get("Quem digitou"),
    });
  }

  return { rows, invalid };
}

// ── Plano ────────────────────────────────────────────────────────────────────

async function buildPlan(tenantId: string, fallbackUserId: string, rows: ParsedRow[]) {
  const [equipments, analytes, users, ams] = await Promise.all([
    prisma.equipment.findMany({ where: { unit: { tenantId } }, select: { id: true, name: true } }),
    prisma.analyte.findMany({
      where: { unitRel: { tenantId } },
      select: { id: true, name: true, level: true, equipmentId: true, createdAt: true, _count: { select: { runs: true } } },
    }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.analyteMaterial.findMany({
      where: { analyte: { unitRel: { tenantId } } },
      select: { id: true, analyteId: true, equipmentId: true, level: true, status: true, material: { select: { active: true } } },
    }),
  ]);

  const equipByName = new Map<string, string>();
  for (const e of equipments) if (!equipByName.has(e.name)) equipByName.set(e.name, e.id);

  const userByName = new Map<string, string>();
  for (const u of users) if (u.name && !userByName.has(u.name)) userByName.set(u.name, u.id);

  // Vínculo (AnalyteMaterial) por analito+equipamento+nível: utilizável e PRONTO primeiro
  const amRank = (am: (typeof ams)[number]) => {
    const usable = !RETIRED_STATUS.has(am.status) && am.material?.active !== false;
    return (usable ? 0 : 2) + (am.status === "PRONTO" ? 0 : 1);
  };
  const amByKey = new Map<string, (typeof ams)[number]>();
  for (const am of ams) {
    const key = `${am.analyteId}|${am.equipmentId}|${am.level}`;
    const cur = amByKey.get(key);
    if (!cur || amRank(am) < amRank(cur)) amByKey.set(key, am);
  }

  // Analyte por nome+equipamento+nível. O modelo legado admite gêmeos: prefere
  // o que tem vínculo naquele nível, depois o com mais corridas, depois o mais antigo.
  const analyteCandidates = new Map<string, (typeof analytes)[number][]>();
  for (const a of analytes) {
    const key = `${a.name}|${a.equipmentId}|${a.level}`;
    const arr = analyteCandidates.get(key) ?? [];
    arr.push(a);
    analyteCandidates.set(key, arr);
  }
  let ambiguousCombos = 0;
  const analyteByKey = new Map<string, string>();
  for (const [key, arr] of analyteCandidates) {
    if (arr.length > 1) ambiguousCombos++;
    const best = [...arr].sort((x, y) => {
      const hx = amByKey.has(`${x.id}|${x.equipmentId}|${x.level}`) ? 0 : 1;
      const hy = amByKey.has(`${y.id}|${y.equipmentId}|${y.level}`) ? 0 : 1;
      return hx - hy || y._count.runs - x._count.runs || x.createdAt.getTime() - y.createdAt.getTime();
    })[0];
    analyteByKey.set(key, best.id);
  }

  // Deduplicação: corridas que já existem na janela do arquivo
  let minT = Infinity;
  let maxT = -Infinity;
  for (const r of rows) {
    const t = r.runAt.getTime();
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const existing = rows.length
    ? await prisma.run.findMany({
        where: { analyte: { unitRel: { tenantId } }, runAt: { gte: new Date(minT), lte: new Date(maxT) } },
        select: { analyteId: true, runAt: true, value: true },
      })
    : [];
  const existingKeys = new Set(existing.map((r) => `${r.analyteId}|${r.runAt.getTime()}|${r.value}`));

  const toInsert: {
    analyteId: string;
    analyteMaterialId: string | null;
    equipmentId: string;
    userId: string;
    value: number;
    runAt: Date;
    status: RunStatus;
    violations: string[];
    note: string | null;
  }[] = [];
  const unresolved = new Map<string, { analyte: string; equipment: string; level: number; reason: string; runs: number }>();
  const missingUsers = new Map<string, number>();
  const byEquipment = new Map<string, number>();
  let alreadyExists = 0;

  for (const r of rows) {
    const equipmentId = equipByName.get(r.equipment);
    const analyteId = equipmentId ? analyteByKey.get(`${r.analyte}|${equipmentId}|${r.level}`) : undefined;
    if (!equipmentId || !analyteId) {
      const key = `${r.analyte}|${r.equipment}|${r.level}`;
      const u = unresolved.get(key) ?? {
        analyte: r.analyte,
        equipment: r.equipment,
        level: r.level,
        reason: !equipmentId ? "equipamento não existe mais" : "analito não existe mais neste equipamento/nível",
        runs: 0,
      };
      u.runs++;
      unresolved.set(key, u);
      continue;
    }

    if (existingKeys.has(`${analyteId}|${r.runAt.getTime()}|${r.value}`)) {
      alreadyExists++;
      continue;
    }

    let userId = userByName.get(r.userName);
    if (!userId) {
      missingUsers.set(r.userName || "(vazio)", (missingUsers.get(r.userName || "(vazio)") ?? 0) + 1);
      userId = fallbackUserId;
    }

    toInsert.push({
      analyteId,
      analyteMaterialId: amByKey.get(`${analyteId}|${equipmentId}|${r.level}`)?.id ?? null,
      equipmentId,
      userId,
      value: r.value,
      runAt: r.runAt,
      status: r.status,
      violations: r.violations,
      note: r.note,
    });
    byEquipment.set(r.equipment, (byEquipment.get(r.equipment) ?? 0) + 1);
  }

  return {
    toInsert,
    summary: {
      totals: {
        rows: rows.length,
        toInsert: toInsert.length,
        alreadyExists,
        unresolved: Array.from(unresolved.values()).reduce((s, u) => s + u.runs, 0),
        ambiguousCombos,
        analytes: new Set(toInsert.map((t) => t.analyteId)).size,
      },
      oldest: rows.length ? new Date(minT).toISOString() : null,
      newest: rows.length ? new Date(maxT).toISOString() : null,
      byEquipment: Array.from(byEquipment, ([equipment, runs]) => ({ equipment, runs })).sort((a, b) =>
        a.equipment.localeCompare(b.equipment, "pt-BR")
      ),
      unresolved: Array.from(unresolved.values()).sort((a, b) => b.runs - a.runs),
      missingUsers: Array.from(missingUsers, ([name, runs]) => ({ name, runs })).sort((a, b) => b.runs - a.runs),
    },
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { session, error } = await requireRole([...ADMIN_ROLES]);
  if (error) return error;

  const tenantId = session.user.tenantId;
  const body = await req.json().catch(() => null);
  const csv = typeof body?.csv === "string" ? body.csv : "";
  const apply = body?.apply === true;
  if (!csv.trim()) return NextResponse.json({ error: "Envie o arquivo CSV do backup" }, { status: 400 });

  const parsed = parseRows(csv);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const plan = await buildPlan(tenantId, session.user.id, parsed.rows);
  const preview = {
    ...plan.summary,
    invalid: { count: parsed.invalid.length, sample: parsed.invalid.slice(0, 10) },
  };

  if (!apply) return NextResponse.json(preview);

  // Insere em lotes; createMany é uma única instrução por lote.
  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < plan.toInsert.length; i += BATCH) {
    const r = await prisma.run.createMany({ data: plan.toInsert.slice(i, i + BATCH) });
    inserted += r.count;
  }

  // Recalcula a StatPeriod "USO" de quem recebeu corridas — janela das 20
  // primeiras (mesma regra de /api/runs/[id] e da limpeza).
  const affected = Array.from(new Set(plan.toInsert.map((t) => t.analyteId)));
  let statsRecomputed = 0;
  for (const aid of affected) {
    const runs = await prisma.run.findMany({
      where: { analyteId: aid },
      orderBy: { runAt: "asc" },
      take: SETUP_THRESHOLD,
      select: { value: true },
    });
    if (runs.length < SETUP_THRESHOLD) continue;
    const s = calculateStats(runs.map((r) => r.value));
    if (!s) continue;
    const existing = await prisma.statPeriod.findFirst({
      where: { analyteId: aid, period: "USO" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      await prisma.statPeriod.update({ where: { id: existing.id }, data: { mean: s.mean, sd: s.sd, cv: s.cv, n: s.n } });
    } else {
      await prisma.statPeriod.create({ data: { analyteId: aid, period: "USO", mean: s.mean, sd: s.sd, cv: s.cv, n: s.n } });
    }
    statsRecomputed++;
  }

  const result = {
    inserted,
    alreadyExists: preview.totals.alreadyExists,
    unresolved: preview.totals.unresolved,
    invalid: preview.invalid.count,
    analytesAffected: affected.length,
    statsRecomputed,
    usersFallback: preview.missingUsers.reduce((s, u) => s + u.runs, 0),
  };

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "admin.restoreRuns",
    entity: "Tenant",
    entityId: tenantId,
    meta: { ...result, oldest: preview.oldest, newest: preview.newest },
    ip: getClientIp(req),
  });

  return NextResponse.json({ ok: true, result, preview });
}
