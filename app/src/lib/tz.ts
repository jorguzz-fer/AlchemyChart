// Fuso horário do laboratório. As corridas (Run.runAt) são gravadas em UTC,
// mas a auditoria, CV mensal, datas em telas e relatórios precisam refletir
// o calendário local — caso contrário, uma corrida feita às 22:30 BRT em
// 31/03 (= 01:30 UTC do dia 01/04) cai no balde do mês/dia errado quando
// o servidor roda em UTC (Coolify, Docker padrão).

const LAB_TZ = "America/Sao_Paulo";

// en-CA produz "YYYY-MM-DD" — formato ISO sem precisar montar manualmente.
const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LAB_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Retorna a data (YYYY-MM-DD) no fuso do laboratório. */
export function ymdInLabTz(date: Date): string {
  return ymdFormatter.format(date);
}

/** Retorna o mês (YYYY-MM) no fuso do laboratório. */
export function ymInLabTz(date: Date): string {
  return ymdInLabTz(date).slice(0, 7);
}

/** Dia da semana (0=domingo … 6=sábado) no fuso do laboratório. */
const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LAB_TZ,
  weekday: "short",
});
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
export function weekdayInLabTz(date: Date): number {
  return WEEKDAY_INDEX[weekdayFormatter.format(date)] ?? 0;
}
