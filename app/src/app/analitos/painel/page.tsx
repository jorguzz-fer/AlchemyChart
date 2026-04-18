"use client";

import LeveyJenningsChart from "@/components/LeveyJenningsChart";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface RunRecord {
  id: string;
  value: number;
  status: "OK" | "ALERT" | "REJECT";
  violations: string[];
  note: string | null;
  runAt: string;
  user: { name: string | null };
}

interface StatPeriod {
  mean: number;
  sd: number;
  cv: number;
  n: number;
  period: string;
}

interface CurrentStats {
  mean: number;
  sd: number;
  cv: number;
  n: number;
}

interface Analyte {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipment: { id: string; name: string };
  material: { id: string; name: string };
}

interface PainelData {
  analyte: Analyte;
  runs: RunRecord[];
  statPeriod: StatPeriod | null;
  currentStats: CurrentStats | null;
}

const STATUS_STYLES: Record<string, string> = {
  OK: "bg-success-50 text-success-700",
  ALERT: "bg-warning-50 text-warning-700",
  REJECT: "bg-danger-50 text-danger-700",
};

export default function PainelControle() {
  const searchParams = useSearchParams();
  const [analytes, setAnalytes] = useState<Analyte[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [data, setData] = useState<PainelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analitos")
      .then((r) => r.json())
      .then((list: Analyte[]) => {
        const active = list.filter((a: Analyte & { active?: boolean }) => a.active !== false);
        setAnalytes(active);
        const paramId = searchParams.get("id");
        const initial = paramId && active.find((a) => a.id === paramId) ? paramId : active[0]?.id ?? "";
        setSelectedId(initial);
      });
  }, [searchParams]);

  const loadData = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/analitos/${id}/runs`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadData(selectedId);
  }, [selectedId, loadData]);

  const handleSaveRun = async () => {
    const val = parseFloat(newValue.replace(",", "."));
    if (isNaN(val)) { setSaveError("Valor inválido"); return; }
    setSaving(true);
    setSaveError(null);

    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyteId: selectedId, value: val, note: newNote }),
    });

    if (!res.ok) {
      const d = await res.json();
      setSaveError(d.error ?? "Erro ao salvar");
    } else {
      setNewValue("");
      setNewNote("");
      loadData(selectedId);
    }
    setSaving(false);
  };

  const isSetupPhase = !data?.statPeriod;
  const runs = data?.runs ?? [];
  const ljValues = runs.map((r) => r.value);
  const mean = data?.statPeriod?.mean ?? data?.currentStats?.mean ?? 0;
  const sd = data?.statPeriod?.sd ?? data?.currentStats?.sd ?? 1;
  const nextRunNo = runs.length + 1;

  return (
    <div className="space-y-6">
      {/* Analyte selector + back */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link
            href="/analitos"
            className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] flex items-center justify-center text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Selecionar Analito
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full sm:max-w-md px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all font-medium"
            >
              {analytes.length === 0 && <option value="">Nenhum analito cadastrado</option>}
              {analytes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.equipment.name} (Nível {a.level})
                </option>
              ))}
            </select>
          </div>
          {data && (
            <div className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
              <span className="font-semibold text-black dark:text-white">{data.analyte.material.name}</span>
              {data.analyte.unit && <span className="ml-2 text-gray-400">({data.analyte.unit})</span>}
            </div>
          )}
        </div>
      </div>

      {/* Setup phase banner */}
      {data && isSetupPhase && (
        <div className="bg-info-50 dark:bg-info-900/20 border border-info-200 dark:border-info-800 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-info-500 text-[22px] flex-shrink-0">info</span>
          <p className="text-sm text-info-800 dark:text-info-200 mb-0">
            Fase de <strong>preparo</strong>: {runs.length}/20 corridas registradas.
            As regras de Westgard serão ativadas após 20 entradas, quando a média e o DP são estabelecidos.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          Carregando dados do analito...
        </div>
      ) : !data ? null : (
        <>
          {/* Grid: Corridas + Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Corridas table */}
            <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
              <div className="alchemy-gradient px-6 py-4">
                <h3 className="text-white font-bold text-base mb-0 flex items-center gap-2">
                  <span className="material-symbols-outlined">table_rows</span>
                  Corridas
                  <span className="ml-auto text-white/70 text-xs font-normal">{runs.length} registros</span>
                </h3>
              </div>

              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#0c0b0b] sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Valor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run, i) => (
                      <tr
                        key={run.id}
                        className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-semibold text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-primary-600">
                          {run.value.toFixed(3)}
                          {data.analyte.unit && (
                            <span className="text-gray-400 font-normal text-xs ml-1">{data.analyte.unit}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {run.status === "OK" ? (
                            <span className="text-xs font-semibold text-success-600">OK</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[run.status]}`}>
                              {run.violations.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(run.runAt).toLocaleDateString("pt-BR")}
                        </td>
                      </tr>
                    ))}

                    {/* Inline entry row */}
                    <tr className="border-t-2 border-primary-200 dark:border-primary-900 bg-primary-50/40 dark:bg-primary-900/10">
                      <td className="px-4 py-3 text-gray-400 font-semibold text-xs">{nextRunNo}</td>
                      <td className="px-4 py-3" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newValue}
                            onChange={(e) => { setNewValue(e.target.value); setSaveError(null); }}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveRun()}
                            placeholder="0,000"
                            className="w-24 px-2 py-1.5 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-[#141414] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                          />
                          <input
                            type="text"
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Observação..."
                            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-all"
                          />
                        </div>
                        {saveError && (
                          <p className="text-xs text-danger-600 mt-1">{saveError}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={handleSaveRun}
                          disabled={saving || !newValue.trim()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white alchemy-gradient hover:shadow-md transition-all disabled:opacity-50"
                        >
                          {saving ? (
                            <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                          ) : (
                            <span className="material-symbols-outlined text-[14px]">save</span>
                          )}
                          Salvar
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Levey-Jennings chart */}
            <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
              <div className="alchemy-gradient-gold px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-base mb-0 flex items-center gap-2">
                  <span className="material-symbols-outlined">monitoring</span>
                  Levey-Jennings — {data.analyte.name}
                </h3>
                <span className="text-white/70 text-xs">Nível {data.analyte.level}</span>
              </div>
              <div className="p-4">
                {ljValues.length >= 2 ? (
                  <LeveyJenningsChart
                    mean={mean}
                    sd={sd}
                    values={ljValues}
                    height={340}
                  />
                ) : (
                  <div className="h-[340px] flex flex-col items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-4xl mb-2">monitoring</span>
                    <p className="text-sm">Mínimo de 2 corridas para exibir o gráfico</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats table */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
            <div className="alchemy-gradient px-6 py-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-white">analytics</span>
              <h3 className="text-white font-bold text-base mb-0">Dados dos Controles</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase w-28" />
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase" />
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.statPeriod && (
                    <>
                      <StatRow group="Uso" icon="inventory" label="Média" value={data.statPeriod.mean.toFixed(3)} first />
                      <StatRow label="Desvio Padrão" value={data.statPeriod.sd.toFixed(3)} />
                      <StatRow label="CV (%)" value={`${data.statPeriod.cv.toFixed(1)}%`} cvAlert={data.statPeriod.cv > 5} />
                      <StatRow label="N" value={String(data.statPeriod.n)} />
                    </>
                  )}
                  {data.currentStats && (
                    <>
                      <StatRow group="Corrente" icon="bolt" label="Média" value={data.currentStats.mean.toFixed(3)} first highlight />
                      <StatRow label="Desvio Padrão" value={data.currentStats.sd.toFixed(3)} highlight />
                      <StatRow label="CV (%)" value={`${data.currentStats.cv.toFixed(1)}%`} cvAlert={data.currentStats.cv > 5} highlight />
                      <StatRow label="Corridas" value={String(data.currentStats.n)} highlight />
                    </>
                  )}
                  {!data.statPeriod && !data.currentStats && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">
                        Estatísticas disponíveis após 2 corridas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatRow({
  group,
  icon,
  label,
  value,
  first,
  highlight,
  cvAlert,
}: {
  group?: string;
  icon?: string;
  label: string;
  value: string;
  first?: boolean;
  highlight?: boolean;
  cvAlert?: boolean;
}) {
  return (
    <tr
      className={`border-t border-gray-100 dark:border-[#1a1a1a] ${
        highlight ? "bg-primary-50/20 dark:bg-[#1a1a1a]/30" : ""
      }`}
    >
      {first && group && icon ? (
        <td
          rowSpan={4}
          className="px-6 py-3 text-center border-r border-gray-100 dark:border-[#1a1a1a] align-middle"
        >
          <div className="flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-primary-500 text-[20px]">{icon}</span>
            <span className="text-xs font-bold text-primary-600 uppercase tracking-widest">{group}</span>
          </div>
        </td>
      ) : !first ? null : (
        <td className="px-6 py-3 border-r border-gray-100 dark:border-[#1a1a1a]" />
      )}
      <td className="px-6 py-3 text-gray-700 dark:text-gray-300 font-medium">{label}</td>
      <td
        className={`px-6 py-3 text-center font-semibold ${
          cvAlert
            ? "bg-danger-100 dark:bg-danger-900/30 text-danger-700"
            : "text-black dark:text-white"
        }`}
      >
        {value}
      </td>
    </tr>
  );
}
