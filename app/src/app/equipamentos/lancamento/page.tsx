"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface AnalyteMaterialDTO {
  id: string;
  level: number;
  manufacturerMean: number | null;
  manufacturerSD: number | null;
  status: string;
  material: { id: string; name: string; lot: string | null };
  equipment: { id: string; name: string };
}

interface Analyte {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipmentId: string;
  active?: boolean;
  material: { id: string; name: string; lot?: string | null };
  _count: { stats: number };
  analyteMaterials: AnalyteMaterialDTO[];
}

interface Equipment {
  id: string;
  name: string;
}

type RunStatus = "idle" | "saving" | "ok" | "alert" | "reject" | "error";

interface LevelEntry {
  analyteId: string;
  level: number;
  value: string;
  status: RunStatus;
  violations: string[];
  // Bula (do AnalyteMaterial)
  materialName: string;
  materialLot: string | null;
  manufacturerMean: number | null;
  manufacturerSD: number | null;
}

interface ConditionGroup {
  materialId: string;
  hasStats: boolean; // true = Ativo, false = Preparo
  levels: [LevelEntry | null, LevelEntry | null, LevelEntry | null];
}

interface AnalyteGroup {
  name: string;
  unit: string | null;
  conditions: ConditionGroup[]; // Ativo primeiro, depois Preparo
}

const STATUS_META: Record<RunStatus, { label: string; cls: string }> = {
  idle:   { label: "",          cls: "" },
  saving: { label: "Salvando…", cls: "text-gray-400 animate-pulse" },
  ok:     { label: "OK",        cls: "text-success-600 font-bold" },
  alert:  { label: "ALERTA",    cls: "text-warning-600 font-bold" },
  reject: { label: "REJEITAR",  cls: "text-danger-600 font-bold" },
  error:  { label: "ERRO",      cls: "text-danger-500" },
};

function groupAnalytes(list: Analyte[]): AnalyteGroup[] {
  // Chave: nome||unidade → condMap por materialId
  const analyteMap = new Map<string, { group: AnalyteGroup; condMap: Map<string, ConditionGroup> }>();

  for (const a of list) {
    if (a.active === false) continue;
    const analyteKey = `${a.name}||${a.unit ?? ""}`;

    if (!analyteMap.has(analyteKey)) {
      const group: AnalyteGroup = { name: a.name, unit: a.unit, conditions: [] };
      analyteMap.set(analyteKey, { group, condMap: new Map() });
    }

    const { group, condMap } = analyteMap.get(analyteKey)!;

    if (!condMap.has(a.material.id)) {
      const cond: ConditionGroup = {
        materialId: a.material.id,
        hasStats: a._count.stats > 0,
        levels: [null, null, null],
      };
      condMap.set(a.material.id, cond);
      group.conditions.push(cond);
    }

    const cond = condMap.get(a.material.id)!;
    if (a._count.stats > 0) cond.hasStats = true;

    // Pega os dados de bula do AnalyteMaterial (durante transição: 1:1 com Analyte)
    const am = a.analyteMaterials?.[0];

    const idx = Math.min(Math.max(a.level, 1), 3) - 1;
    cond.levels[idx] = {
      analyteId: a.id,
      level: a.level,
      value: "",
      status: "idle",
      violations: [],
      materialName: a.material.name,
      materialLot: a.material.lot ?? null,
      manufacturerMean: am?.manufacturerMean ?? null,
      manufacturerSD: am?.manufacturerSD ?? null,
    };
  }

  // Para cada analito, garante sempre 2 condições: Ativo + Preparo
  for (const { group } of analyteMap.values()) {
    group.conditions.sort((a, b) => Number(b.hasStats) - Number(a.hasStats));

    if (group.conditions.length === 1) {
      const existing = group.conditions[0];
      const placeholder: ConditionGroup = {
        materialId: `__placeholder_${existing.hasStats ? "preparo" : "ativo"}`,
        hasStats: !existing.hasStats,
        levels: [null, null, null],
      };
      if (existing.hasStats) {
        group.conditions.push(placeholder);
      } else {
        group.conditions.unshift(placeholder);
      }
    }
  }

  return Array.from(analyteMap.values())
    .map(({ group }) => group)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Tooltip com informações de bula da condição (todos os níveis)
function BulaTooltip({ cond, equipmentName }: { cond: ConditionGroup; equipmentName: string }) {
  const levelsWithData = cond.levels
    .map((l, i) => ({ entry: l, level: i + 1 }))
    .filter((x) => x.entry !== null) as Array<{ entry: LevelEntry; level: number }>;

  if (levelsWithData.length === 0) {
    return (
      <div className="text-xs text-white/70">
        Nenhum nível configurado para esta condição.
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="font-semibold text-white/90 border-b border-white/20 pb-1 mb-1">
        {equipmentName} — {cond.hasStats ? "Ativo" : "Preparo"}
      </div>
      {levelsWithData.map(({ entry, level }) => (
        <div key={level} className="space-y-0.5">
          <div className="font-semibold">
            Nível {level}: <span className="font-normal">{entry.materialName}</span>
          </div>
          {entry.materialLot && (
            <div className="text-white/70">Lote: {entry.materialLot}</div>
          )}
          {entry.manufacturerMean !== null && entry.manufacturerSD !== null && (
            <div className="text-white/80 font-mono">
              Xm: {entry.manufacturerMean.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
              {" — "}
              DP: {entry.manufacturerSD.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
            </div>
          )}
          {entry.manufacturerMean === null && entry.manufacturerSD === null && (
            <div className="text-white/50 italic">Sem valores de bula</div>
          )}
        </div>
      ))}
    </div>
  );
}

function LancamentoInner() {
  const searchParams = useSearchParams();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [selectedEquipId, setSelectedEquipId] = useState<string>("");
  const [groups, setGroups] = useState<AnalyteGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Tooltip popover state — qual condição está aberta (formato "gi-ci")
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/equipamentos")
      .then((r) => r.json())
      .then((list: Equipment[]) => {
        if (!Array.isArray(list)) return;
        setEquipments(list);
        const paramId = searchParams.get("equipment");
        const initial = paramId && list.find((e) => e.id === paramId) ? paramId : list[0]?.id ?? "";
        setSelectedEquipId(initial);
      })
      .catch(() => {});
  }, [searchParams]);

  const loadAnalytes = useCallback((equipId: string) => {
    if (!equipId) return;
    setSubmitted(false);
    fetch("/api/analitos")
      .then((r) => r.json())
      .then((list: Analyte[]) => {
        const filtered = list.filter((a) => a.equipmentId === equipId && a.active !== false);
        setGroups(groupAnalytes(filtered));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadAnalytes(selectedEquipId); }, [selectedEquipId, loadAnalytes]);

  // Fecha tooltip ao clicar fora
  useEffect(() => {
    if (!openTooltip) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-tooltip-anchor]")) setOpenTooltip(null);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [openTooltip]);

  const updateLevel = (gi: number, ci: number, li: number, value: string) => {
    setGroups((prev) =>
      prev.map((g, gIdx) => {
        if (gIdx !== gi) return g;
        return {
          ...g,
          conditions: g.conditions.map((c, cIdx) => {
            if (cIdx !== ci) return c;
            const levels = [...c.levels] as ConditionGroup["levels"];
            const entry = levels[li];
            if (!entry) return c;
            levels[li] = { ...entry, value, status: "idle", violations: [] };
            return { ...c, levels };
          }),
        };
      })
    );
  };

  const handleSubmit = async () => {
    type SaveItem = { gi: number; ci: number; li: number; entry: LevelEntry };
    const toSave: SaveItem[] = [];
    groups.forEach((g, gi) =>
      g.conditions.forEach((c, ci) =>
        c.levels.forEach((e, li) => {
          if (e && e.value.trim() !== "") toSave.push({ gi, ci, li, entry: e });
        })
      )
    );
    if (toSave.length === 0) return;

    setSubmitting(true);

    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => ({
          ...c,
          levels: c.levels.map((e) =>
            e && e.value.trim() !== "" ? { ...e, status: "saving" as RunStatus } : e
          ) as ConditionGroup["levels"],
        })),
      }))
    );

    const results = await Promise.allSettled(
      toSave.map(({ entry }) =>
        fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analyteId: entry.analyteId,
            value: parseFloat(entry.value.replace(",", ".")),
          }),
        }).then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
          return body;
        })
      )
    );

    setGroups((prev) => {
      const next = prev.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => ({ ...c, levels: [...c.levels] as ConditionGroup["levels"] })),
      }));
      toSave.forEach(({ gi, ci, li }, i) => {
        const result = results[i];
        const entry = next[gi].conditions[ci].levels[li];
        if (!entry) return;
        if (result.status === "fulfilled") {
          const run = result.value;
          next[gi].conditions[ci].levels[li] = {
            ...entry,
            status: (run.status?.toLowerCase() as RunStatus) ?? "ok",
            violations: run.violations ?? [],
          };
        } else {
          next[gi].conditions[ci].levels[li] = { ...entry, status: "error", violations: [] };
        }
      });
      return next;
    });

    setSubmitting(false);
    setSubmitted(true);
  };

  const handleClear = () => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => ({
          ...c,
          levels: c.levels.map((e) => (e ? { ...e, value: "", status: "idle" as RunStatus, violations: [] } : e)) as ConditionGroup["levels"],
        })),
      }))
    );
    setSubmitted(false);
  };

  const hasValues = groups.some((g) =>
    g.conditions.some((c) => c.levels.some((e) => e && e.value.trim() !== ""))
  );
  const selectedEquip = equipments.find((e) => e.id === selectedEquipId);

  // Sempre exibe as 3 colunas de nível (células cinzas = não configurado)
  const activeLevels: [boolean, boolean, boolean] = [true, true, true];

  let inputCounter = 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">
            Lançamento em Massa
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Lance corridas para todos os analitos de um equipamento de uma vez.
          </p>
        </div>
        <select
          value={selectedEquipId}
          onChange={(e) => setSelectedEquipId(e.target.value)}
          className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm font-medium text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-w-[220px]"
        >
          {equipments.map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.name}</option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-gray-300 dark:text-gray-600 mb-3 block">inventory_2</span>
          <p className="text-gray-500">Nenhum analito encontrado para este equipamento.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
          {/* Card header */}
          <div className="bg-danger-600 px-6 py-4 text-white flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-base mb-0">{selectedEquip?.name ?? "Equipamento"}</h3>
              <p className="text-white/70 text-xs mb-0">Lançamento de corridas</p>
            </div>
            <div className="flex items-center gap-2">
              {submitted && (
                <span className="text-xs bg-white/20 rounded-full px-3 py-1">Lançamento concluído</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">
                    Analitos
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Condição do controle
                  </th>
                  {([1, 2, 3] as const).map((n, i) =>
                    activeLevels[i] ? (
                      <th key={n} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[130px]">
                        Nível {n}
                      </th>
                    ) : null
                  )}
                </tr>
              </thead>
              <tbody>
                {groups.map((group, gi) =>
                  group.conditions.map((cond, ci) => {
                    const isFirstCond = ci === 0;
                    const isAtivo = cond.hasStats;
                    const tooltipKey = `${gi}-${ci}`;
                    const isOpen = openTooltip === tooltipKey;
                    const equipName = selectedEquip?.name ?? "";
                    return (
                      <tr
                        key={`${group.name}||${cond.materialId}`}
                        className={`border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50/50 dark:hover:bg-[#1a1a1a]/40 transition-colors ${
                          !isFirstCond ? "border-t border-dashed border-gray-100 dark:border-[#1a1a1a]" : ""
                        }`}
                      >
                        {/* Analito name — só na primeira linha (rowspan) */}
                        {isFirstCond && (
                          <td
                            rowSpan={group.conditions.length}
                            className="px-5 py-3 align-middle border-r border-gray-100 dark:border-[#1a1a1a]"
                          >
                            <span className="text-sm font-semibold text-black dark:text-white">{group.name}</span>
                            {group.unit && (
                              <span className="block text-xs text-gray-400 mt-0.5">{group.unit}</span>
                            )}
                          </td>
                        )}

                        {/* Condição do controle + ícones de ação */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium ${isAtivo ? "text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"}`}>
                              {isAtivo ? "Ativo" : "Preparo"}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {/* 📊 Gráfico evolutivo do CV mensal — só quando Ativo */}
                              {isAtivo ? (
                                <Link
                                  href={`/analitos/cv-mensal?name=${encodeURIComponent(group.name)}&eq=${selectedEquipId}`}
                                  title="Gráfico evolutivo do CV mensal"
                                  className="w-7 h-7 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all flex items-center justify-center"
                                >
                                  <span className="material-symbols-outlined text-[16px]">trending_up</span>
                                </Link>
                              ) : (
                                <span
                                  title="Disponível somente após estabelecer estatísticas"
                                  className="w-7 h-7 rounded-md text-gray-200 dark:text-gray-700 flex items-center justify-center cursor-not-allowed"
                                >
                                  <span className="material-symbols-outlined text-[16px]">trending_up</span>
                                </span>
                              )}

                              {/* 📋 Visualizar painel de controle */}
                              <Link
                                href={`/analitos/painel?name=${encodeURIComponent(group.name)}&eq=${selectedEquipId}`}
                                title="Visualizar painel de controle"
                                className="w-7 h-7 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all flex items-center justify-center"
                              >
                                <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                              </Link>

                              {/* ℹ️ Info — tooltip com bula */}
                              <div className="relative" data-tooltip-anchor>
                                <button
                                  onClick={() => setOpenTooltip(isOpen ? null : tooltipKey)}
                                  title="Informações do material"
                                  className={`w-7 h-7 rounded-md transition-all flex items-center justify-center ${
                                    isOpen
                                      ? "bg-gray-800 text-white"
                                      : "text-gray-400 hover:text-primary-500 hover:bg-primary-50"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[16px]">info</span>
                                </button>

                                {isOpen && (
                                  <div className="absolute left-0 top-full mt-2 z-30 w-80 max-w-[90vw] bg-gray-900 text-white rounded-lg shadow-2xl p-3 border border-gray-700">
                                    <BulaTooltip cond={cond} equipmentName={equipName} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Colunas de nível */}
                        {([0, 1, 2] as const).map((li) => {
                          if (!activeLevels[li]) return null;
                          const entry = cond.levels[li];

                          if (!entry) {
                            return (
                              <td key={li} className="px-3 py-3">
                                <div className="w-full h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]" />
                              </td>
                            );
                          }

                          const st = STATUS_META[entry.status];
                          const myIdx = inputCounter++;
                          return (
                            <td key={li} className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={entry.value}
                                onChange={(e) => updateLevel(gi, ci, li, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const inputs = document.querySelectorAll<HTMLInputElement>("[data-value-input]");
                                    const next = inputs[myIdx + 1];
                                    if (next) next.focus();
                                  }
                                }}
                                data-value-input
                                className={`w-full px-3 py-1.5 rounded-lg border text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors ${
                                  entry.status === "ok"
                                    ? "border-success-300 bg-success-50/50 dark:bg-success-900/10"
                                    : entry.status === "alert"
                                    ? "border-warning-300 bg-warning-50/50 dark:bg-warning-900/10"
                                    : entry.status === "reject"
                                    ? "border-danger-300 bg-danger-50/50 dark:bg-danger-900/10"
                                    : "border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0b0b]"
                                }`}
                              />
                              {entry.status !== "idle" && (
                                <div className="mt-1 text-center">
                                  <span className={`text-[10px] ${st.cls}`}>{st.label}</span>
                                  {entry.violations.length > 0 && (
                                    <span className="text-[9px] text-gray-400 ml-1">{entry.violations.join(" ")}</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              Use{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#2a2a2a] text-[10px]">Enter</kbd>{" "}
              para avançar entre os campos.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClear}
                disabled={submitting || !hasValues}
                className="px-5 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-[#1a1a1a] rounded-lg hover:bg-gray-100 dark:hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">clear_all</span>
                LIMPAR
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !hasValues}
                className="bg-success-600 hover:bg-success-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    Salvando…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    SALVAR
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LancamentoEmMassaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando…</div>}>
      <LancamentoInner />
    </Suspense>
  );
}
