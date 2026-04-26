// Configuração das 8 regras de Westgard com 3 estados:
// OFF (desabilitada), ALERT (alertar), REJECT (rejeitar).

export type WestgardRuleState = "OFF" | "ALERT" | "REJECT";

export const WESTGARD_RULE_KEYS = [
  "1:2s",
  "2:2s",
  "1:3s",
  "R:4s",
  "4:1s",
  "7T",
  "7Xm",
  "10Xm",
] as const;

export type WestgardRuleKey = (typeof WESTGARD_RULE_KEYS)[number];

// Descrição de cada regra (tooltip / help text)
export const WESTGARD_RULE_DESCRIPTIONS: Record<WestgardRuleKey, string> = {
  "1:2s":
    "1 corrida fora de ±2s (regra de aviso — sempre que ativada, dispara verificação das outras regras)",
  "2:2s":
    "2 corridas consecutivas fora de ±2s do mesmo lado da média",
  "1:3s":
    "1 corrida fora de ±3s (erro grave — quase sempre rejeitar)",
  "R:4s":
    "Range de 4s entre dois lotes/níveis no mesmo dia",
  "4:1s":
    "4 corridas consecutivas fora de ±1s do mesmo lado",
  "7T":
    "7 corridas consecutivas em tendência (subindo OU descendo)",
  "7Xm":
    "7 corridas consecutivas do mesmo lado da média",
  "10Xm":
    "10 corridas consecutivas do mesmo lado da média",
};

// Configuração padrão de Westgard (aplicada ao criar um novo analito)
export const DEFAULT_WESTGARD_RULES: Record<WestgardRuleKey, WestgardRuleState> = {
  "1:2s": "ALERT",
  "2:2s": "REJECT",
  "1:3s": "REJECT",
  "R:4s": "REJECT",
  "4:1s": "REJECT",
  "7T": "REJECT",
  "7Xm": "REJECT",
  "10Xm": "REJECT",
};

// Normaliza um valor unknown vindo do DB (Json) para Record completo
export function parseWestgardRules(
  raw: unknown
): Record<WestgardRuleKey, WestgardRuleState> {
  const result = { ...DEFAULT_WESTGARD_RULES };
  if (!raw || typeof raw !== "object") return result;
  const obj = raw as Record<string, unknown>;
  for (const key of WESTGARD_RULE_KEYS) {
    const v = obj[key];
    if (v === "OFF" || v === "ALERT" || v === "REJECT") {
      result[key] = v;
    }
  }
  return result;
}
