"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface Equipment { id: string; name: string }

interface AnalyteCol { key: string; name: string; unit: string | null }

interface DayRow {
  date: string;
  weekday: string;
  isWeekend: boolean;
  counts: Record<string, number>;
}

interface AuditData {
  equipment: { id: string; name: string };
  analytes: AnalyteCol[];
  days: DayRow[];
  fromDate: string;
  toDate: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function AuditoriaInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const equipmentParam = searchParams.get("equipment") ?? "";
  const [from, setFrom] = useState(daysAgoISO(29));
  const [to, setTo] = useState(todayISO());

  // Load equipments list (for selector when nothing selected)
  useEffect(() => {
    fetch("/api/equipamentos")
      .then((r) => r.json())
      .then((list: Equipment[]) => {
        if (Array.isArray(list)) setEquipments(list.filter((e) => (e as { active?: boolean }).active !== false));
      })
      .catch(() => {});
  }, []);

  // Load audit data when equipment selected
  const load = useCallback(async () => {
    if (!equipmentParam) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ equipment: equipmentParam, from, to });
    try {
      const res = await fetch(`/api/auditoria?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Erro ao carregar auditoria");
        setData(null);
      } else {
        setData(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
      setData(null);
    }
    setLoading(false);
  }, [equipmentParam, from, to]);

  useEffect(() => { load(); }, [load]);

  // Auto-select first equipment if none in URL
  useEffect(() => {
    if (!equipmentParam && equipments.length > 0) {
      router.replace(`/auditoria?equipment=${equipments[0].id}`, { scroll: false });
    }
  }, [equipmentParam, equipments, router]);

  if (!equipmentParam) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Auditoria</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Visualize a frequência de lançamento de corridas por dia para cada equipamento
          </p>
        </div>
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          {equipments.length === 0 ? (
            <>
              <span className="material-symbols-outlined text-5xl mb-3 block">precision_manufacturing</span>
              <p>Nenhum equipamento cadastrado</p>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-5xl mb-3 block">fact_check</span>
              <p>Selecione um equipamento para ver a auditoria</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Auditoria
          </p>
          <h1 className="text-xl font-bold text-black dark:text-white">
            {data?.equipment.name ?? "Carregando..."}
          </h1>
        </div>
        <select
          value={equipmentParam}
          onChange={(e) => router.replace(`/auditoria?equipment=${e.target.value}`, { scroll: false })}
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm font-medium text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-w-[220px]"
        >
          {equipments.map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.name}</option>
          ))}
        </select>
      </div>

      {/* Filtros de período + presets */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Inicial</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Final</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>
          {/* Presets */}
          <div className="flex items-center gap-1 ml-2">
            {[
              { label: "7 dias", days: 6 },
              { label: "30 dias", days: 29 },
              { label: "90 dias", days: 89 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { setFrom(daysAgoISO(p.days)); setTo(todayISO()); }}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#1a1a1a] hover:bg-primary-50 hover:text-primary-500 hover:border-primary-200 transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-lg alchemy-gradient text-white text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Atualizar
        </button>
      </div>

      {/* Estado */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          Carregando auditoria...
        </div>
      )}

      {error && !loading && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-sm text-danger-700">
          {error}
        </div>
      )}

      {!loading && !error && data && data.analytes.length === 0 && (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          <span className="material-symbols-outlined text-5xl mb-3 block">biotech</span>
          <p className="text-sm">Nenhum analito ativo neste equipamento</p>
        </div>
      )}

      {/* Grid calendário */}
      {!loading && !error && data && data.analytes.length > 0 && (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
          <div className="bg-danger-600 px-5 py-3 flex items-center justify-between">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">fact_check</span>
              {data.equipment.name}
            </h3>
            <span className="text-white/70 text-xs">
              {data.analytes.length} analitos × {data.days.length} dias
            </span>
          </div>

          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b] sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 dark:bg-[#0c0b0b] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[140px] border-r border-gray-200 dark:border-[#1a1a1a]">
                    DATA
                  </th>
                  {data.analytes.map((a) => (
                    <th
                      key={a.key}
                      className="px-3 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 min-w-[100px] border-r border-gray-100 dark:border-[#1a1a1a]"
                    >
                      <div>{a.name}</div>
                      {a.unit && <div className="text-[10px] text-gray-400 font-normal">{a.unit}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr
                    key={d.date}
                    className={`border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a]/40 transition-colors ${
                      d.isWeekend ? "bg-danger-50/20 dark:bg-danger-900/10" : ""
                    }`}
                  >
                    <td
                      className={`sticky left-0 bg-white dark:bg-[#141414] px-4 py-2.5 text-sm font-semibold border-r border-gray-200 dark:border-[#1a1a1a] ${
                        d.isWeekend ? "text-danger-600" : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {formatDate(d.date)} ({d.weekday})
                    </td>
                    {data.analytes.map((a) => {
                      const c = d.counts[a.key] ?? 0;
                      return (
                        <td
                          key={a.key}
                          className="px-3 py-2.5 text-center text-sm border-r border-gray-100 dark:border-[#1a1a1a]"
                        >
                          {c > 0 ? (
                            <span className={`inline-block min-w-[24px] px-1.5 py-0.5 rounded font-bold ${
                              c >= 2
                                ? "text-success-700 dark:text-success-400"
                                : "text-warning-700 dark:text-warning-400"
                            }`}>
                              {c}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="px-5 py-3 border-t border-gray-100 dark:border-[#1a1a1a] flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-danger-50/40 border border-danger-200" />
              <span>Fim de semana</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-success-700 font-bold">≥ 2</span>
              <span>Cobertura completa do dia</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-warning-700 font-bold">1</span>
              <span>Apenas um nível lançado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-300">—</span>
              <span>Sem corridas</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditoriaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando…</div>}>
      <AuditoriaInner />
    </Suspense>
  );
}
