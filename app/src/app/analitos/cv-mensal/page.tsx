"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import CVMensalChart from "@/components/CVMensalChart";

interface MaterialSeries {
  materialId: string;
  materialName: string;
  materialLot: string | null;
  months: Array<{ ym: string; cv: number | null; mean: number | null; sd: number | null; n: number }>;
}

interface LevelGroup {
  level: number;
  materials: MaterialSeries[];
}

interface CVData {
  analyteName: string;
  analyteUnit: string | null;
  equipmentName: string | null;
  levels: LevelGroup[];
  fromDate: string;
  toDate: string;
}

// Gera array de "YYYY-MM" entre duas datas inclusivas
function generateMonths(from: string, to: string): string[] {
  const start = new Date(from);
  const end = new Date(to);
  const months: string[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function yearsAgoISO(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

function CVMensalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const name = searchParams.get("name") ?? "";
  const eq = searchParams.get("eq") ?? "";

  const [from, setFrom] = useState(yearsAgoISO(4));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<CVData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!name || !eq) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ name, eq, from, to });
    try {
      const res = await fetch(`/api/analitos/cv-mensal?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Erro ao carregar dados");
        setData(null);
      } else {
        setData(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
      setData(null);
    }
    setLoading(false);
  }, [name, eq, from, to]);

  useEffect(() => { load(); }, [load]);

  const allMonths = useMemo(() => {
    if (!data) return [];
    return generateMonths(data.fromDate, data.toDate);
  }, [data]);

  if (!name || !eq) {
    return (
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
        <span className="material-symbols-outlined text-5xl mb-3 block">error</span>
        <p>Parâmetros inválidos. Acesse esta página através do Lançamento ou Painel de Controle.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] flex items-center justify-center text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
              Evolução mensal do CV
            </p>
            <h1 className="text-lg font-bold text-black dark:text-white truncate">
              {data?.analyteName ?? name}
              {data?.analyteUnit && <span className="text-gray-400 font-normal ml-1">({data.analyteUnit})</span>}
              {data?.equipmentName && (
                <span className="text-gray-400 font-normal ml-2">— {data.equipmentName}</span>
              )}
            </h1>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-danger-600 hover:bg-danger-50 transition-all flex-shrink-0"
        >
          VOLTAR
        </button>
      </div>

      {/* Filtros de período */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Data Inicial</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Data Final</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
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
        {data && (
          <div className="text-xs text-gray-400">
            Período: {new Date(data.fromDate).toLocaleDateString("pt-BR")} até {new Date(data.toDate).toLocaleDateString("pt-BR")}
          </div>
        )}
      </div>

      {/* Estado: loading / erro / vazio / com dados */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          Calculando CV mensal...
        </div>
      )}

      {error && !loading && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-sm text-danger-700">
          {error}
        </div>
      )}

      {!loading && !error && data && data.levels.length === 0 && (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          <span className="material-symbols-outlined text-5xl mb-3 block">monitoring</span>
          <p className="text-sm">Nenhum dado de corrida no período para este analito × equipamento.</p>
        </div>
      )}

      {/* Charts: 1 por nível */}
      {!loading && !error && data && data.levels.map((lvl) => (
        <div
          key={lvl.level}
          className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-4"
        >
          <CVMensalChart
            level={lvl.level}
            materials={lvl.materials}
            allMonths={allMonths}
            height={280}
          />

          {/* Lista de lotes com totais */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#1a1a1a]">
            <div className="flex flex-wrap gap-3 text-xs">
              {lvl.materials.map((m) => {
                const totalRuns = m.months.reduce((sum, mo) => sum + mo.n, 0);
                const validMonths = m.months.filter((mo) => mo.cv !== null);
                const avgCV = validMonths.length > 0
                  ? validMonths.reduce((sum, mo) => sum + (mo.cv ?? 0), 0) / validMonths.length
                  : null;
                return (
                  <div
                    key={m.materialId}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-[#0c0b0b]"
                  >
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {m.materialName}
                    </span>
                    {m.materialLot && (
                      <span className="text-gray-400">Lote: {m.materialLot}</span>
                    )}
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{totalRuns} corridas</span>
                    {avgCV !== null && (
                      <>
                        <span className="text-gray-400">·</span>
                        <span className={`font-semibold ${avgCV > 5 ? "text-danger-600" : "text-success-600"}`}>
                          CV médio: {avgCV.toFixed(2)}%
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CVMensalPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando…</div>}>
      <CVMensalInner />
    </Suspense>
  );
}
