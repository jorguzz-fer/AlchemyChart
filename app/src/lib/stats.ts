export interface Stats {
  mean: number;
  sd: number;
  cv: number;
  n: number;
}

export function calculateStats(values: number[]): Stats | null {
  const n = values.length;
  if (n < 2) return null;

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const cv = mean !== 0 ? (sd / mean) * 100 : 0;

  return { mean, sd, cv, n };
}
