import {
  DEFAULT_WESTGARD_RULES,
  parseWestgardRules,
  type WestgardRuleKey,
} from "@/lib/westgard-config";

export type WestgardStatus = "OK" | "ALERT" | "REJECT";

export interface WestgardResult {
  status: WestgardStatus;
  violations: string[];   // todas as regras configuradas que dispararam (exclui OFF)
  alerts: string[];       // subset de violations com state=ALERT
  rejects: string[];      // subset de violations com state=REJECT
}

/**
 * Aplica as 8 regras de Westgard, respeitando a config por analito.
 *
 * @param value         Valor da corrida atual
 * @param mean          Média do StatPeriod (controle)
 * @param sd            Desvio padrão do StatPeriod
 * @param history       Histórico cronológico (mais antigo primeiro, sem incluir o atual)
 * @param rulesConfig   Config Westgard do analito (analyte.westgardRules JSON);
 *                      se null/undefined, usa DEFAULT_WESTGARD_RULES
 *
 * Regras implementadas:
 *  1:2s   — 1 corrida fora de ±2s (warning) — só dispara se NÃO for 1:3s tb
 *  2:2s   — 2 consecutivas fora de ±2s mesmo lado
 *  1:3s   — 1 corrida fora de ±3s (rejeição grave)
 *  R:4s   — atual + anterior em lados opostos com range > 4s
 *  4:1s   — 4 consecutivas fora de ±1s mesmo lado
 *  7T     — 7 consecutivas em tendência estritamente crescente OU decrescente
 *  7Xm    — 7 consecutivas do mesmo lado da média
 *  10Xm   — 10 consecutivas do mesmo lado da média
 */
export function checkWestgard(
  value: number,
  mean: number,
  sd: number,
  history: number[],
  rulesConfig?: unknown
): WestgardResult {
  if (sd === 0) return { status: "OK", violations: [], alerts: [], rejects: [] };

  const rules = parseWestgardRules(rulesConfig ?? DEFAULT_WESTGARD_RULES);

  const z = (value - mean) / sd;
  const hZ = history.map((v) => (v - mean) / sd);
  const allZ = [...hZ, z]; // janela completa cronológica para regras de série

  const violated = new Set<WestgardRuleKey>();

  // 1:3s — uma corrida além de ±3 SD
  if (Math.abs(z) > 3) violated.add("1:3s");

  // 1:2s — uma corrida entre ±2 e ±3 SD (warning, não duplica com 1:3s)
  if (Math.abs(z) > 2 && Math.abs(z) <= 3) violated.add("1:2s");

  // Regras envolvendo a corrida anterior
  if (hZ.length >= 1) {
    const prev = hZ[hZ.length - 1];

    // 2:2s — atual e anterior fora de ±2s do MESMO lado
    if (Math.abs(z) > 2 && Math.abs(prev) > 2 && Math.sign(z) === Math.sign(prev)) {
      violated.add("2:2s");
    }

    // R:4s — atual e anterior em lados OPOSTOS, ambos fora de ±2s
    if ((z > 2 && prev < -2) || (z < -2 && prev > 2)) {
      violated.add("R:4s");
    }
  }

  // 4:1s — 4 consecutivas fora de ±1s do mesmo lado
  if (allZ.length >= 4) {
    const last4 = allZ.slice(-4);
    if (last4.every((v) => v > 1) || last4.every((v) => v < -1)) {
      violated.add("4:1s");
    }
  }

  // 7T — 7 consecutivas em tendência estritamente crescente OU decrescente
  if (allZ.length >= 7) {
    const last7 = allZ.slice(-7);
    let strictlyUp = true;
    let strictlyDown = true;
    for (let i = 1; i < last7.length; i++) {
      if (last7[i] <= last7[i - 1]) strictlyUp = false;
      if (last7[i] >= last7[i - 1]) strictlyDown = false;
    }
    if (strictlyUp || strictlyDown) violated.add("7T");
  }

  // 7Xm — 7 consecutivas do mesmo lado da média
  if (allZ.length >= 7) {
    const last7 = allZ.slice(-7);
    if (last7.every((v) => v > 0) || last7.every((v) => v < 0)) {
      violated.add("7Xm");
    }
  }

  // 10Xm — 10 consecutivas do mesmo lado da média
  if (allZ.length >= 10) {
    const last10 = allZ.slice(-10);
    if (last10.every((v) => v > 0) || last10.every((v) => v < 0)) {
      violated.add("10Xm");
    }
  }

  // Categoriza pela config do analito (OFF = ignora)
  const violations: string[] = [];
  const alerts: string[] = [];
  const rejects: string[] = [];

  for (const rule of violated) {
    const state = rules[rule];
    if (state === "OFF") continue;
    violations.push(rule);
    if (state === "REJECT") rejects.push(rule);
    else if (state === "ALERT") alerts.push(rule);
  }

  // REJECT prevalece sobre ALERT
  const status: WestgardStatus =
    rejects.length > 0 ? "REJECT" : alerts.length > 0 ? "ALERT" : "OK";

  return { status, violations, alerts, rejects };
}
