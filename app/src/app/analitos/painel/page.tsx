"use client";

import LeveyJenningsChart from "@/components/LeveyJenningsChart";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  parseWestgardRules,
  WESTGARD_RULE_KEYS,
  type WestgardRuleKey,
  type WestgardRuleState,
} from "@/lib/westgard-config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyteRaw {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  active: boolean;
  equipment: { id: string; name: string };
  material: { id: string; name: string };
  westgardRules: unknown;
  _count: { stats: number };
}

interface RunRow {
  no: number;
  values: (number | null)[];
  statuses: (string | null)[];
  violations: (string[] | null)[];
  runIds: (string | null)[];
  runAt: (string | null)[];
}

interface LevelStats {
  statPeriod: { mean: number; sd: number; cv: number; n: number } | null;
  currentStats: { mean: number; sd: number; cv: number; n: number } | null;
  manualTarget: { mean: number; sd: number } | null;
  groupKey: string;
}

interface PainelData {
  analytes: AnalyteRaw[];
  rows: RunRow[];
  stats: LevelStats[];
  total: number;
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  label,
  optA,
  optB,
  value,
  onChange,
}: {
  label: string;
  optA: string;
  optB: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`font-medium ${!value ? "text-black dark:text-white" : "text-gray-400"}`}>{optA}</span>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative w-8 h-4 rounded-full transition-colors ${value ? "bg-danger-500" : "bg-gray-300 dark:bg-gray-600"}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
        <span className={`font-medium ${value ? "text-black dark:text-white" : "text-gray-400"}`}>{optB}</span>
      </div>
    </div>
  );
}

// ─── Level colors ─────────────────────────────────────────────────────────────

const LEVEL_COLORS = ["text-danger-600", "text-primary-600", "text-success-600"];

// ─── Rule violation circle ────────────────────────────────────────────────────
// Renderiza um pequeno círculo colorido representando uma violação Westgard,
// com cor baseada no state da regra na config do analito (ALERT=amarelo,
// REJECT=vermelho, OFF=cinza neutro pois mesmo OFF aparece se já estava no DB).
function RuleCircle({ rule, state }: { rule: string; state: WestgardRuleState }) {
  const cls =
    state === "REJECT"
      ? "bg-danger-500 text-white"
      : state === "ALERT"
      ? "bg-warning-400 text-white"
      : "bg-gray-300 text-white";
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold ${cls}`}
      title={`${rule} — ${state}`}
    >
      {rule.replace(":", "")}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function PainelControleInner() {
  const searchParams = useSearchParams();

  const [allAnalytes, setAllAnalytes] = useState<AnalyteRaw[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Selection from URL
  const selName = searchParams.get("name") ?? "";
  const selEqId = searchParams.get("eq") ?? "";

  // Toggles
  const [condAtivo, setCondAtivo] = useState(true);
  const [chartLevelIdx, setChartLevelIdx] = useState(0);
  const [valoresUltimo, setValoresUltimo] = useState(false);     // false=Todos, true=Último (últimas 20)
  const [emObservacao, setEmObservacao] = useState(false);       // analito em observação (flag visual)

  // Panel data
  const [painelData, setPainelData] = useState<PainelData | null>(null);
  const [loadingPanel, setLoadingPanel] = useState(false);

  // New run entry
  const [newValues, setNewValues] = useState<string[]>(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Inline edit/delete
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<string[]>(["", "", ""]);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Média-alvo manual (por nível)
  const { data: session } = useSession();
  const canManage = ["SUPERADMIN", "ADMIN", "SUPERVISOR"].includes(
    (session?.user as { role?: string } | undefined)?.role ?? ""
  );
  const [targetEditLevel, setTargetEditLevel] = useState<number | null>(null);
  const [targetMean, setTargetMean] = useState("");
  const [targetSd, setTargetSd] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // ── Load analytes ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/analitos")
      .then((r) => r.json())
      .then((list: AnalyteRaw[]) => {
        setAllAnalytes(list);
        setLoadingList(false);
      });
  }, []);

  // ── Derive selected unit label ─────────────────────────────────────────────

  const selUnit = useMemo(() => {
    if (!selName) return null;
    return allAnalytes.find((a) => a.name === selName)?.unit ?? null;
  }, [allAnalytes, selName]);

  const selEquipName = useMemo(() => {
    if (!selEqId) return null;
    return allAnalytes.find((a) => a.equipment.id === selEqId)?.equipment.name ?? null;
  }, [allAnalytes, selEqId]);

  // ── Analytes for selected condition ───────────────────────────────────────

  const selectedAnalyteIds = useMemo(() => {
    if (!selName || !selEqId) return [];
    return allAnalytes
      .filter(
        (a) =>
          a.name === selName &&
          a.equipment.id === selEqId &&
          (condAtivo ? a._count.stats > 0 : a._count.stats === 0)
      )
      .sort((a, b) => a.level - b.level)
      .map((a) => a.id);
  }, [allAnalytes, selName, selEqId, condAtivo]);

  // Does this name+eq combo have analytes in each condition?
  const conditionAvailability = useMemo(() => {
    if (!selName || !selEqId) return { hasAtivo: false, hasPreparo: false };
    const matches = allAnalytes.filter((a) => a.name === selName && a.equipment.id === selEqId);
    return {
      hasAtivo: matches.some((a) => a._count.stats > 0),
      hasPreparo: matches.some((a) => a._count.stats === 0),
    };
  }, [allAnalytes, selName, selEqId]);
  const hasBothConditions = conditionAvailability.hasAtivo && conditionAvailability.hasPreparo;

  // Auto-seleciona a única condição disponível ao trocar de seleção, para
  // não travar o usuário na condição padrão (Ativo) quando o equipamento
  // só tem controles em Preparo (ou vice-versa).
  useEffect(() => {
    const { hasAtivo, hasPreparo } = conditionAvailability;
    if (!hasAtivo && hasPreparo && condAtivo) setCondAtivo(false);
    else if (hasAtivo && !hasPreparo && !condAtivo) setCondAtivo(true);
  }, [conditionAvailability, condAtivo]);

  // ── Load panel data ────────────────────────────────────────────────────────

  const loadPanel = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setPainelData(null); return; }
    setLoadingPanel(true);
    setSaveError(null);
    const res = await fetch(`/api/painel/runs?ids=${ids.join(",")}`);
    if (res.ok) {
      const data: PainelData = await res.json();
      setPainelData(data);
      setPage(Math.ceil(data.total / PAGE_SIZE) || 1);
      setChartLevelIdx(0);
    } else {
      setPainelData(null);
    }
    setLoadingPanel(false);
  }, []);

  useEffect(() => {
    if (selectedAnalyteIds.length > 0) {
      loadPanel(selectedAnalyteIds);
    } else if (!loadingList && selName && selEqId) {
      setPainelData(null);
    }
  }, [selectedAnalyteIds, loadPanel, loadingList, selName, selEqId]);

  // Reset page & inputs on new selection
  useEffect(() => {
    setPage(1);
    setNewValues(["", "", ""]);
    setSaveError(null);
  }, [selName, selEqId, condAtivo]);

  // ── Save run ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!painelData) return;
    const entries = painelData.analytes.map((a, i) => {
      const raw = (newValues[i] ?? "").replace(",", ".").trim();
      return { analyteId: a.id, value: raw ? parseFloat(raw) : NaN };
    });

    if (entries.every((e) => isNaN(e.value))) {
      setSaveError("Informe ao menos um valor");
      return;
    }

    setSaving(true);
    setSaveError(null);

    const results = await Promise.all(
      entries
        .filter((e) => !isNaN(e.value))
        .map((e) =>
          fetch("/api/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analyteId: e.analyteId, value: e.value }),
          })
        )
    );

    const failed = results.find((r) => !r.ok);
    if (failed) {
      const d = await failed.json().catch(() => ({}));
      setSaveError(d.error ?? "Erro ao salvar");
    } else {
      setNewValues(["", "", ""]);
      loadPanel(selectedAnalyteIds);
    }
    setSaving(false);
  };

  // ── Edit/Delete handlers ───────────────────────────────────────────────────

  const startEdit = (row: RunRow) => {
    setRowError(null);
    setEditingRow(row.no);
    setEditValues(
      row.values.map((v) =>
        v === null
          ? ""
          : v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
      )
    );
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditValues(["", "", ""]);
    setRowError(null);
  };

  const saveEdit = async (row: RunRow) => {
    setRowBusy(row.no);
    setRowError(null);

    const patches: { runId: string; value: number | null }[] = [];
    for (let i = 0; i < row.runIds.length; i++) {
      const runId = row.runIds[i];
      if (!runId) continue;
      const raw = (editValues[i] ?? "").replace(",", ".").trim();
      const next = raw ? parseFloat(raw) : NaN;
      const prev = row.values[i];
      if (raw === "" || isNaN(next)) continue;
      if (prev === next) continue;
      patches.push({ runId, value: next });
    }

    if (patches.length === 0) {
      cancelEdit();
      setRowBusy(null);
      return;
    }

    try {
      const results = await Promise.all(
        patches.map((p) =>
          fetch(`/api/runs/${p.runId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: p.value }),
          })
        )
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const d = await failed.json().catch(() => ({}));
        throw new Error(d.error ?? "Erro ao atualizar");
      }
      cancelEdit();
      await loadPanel(selectedAnalyteIds);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setRowBusy(null);
    }
  };

  const deleteRow = async (row: RunRow) => {
    const runIds = row.runIds.filter((id): id is string => !!id);
    if (runIds.length === 0) return;

    const ok = confirm(
      `Deletar a corrida #${row.no} (${runIds.length} valor${runIds.length > 1 ? "es" : ""})? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;

    setRowBusy(row.no);
    setRowError(null);
    try {
      const results = await Promise.all(
        runIds.map((id) => fetch(`/api/runs/${id}`, { method: "DELETE" }))
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const d = await failed.json().catch(() => ({}));
        throw new Error(d.error ?? "Erro ao deletar");
      }
      await loadPanel(selectedAnalyteIds);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setRowBusy(null);
    }
  };

  // ── Computed ───────────────────────────────────────────────────────────────

  const rows = painelData?.rows ?? [];
  const analytes = useMemo(() => painelData?.analytes ?? [], [painelData]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Slots APENAS para os níveis realmente configurados (carrega o nº do nível).
  // Níveis nunca usados (ex: N3 num laboratório que só usa 2) não viram coluna.
  type LevelSlot = { analyte: AnalyteRaw; analyteIdx: number; level: number };
  const levelSlots: LevelSlot[] = useMemo(() => {
    // Laboratório usa apenas N1 e N2 — nível 3 nunca é utilizado.
    const slots: LevelSlot[] = [];
    for (const level of [1, 2]) {
      const idx = analytes.findIndex((a) => a.level === level);
      if (idx >= 0) slots.push({ analyte: analytes[idx], analyteIdx: idx, level });
    }
    return slots;
  }, [analytes]);

  // ── Média-alvo manual: handlers ────────────────────────────────────────────
  const startTargetEdit = (level: number, current: { mean: number; sd: number } | null) => {
    setTargetEditLevel(level);
    setTargetMean(current ? String(current.mean).replace(".", ",") : "");
    setTargetSd(current ? String(current.sd).replace(".", ",") : "");
    setTargetError(null);
  };
  const cancelTargetEdit = () => {
    setTargetEditLevel(null);
    setTargetError(null);
  };
  const saveTarget = async (analyteIdx: number) => {
    const analyteId = analytes[analyteIdx]?.id;
    if (!analyteId) return;
    setTargetBusy(true);
    setTargetError(null);
    const res = await fetch("/api/control-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyteId, mean: targetMean, sd: targetSd }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setTargetError(d.error ?? "Erro ao salvar");
    } else {
      setTargetEditLevel(null);
      await loadPanel(selectedAnalyteIds);
    }
    setTargetBusy(false);
  };
  const clearTarget = async (analyteIdx: number) => {
    const analyteId = analytes[analyteIdx]?.id;
    if (!analyteId) return;
    if (!confirm("Remover a média-alvo manual e voltar ao cálculo automático (Uso)?")) return;
    setTargetBusy(true);
    setTargetError(null);
    const res = await fetch(`/api/control-targets?analyteId=${analyteId}`, { method: "DELETE" });
    if (res.ok) await loadPanel(selectedAnalyteIds);
    setTargetBusy(false);
  };

  const allChartValues = rows
    .map((r) => r.values[chartLevelIdx])
    .filter((v): v is number => v !== null);
  // Toggle "Último": mostra apenas últimas 20 corridas (janela típica de Westgard)
  const chartValues = valoresUltimo ? allChartValues.slice(-20) : allChartValues;
  const chartStat = painelData?.stats[chartLevelIdx];
  // Alvo manual (do grupo) tem prioridade como centro do gráfico
  const chartMean =
    chartStat?.manualTarget?.mean ?? chartStat?.statPeriod?.mean ?? chartStat?.currentStats?.mean ?? 0;
  const chartSd =
    chartStat?.manualTarget?.sd ?? chartStat?.statPeriod?.sd ?? chartStat?.currentStats?.sd ?? 1;

  const isSetupPhase = !painelData || painelData.stats.every((s) => !s.statPeriod);

  // Westgard rules config (vem do analyte master — todas as duplicatas têm a mesma)
  const westgardRules = useMemo(() => {
    if (!painelData?.analytes[0]) return null;
    return parseWestgardRules(painelData.analytes[0].westgardRules);
  }, [painelData]);

  // Agrupa regras por estado para o bloco de configuração no rodapé
  const rulesGrouped = useMemo(() => {
    if (!westgardRules) return { alerts: [] as string[], rejects: [] as string[], offs: [] as string[] };
    const alerts: string[] = [];
    const rejects: string[] = [];
    const offs: string[] = [];
    for (const key of WESTGARD_RULE_KEYS) {
      const state = westgardRules[key];
      if (state === "ALERT") alerts.push(key);
      else if (state === "REJECT") rejects.push(key);
      else offs.push(key);
    }
    return { alerts, rejects, offs };
  }, [westgardRules]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Painel de Controle
          </p>
          {selName ? (
            <h1 className="text-xl font-bold text-black dark:text-white leading-tight">
              {selName}
              {selUnit && <span className="text-gray-400 font-normal ml-1.5 text-base">({selUnit})</span>}
              {selEquipName && (
                <span className="text-gray-400 font-normal ml-2 text-base">— {selEquipName}</span>
              )}
            </h1>
          ) : (
            <h1 className="text-xl font-bold text-gray-400">Selecione um analito no menu lateral</h1>
          )}
        </div>

        {/* Toggles */}
        {selName && (
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex flex-col items-center gap-1 cursor-pointer">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Analito em observação
              </span>
              <input
                type="checkbox"
                checked={emObservacao}
                onChange={(e) => setEmObservacao(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
            </label>

            <div className="w-px h-8 bg-gray-200 dark:bg-[#1a1a1a]" />

            <Toggle
              label="Valores no gráfico"
              optA="Último"
              optB="Todos"
              value={!valoresUltimo}
              onChange={(v) => setValoresUltimo(!v)}
            />

            {hasBothConditions && (
              <>
                <div className="w-px h-8 bg-gray-200 dark:bg-[#1a1a1a]" />
                <Toggle
                  label="Condição do controle"
                  optA="Preparo"
                  optB="Ativo"
                  value={condAtivo}
                  onChange={setCondAtivo}
                />
              </>
            )}
          </div>
        )}

        {/* Banner em observação */}
        {emObservacao && selName && (
          <div className="w-full bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg px-3 py-1.5 text-xs text-warning-800 dark:text-warning-200 flex items-center gap-2">
            <span className="material-symbols-outlined text-warning-500 text-[14px]">visibility</span>
            Este analito está marcado em observação — fique atento às próximas corridas.
          </div>
        )}
      </div>

      {/* ── Setup banner ────────────────────────────────────────────────────── */}
      {painelData && isSetupPhase && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-3 flex items-start gap-2 text-xs text-warning-800 dark:text-warning-200">
          <span className="material-symbols-outlined text-warning-500 text-[16px] shrink-0">info</span>
          Fase de <strong className="mx-1">preparo</strong> — {rows.length}/20 corridas registradas.
          As regras de Westgard serão ativadas após 20 entradas.
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {!selName && !loadingList && (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-16 flex flex-col items-center text-gray-400">
          <span className="material-symbols-outlined text-5xl mb-3">monitoring</span>
          <p className="text-sm font-medium">Selecione um analito no menu lateral</p>
          <p className="text-xs mt-1 text-gray-300">Clique em &quot;por Analitos&quot; → equipamento</p>
        </div>
      )}

      {selName && !loadingPanel && selectedAnalyteIds.length === 0 && (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 flex flex-col items-center text-gray-400">
          <span className="material-symbols-outlined text-4xl mb-2">info</span>
          <p className="text-sm font-medium">
            Nenhum analito em fase de {condAtivo ? "Ativo" : "Preparo"} para este equipamento.
          </p>
          {hasBothConditions && (
            <button
              onClick={() => setCondAtivo(!condAtivo)}
              className="mt-3 text-primary-500 text-sm font-semibold hover:underline"
            >
              Alternar para {condAtivo ? "Preparo" : "Ativo"}
            </button>
          )}
        </div>
      )}

      {loadingPanel && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          Carregando dados...
        </div>
      )}

      {/* ── Panel content ────────────────────────────────────────────────────── */}
      {!loadingPanel && painelData && (
        <>
          {/* Grid: Corridas + right panel */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* ── Corridas table ────────────────────────────────────────────── */}
            <div className="xl:col-span-3 bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
              <div className="bg-danger-600 px-5 py-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-white text-[18px]">table_rows</span>
                <h3 className="text-white font-bold text-sm flex-1">Corridas</h3>
                <span className="text-white/60 text-xs">{rows.length} total</span>
              </div>

              {rowError && (
                <div className="px-5 py-2 bg-danger-50 border-b border-danger-200 text-xs text-danger-700">
                  <strong>Erro:</strong> {rowError}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#1a1a1a] sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 w-10">#</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 w-14">Editar</th>
                      {levelSlots.map((slot) => {
                        const level = slot.level;
                        const a = slot.analyte;
                        return (
                          <th key={`lvl-${level}`} className="px-3 py-3 text-center text-xs font-semibold min-w-[90px]">
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="checkbox"
                                readOnly
                                checked={a._count.stats > 0}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-danger-600 cursor-default"
                              />
                              <span className={a._count.stats > 0 ? "text-danger-700" : "text-gray-400"}>
                                Nível {level}
                              </span>
                              {a._count.stats > 0 && (
                                <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[9px] font-bold px-1 py-0.5 rounded uppercase">
                                  ATIVAR
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 min-w-[120px]">Regras</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 w-10">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const anyViolation = row.violations.some((v) => v && v.length > 0);
                      return (
                        <tr
                          key={row.no}
                          className={`border-t border-gray-100 dark:border-[#1a1a1a] transition-colors ${
                            anyViolation
                              ? "bg-danger-50/30 dark:bg-danger-900/10"
                              : "hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                          }`}
                        >
                          <td className="px-3 py-2.5 text-xs font-semibold text-gray-400">{row.no}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-0.5">
                              {editingRow === row.no ? (
                                <>
                                  <button
                                    onClick={() => saveEdit(row)}
                                    disabled={rowBusy === row.no}
                                    title="Salvar"
                                    className="w-6 h-6 rounded text-success-600 hover:bg-success-50 disabled:opacity-50 transition-all flex items-center justify-center"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      {rowBusy === row.no ? "progress_activity" : "check"}
                                    </span>
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    disabled={rowBusy === row.no}
                                    title="Cancelar"
                                    className="w-6 h-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-all flex items-center justify-center"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEdit(row)}
                                    disabled={rowBusy === row.no}
                                    title="Editar"
                                    className="w-6 h-6 rounded text-gray-400 hover:text-primary-500 hover:bg-primary-50 disabled:opacity-50 transition-all flex items-center justify-center"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">edit</span>
                                  </button>
                                  <button
                                    onClick={() => deleteRow(row)}
                                    disabled={rowBusy === row.no}
                                    title="Deletar"
                                    className="w-6 h-6 rounded text-gray-400 hover:text-danger-500 hover:bg-danger-50 disabled:opacity-50 transition-all flex items-center justify-center"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      {rowBusy === row.no ? "progress_activity" : "delete"}
                                    </span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          {levelSlots.map((slot) => {
                            const level = slot.level;
                            const i = slot.analyteIdx;
                            return (
                              <td key={`lvl-${level}`} className={`px-3 py-2.5 text-center font-semibold ${LEVEL_COLORS[slot.level - 1]}`}>
                                {editingRow === row.no && row.runIds[i] ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editValues[i] ?? ""}
                                    onChange={(e) => {
                                      const next = [...editValues];
                                      next[i] = e.target.value;
                                      setEditValues(next);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEdit(row);
                                      else if (e.key === "Escape") cancelEdit();
                                    }}
                                    autoFocus={i === row.runIds.findIndex((id) => !!id)}
                                    className="w-full px-2 py-1 rounded border border-primary-300 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                                  />
                                ) : row.values[i] !== null ? (
                                  Number(row.values[i]).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 3,
                                    maximumFractionDigits: 3,
                                  })
                                ) : (
                                  <span className="text-gray-300 font-normal">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-xs">
                            {anyViolation && westgardRules && (
                              <div className="flex flex-wrap items-center gap-1">
                                {row.violations.flatMap((v, i) =>
                                  (v ?? []).map((rule, ri) => {
                                    const state = westgardRules[rule as WestgardRuleKey] ?? "OFF";
                                    return (
                                      <RuleCircle
                                        key={`${i}-${ri}-${rule}`}
                                        rule={rule}
                                        state={state}
                                      />
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button className="w-6 h-6 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 flex items-center justify-center mx-auto transition-all">
                              <span className="material-symbols-outlined text-[14px]">chat</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* New run input row */}
                    <tr className="border-t-2 border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10">
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-400">{rows.length + 1}</td>
                      <td />
                      {levelSlots.map((slot) => {
                        const level = slot.level;
                        const i = slot.analyteIdx;
                        return (
                          <td key={`lvl-${level}`} className="px-3 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={newValues[i] ?? ""}
                              onChange={(e) => {
                                const v = [...newValues];
                                v[i] = e.target.value;
                                setNewValues(v);
                                setSaveError(null);
                              }}
                              onKeyDown={(e) => e.key === "Enter" && handleSave()}
                              placeholder="0,000"
                              className="w-full px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-[#141414] text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2" colSpan={2}>
                        <button
                          onClick={handleSave}
                          disabled={saving || newValues.every((v) => !v?.trim())}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-danger-600 hover:bg-danger-700 disabled:opacity-50 transition-all"
                        >
                          {saving ? (
                            <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                          ) : (
                            <span className="material-symbols-outlined text-[14px]">save</span>
                          )}
                          SALVAR
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {saveError && <p className="px-5 pb-3 text-xs text-danger-600">{saveError}</p>}

              {/* Pagination */}
              <div className="px-5 py-3 border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between text-xs text-gray-500">
                <span>{rows.length} corrida{rows.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 dark:hover:bg-[#1a1a1a] disabled:opacity-30 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  <span className="font-medium text-black dark:text-white">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 dark:hover:bg-[#1a1a1a] disabled:opacity-30 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Right column: Chart + Stats ───────────────────────────────── */}
            <div className="xl:col-span-2 flex flex-col gap-5">

              {/* Levey-Jennings */}
              <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
                <div className="bg-danger-600 px-5 py-3 flex items-center justify-between">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">monitoring</span>
                    Levey-Jennings
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {analytes.map((a, i) => (
                      <button
                        key={a.id}
                        onClick={() => setChartLevelIdx(i)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          chartLevelIdx === i ? "bg-white text-danger-600" : "bg-white/20 text-white hover:bg-white/30"
                        }`}
                      >
                        N{a.level}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  {chartValues.length >= 2 ? (
                    <LeveyJenningsChart mean={chartMean} sd={chartSd} values={chartValues} height={220} />
                  ) : (
                    <div className="h-56 flex flex-col items-center justify-center text-gray-400">
                      <span className="material-symbols-outlined text-4xl mb-2">monitoring</span>
                      <p className="text-xs text-center">Mínimo de 2 corridas para exibir o gráfico</p>
                      {isSetupPhase && (
                        <p className="text-xs text-center mt-1 text-warning-600">{rows.length}/20 na fase de preparo</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dados dos controles */}
              <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
                <div className="bg-danger-600 px-5 py-3">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">analytics</span>
                    Dados dos controles
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-400 font-semibold w-16">#</th>
                        {levelSlots.map((slot) => (
                          <th
                            key={`lvl-${slot.level}`}
                            className="px-3 py-2 text-center font-semibold text-gray-600 dark:text-gray-400"
                          >
                            Nível {slot.level}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Uso */}
                      <tr className="border-t border-gray-100 dark:border-[#1a1a1a]">
                        <td rowSpan={2} className="px-2 py-2 text-center border-r border-gray-100 dark:border-[#1a1a1a] align-middle">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>Uso</span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">Média</td>
                        {levelSlots.map((slot) => {
                          const level = slot.level;
                          const v = painelData.stats[slot.analyteIdx]?.statPeriod?.mean ?? null;
                          return (
                            <td key={`lvl-${level}`} className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">
                              {v !== null ? v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                      <tr className="border-t border-gray-100 dark:border-[#1a1a1a]">
                        <td className="px-3 py-2 text-gray-500">Desvio Padrão</td>
                        {levelSlots.map((slot) => {
                          const level = slot.level;
                          const v = painelData.stats[slot.analyteIdx]?.statPeriod?.sd ?? null;
                          return (
                            <td key={`lvl-${level}`} className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">
                              {v !== null ? v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Corrente */}
                      {[
                        { label: "Média", key: "mean" as const },
                        { label: "Desvio Padrão", key: "sd" as const },
                        { label: "Coef. de Variação", key: "cv" as const },
                        { label: "Nº de corridas", key: "n" as const },
                      ].map((row, ri) => (
                        <tr key={row.key} className="border-t border-gray-100 dark:border-[#1a1a1a] bg-gray-50/40 dark:bg-[#1a1a1a]/20">
                          {ri === 0 && (
                            <td rowSpan={4} className="px-2 py-2 text-center border-r border-gray-100 dark:border-[#1a1a1a] align-middle">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>Corrente</span>
                            </td>
                          )}
                          <td className="px-3 py-2 text-gray-500">{row.label}</td>
                          {levelSlots.map((slot) => {
                            const level = slot.level;
                            const v = painelData.stats[slot.analyteIdx]?.currentStats?.[row.key] ?? null;
                            if (v === null) return <td key={`lvl-${level}`} className="px-3 py-2 text-center text-gray-300">—</td>;
                            if (row.key === "cv") {
                              const bad = (v as number) > 5;
                              return (
                                <td key={`lvl-${level}`} className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${bad ? "bg-danger-500 text-white" : "bg-success-500 text-white"}`}>
                                    {(v as number).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td key={`lvl-${level}`} className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">
                                {row.key === "n" ? v : (v as number).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Média-alvo manual — compartilhada pelo grupo de equipamentos */}
                <div className="border-t border-gray-100 dark:border-[#1a1a1a] p-4">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                    <h4 className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                      Média-alvo manual
                    </h4>
                    {painelData.stats[0]?.groupKey && (
                      <span className="text-[11px] text-gray-400">
                        Grupo{" "}
                        <span className="font-semibold text-gray-500">{painelData.stats[0].groupKey}</span>{" "}
                        · vale para equipamentos do mesmo grupo
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {levelSlots.map((slot) => {
                      const st = painelData.stats[slot.analyteIdx];
                      const mt = st?.manualTarget ?? null;
                      const editing = targetEditLevel === slot.level;
                      const fmt = (n: number) =>
                        n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                      return (
                        <div key={`tgt-${slot.level}`} className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="font-semibold text-gray-500 w-16 shrink-0">Nível {slot.level}</span>
                          {editing ? (
                            <>
                              <input
                                inputMode="decimal"
                                value={targetMean}
                                onChange={(e) => setTargetMean(e.target.value)}
                                placeholder="Média"
                                className="w-24 px-2 py-1 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0b0b] text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                              />
                              <input
                                inputMode="decimal"
                                value={targetSd}
                                onChange={(e) => setTargetSd(e.target.value)}
                                placeholder="DP"
                                className="w-24 px-2 py-1 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0b0b] text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                              />
                              <button
                                onClick={() => saveTarget(slot.analyteIdx)}
                                disabled={targetBusy}
                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-success-600 hover:bg-success-700 disabled:opacity-50"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={cancelTargetEdit}
                                disabled={targetBusy}
                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : mt ? (
                            <>
                              <span className="font-mono text-gray-700 dark:text-gray-300">
                                {fmt(mt.mean)} / {fmt(mt.sd)}
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-wide bg-warning-50 text-warning-700 px-1.5 py-0.5 rounded-full">
                                manual
                              </span>
                              {canManage && (
                                <>
                                  <button
                                    onClick={() => startTargetEdit(slot.level, mt)}
                                    className="px-2 py-0.5 rounded text-[11px] font-semibold text-primary-600 hover:bg-primary-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => clearTarget(slot.analyteIdx)}
                                    disabled={targetBusy}
                                    className="px-2 py-0.5 rounded text-[11px] font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                                  >
                                    Limpar
                                  </button>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-gray-400 italic">Automático (Uso)</span>
                              {canManage && (
                                <button
                                  onClick={() => startTargetEdit(slot.level, null)}
                                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-primary-600 hover:bg-primary-50"
                                >
                                  Definir
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {targetError && <p className="text-[11px] text-danger-600 mt-1.5">{targetError}</p>}
                  {!canManage && (
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      Apenas supervisores/administradores podem definir a média-alvo.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Card 4: Regras de Westgard especificadas e critérios ────────── */}
          {westgardRules && (
            <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
              <div className="bg-gray-100 dark:bg-[#1a1a1a] px-5 py-3">
                <h3 className="font-bold text-sm text-black dark:text-white">
                  Regras de Westgard especificadas e critérios
                </h3>
              </div>
              <div className="p-5 space-y-3">
                {/* Alerta */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Alerta</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rulesGrouped.alerts.length === 0 ? (
                      <span className="text-xs text-gray-300 italic">Nenhuma regra configurada como alerta</span>
                    ) : (
                      rulesGrouped.alerts.map((rule) => <RuleCircle key={rule} rule={rule} state="ALERT" />)
                    )}
                  </div>
                </div>

                {/* Rejeição */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Rejeição</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rulesGrouped.rejects.length === 0 ? (
                      <span className="text-xs text-gray-300 italic">Nenhuma regra configurada como rejeição</span>
                    ) : (
                      rulesGrouped.rejects.map((rule) => <RuleCircle key={rule} rule={rule} state="REJECT" />)
                    )}
                  </div>
                </div>

                {/* Desabilitadas (compacto, opcional) */}
                {rulesGrouped.offs.length > 0 && (
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-[#1a1a1a]">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-20">
                      Desabilitadas
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {rulesGrouped.offs.map((rule) => (
                        <span
                          key={rule}
                          className="text-[10px] text-gray-400 px-1.5 py-0.5 border border-gray-200 dark:border-[#1a1a1a] rounded"
                        >
                          {rule}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PainelControle() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando…</div>}>
      <PainelControleInner />
    </Suspense>
  );
}
