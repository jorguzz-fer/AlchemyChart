export type WestgardStatus = "OK" | "ALERT" | "REJECT";

export interface WestgardResult {
  status: WestgardStatus;
  violations: string[];
}

const REJECT_RULES = new Set(["1:3s", "2:2s", "R:4s", "4:1s", "10x"]);

/**
 * Applies the 6 primary Westgard rules.
 * @param value     Current measurement
 * @param mean      Control target mean
 * @param sd        Control target SD
 * @param history   Previous values in chronological order (oldest first, excluding current)
 */
export function checkWestgard(
  value: number,
  mean: number,
  sd: number,
  history: number[]
): WestgardResult {
  if (sd === 0) return { status: "OK", violations: [] };

  const z = (value - mean) / sd;
  const hZ = history.map((v) => (v - mean) / sd);
  const violations: string[] = [];

  // 1:3s — one point beyond ±3 SD (reject)
  if (Math.abs(z) > 3) violations.push("1:3s");

  // 1:2s — one point beyond ±2 SD (warning)
  if (Math.abs(z) > 2 && Math.abs(z) <= 3) violations.push("1:2s");

  if (hZ.length >= 1) {
    const prev = hZ[hZ.length - 1];

    // 2:2s — current + previous both beyond 2s same side (reject)
    if (Math.abs(z) > 2 && Math.abs(prev) > 2 && Math.sign(z) === Math.sign(prev)) {
      violations.push("2:2s");
    }

    // R:4s — current + previous span > 4s (opposite sides, reject)
    if (z > 2 && prev < -2) violations.push("R:4s");
    if (z < -2 && prev > 2) violations.push("R:4s");
  }

  // 4:1s — 4 consecutive > 1s same side (reject)
  if (hZ.length >= 3) {
    const last3 = hZ.slice(-3);
    const all4 = [...last3, z];
    if (all4.every((v) => v > 1) || all4.every((v) => v < -1)) {
      violations.push("4:1s");
    }
  }

  // 10x — 10 consecutive on same side (reject)
  if (hZ.length >= 9) {
    const last9 = hZ.slice(-9);
    const all10 = [...last9, z];
    if (all10.every((v) => v > 0) || all10.every((v) => v < 0)) {
      violations.push("10x");
    }
  }

  const hasReject = violations.some((v) => REJECT_RULES.has(v));
  const status: WestgardStatus = hasReject ? "REJECT" : violations.length > 0 ? "ALERT" : "OK";

  return { status, violations };
}
