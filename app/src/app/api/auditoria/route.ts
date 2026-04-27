import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";
import { ymdInLabTz, weekdayInLabTz } from "@/lib/tz";

// GET /api/auditoria?equipment=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Retorna grid calendário diário × analitos com contagem de corridas.
// Default range: últimos 30 dias.
export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const url = new URL(req.url);
  const equipmentId = url.searchParams.get("equipment") ?? "";
  const fromStr = url.searchParams.get("from") ?? "";
  const toStr = url.searchParams.get("to") ?? "";

  if (!equipmentId) return NextResponse.json({ error: "equipment obrigatório" }, { status: 400 });

  // Valida ownership
  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, unit: { tenantId: session.user.tenantId } },
    select: { id: true, name: true },
  });
  if (!equipment) return NextResponse.json({ error: "Equipamento inválido" }, { status: 404 });

  // Range padrão: últimos 30 dias
  const to = toStr ? new Date(toStr) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);

  // Lista analitos do equipamento (deduplicada por nome+unidade)
  const analytes = await prisma.analyte.findMany({
    where: {
      equipmentId,
      unitRel: { tenantId: session.user.tenantId },
      active: true,
    },
    select: { name: true, unit: true },
  });

  const uniqueMap = new Map<string, { key: string; name: string; unit: string | null }>();
  for (const a of analytes) {
    const key = `${a.name}||${a.unit ?? ""}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, { key, name: a.name, unit: a.unit });
  }
  const uniqueAnalytes = Array.from(uniqueMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );

  // Busca runs do equipamento no período
  const runs = await prisma.run.findMany({
    where: {
      equipmentId,
      runAt: { gte: from, lte: to },
      analyte: { unitRel: { tenantId: session.user.tenantId } },
    },
    select: {
      runAt: true,
      analyte: { select: { name: true, unit: true } },
    },
  });

  // Agrega contagem por (date, analyteKey) — date no fuso do laboratório
  const counts = new Map<string, number>();
  for (const r of runs) {
    const date = ymdInLabTz(new Date(r.runAt));
    const aKey = `${r.analyte.name}||${r.analyte.unit ?? ""}`;
    const key = `${date}||${aKey}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Gera array de dias (descendente, mais recente primeiro)
  const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const days: Array<{
    date: string;
    weekday: string;
    isWeekend: boolean;
    counts: Record<string, number>;
  }> = [];

  // Cursor às 12:00 UTC do "dia local" — garante que `ymdInLabTz` retorne
  // o dia local correto e que `setUTCDate(-1)` ande exatamente 24h sem
  // ser afetado por DST do servidor.
  const toLocal = ymdInLabTz(to);
  const fromLocal = ymdInLabTz(from);
  const cursor = new Date(`${toLocal}T12:00:00Z`);
  const stop = new Date(`${fromLocal}T12:00:00Z`);

  while (cursor.getTime() >= stop.getTime()) {
    const date = ymdInLabTz(cursor);
    const wd = weekdayInLabTz(cursor);
    const isWeekend = wd === 0 || wd === 6;

    const dayCounts: Record<string, number> = {};
    for (const a of uniqueAnalytes) {
      dayCounts[a.key] = counts.get(`${date}||${a.key}`) ?? 0;
    }

    days.push({ date, weekday: WEEKDAYS[wd], isWeekend, counts: dayCounts });
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return NextResponse.json({
    equipment,
    analytes: uniqueAnalytes,
    days,
    fromDate: ymdInLabTz(from),
    toDate: ymdInLabTz(to),
  });
}
