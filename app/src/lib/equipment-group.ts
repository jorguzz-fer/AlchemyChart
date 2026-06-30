// Normaliza o nome de um equipamento para a "chave de grupo" (par/duplicata).
// Equipamentos com a mesma chave compartilham a média/DP-alvo manual (ControlTarget).
//
// Regras:
//   - Remove sufixo entre parênteses no fim:  "AU 480 (1)" / "AU 480 (2)" -> "AU 480"
//   - Remove índice de unidade curto no fim (1-2 dígitos): "HEMATO 01" / "HEMATO 02" -> "HEMATO"
//   - Preserva número de modelo (3+ dígitos): "AU 480", "Immulite 2000" ficam intactos
//   - Caixa-alta + espaços normalizados para casar duplicatas escritas diferente.
export function equipmentGroupKey(name: string): string {
  let s = (name ?? "").trim();
  // "AU 480 (1)" -> "AU 480"
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/, "");
  // "HEMATO 01" -> "HEMATO" (índice curto; modelos têm 3+ dígitos e são preservados)
  s = s.replace(/\s+\d{1,2}\s*$/, "");
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}
