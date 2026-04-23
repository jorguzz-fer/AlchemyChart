"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Analyte {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipmentId: string;
  active?: boolean;
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
}

interface AnalyteGroup {
  name: string;
  unit: string | null;
  // index 0 = nível 1, index 1 = nível 2, index 2 = nível 3
  levels: [LevelEntry | null, LevelEntry | null, LevelEntry | null];
}

const STATUS_META: Record<RunStatus, { label: string; cls: string }> = {
  idle:    { label: "",          cls: "" },
  saving:  { label: "Salvando…", cls: "text-gray-400 animate-pulse" },
  ok:      { label: "OK",        cls: "text-success-600 font-bold" },
  alert:   { label: "ALERTA",    cls: "text-warning-600 font-bold" },
  reject:  { label: "REJEITAR",  cls: "text-danger-600 font-bold" },
  error:   { label: "ERRO",      cls: "text-danger-500" },
};

function groupAnalytes(list: Analyte[]): AnalyteGroup[] {
  const map = new Map<string, AnalyteGroup>();
  for (const a of list) {
    if (a.active === false) continue;
    const key = `${a.name}||${a.unit ?? ""}`;
    if (!map.has(key)) {
      map.set(key, { name: a.name, unit: a.unit, levels: [null, null, null] });
    }
    const idx = Math.min(Math.max(a.level, 1), 3) - 1;
    map.get(key)!.levels[idx] = {
      analyteId: a.id,
      level: a.level,
      value: "",
      status: "idle",
      violations: [],
    };
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function LancamentoInner() {
  const searchParams = useSearchParams();
  const [equipments, setEquipments]       = useState<Equipment[]>([]);
  const [selectedEquipId, setSelectedEquipId] = useState<string>("");
  const [groups, setGroups]               = useState<AnalyteGroup[]>([]);
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);

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

  const updateLevel = (groupIdx: number, levelIdx: number, value: string) => {
    setGroups((prev) =>
      prev.map((g, gi) => {
        if (gi !== groupIdx) return g;
        const levels = [...g.levels] as AnalyteGroup["levels"];
        const entry = levels[levelIdx];
        if (!entry) return g;
        levels[levelIdx] = { ...entry, value, status: "idle", violations: [] };
        return { ...g, levels };
      })
    );
  };

  const handleSubmit = async () => {
    // Coleta todas as entradas com valor preenchido
    const toSave: { groupIdx: number; levelIdx: number; entry: LevelEntry }[] = [];
    groups.forEach((g, gi) =>
      g.levels.forEach((e, li) => {
        if (e && e.value.trim() !== "") toSave.push({ groupIdx: gi, levelIdx: li, entry: e });
      })
    );
    if (toSave.length === 0) return;

    setSubmitting(true);

    // Marca todos como "saving"
    setGroups((prev) =>
      prev.map((g, gi) => {
        const levels = [...g.levels] as AnalyteGroup["levels"];
        levels.forEach((e, li) => {
          if (e && e.value.trim() !== "") levels[li] = { ...e!, status: "saving" };
        });
        return { ...g, levels };
      })
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
        }).then((r) => r.json())
      )
    );

    setGroups((prev) => {
      const next = prev.map((g) => ({
        ...g,
        levels: [...g.levels] as AnalyteGroup["levels"],
      }));
      toSave.forEach(({ groupIdx, levelIdx }, i) => {
        const result = results[i];
        const entry = next[groupIdx].levels[levelIdx];
        if (!entry) return;
        if (result.status === "fulfilled") {
          const run = result.value;
          next[groupIdx].levels[levelIdx] = {
            ...entry,
            status: (run.status?.toLowerCase() as RunStatus) ?? "ok",
            violations: run.violations ?? [],
          };
        } else {
          next[groupIdx].levels[levelIdx] = { ...entry, status: "error", violations: [] };
        }
      });
      return next;
    });

    setSubmitting(false);
    setSubmitted(true);
  };

  const hasValues = groups.some((g) => g.levels.some((e) => e && e.value.trim() !== ""));
  const selectedEquip = equipments.find((e) => e.id === selectedEquipId);

  // Descobre quais colunas de nível existem no equipamento atual
  const activeLevels: [boolean, boolean, boolean] = [false, false, false];
  groups.forEach((g) => g.levels.forEach((e, i) => { if (e) activeLevels[i] = true; }));

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
          <div className="alchemy-gradient px-6 py-4 text-white flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-base mb-0">{selectedEquip?.name ?? "Equipamento"}</h3>
              <p className="text-white/70 text-xs mb-0">{groups.length} analito(s)</p>
            </div>
            {submitted && (
              <span className="text-xs bg-white/20 rounded-full px-3 py-1">Lançamento concluído</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Analito
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
                {groups.map((group, gi) => {
                  return (
                    <tr
                      key={`${group.name}||${group.unit}`}
                      className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50/50 dark:hover:bg-[#1a1a1a]/40 transition-colors"
                    >
                      {/* Analito name */}
                      <td className="px-5 py-3">
                        <span className="text-sm font-medium text-black dark:text-white">{group.name}</span>
                        {group.unit && <span className="ml-1 text-xs text-gray-400">({group.unit})</span>}
                      </td>

                      {/* Colunas de nível */}
                      {([0, 1, 2] as const).map((li) => {
                        if (!activeLevels[li]) return null;
                        const entry = group.levels[li];

                        if (!entry) {
                          // Nível não configurado para este analito
                          return (
                            <td key={li} className="px-3 py-3">
                              <div className="w-full h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]" />
                            </td>
                          );
                        }

                        const st = STATUS_META[entry.status];
                        return (
                          <td key={li} className="px-3 py-3">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={entry.value}
                              onChange={(e) => updateLevel(gi, li, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const inputs = document.querySelectorAll<HTMLInputElement>("[data-value-input]");
                                  const all = Array.from(inputs);
                                  const cur = e.currentTarget;
                                  const curIdx = all.indexOf(cur);
                                  if (curIdx >= 0 && all[curIdx + 1]) all[curIdx + 1].focus();
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
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              Use{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#2a2a2a] text-[10px]">Enter</kbd>{" "}
              para avançar entre os campos de valor.
            </p>
            <div className="flex items-center gap-3">
              {submitted && (
                <button
                  onClick={() => loadAnalytes(selectedEquipId)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-[#1a1a1a] rounded-lg hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-all"
                >
                  Novo lançamento
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting || !hasValues}
                className="alchemy-gradient text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    Salvando…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    Lançar corridas
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
