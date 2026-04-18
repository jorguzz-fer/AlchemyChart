"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface ControleAtivo {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipment: { id: string; name: string };
  material: { id: string; name: string };
  totalRuns: number;
  statPeriod: { mean: number; sd: number; cv: number; n: number } | null;
  inSetup: boolean;
}

// Incerteza expandida U = k * (SD / sqrt(n)) * 100 / mean  (k=2, confiança ~95%)
function calcU(sp: { mean: number; sd: number; n: number } | null): string {
  if (!sp || sp.mean === 0 || sp.n < 2) return "—";
  const u = (sp.sd / Math.sqrt(sp.n));
  const uPct = (u / sp.mean) * 100;
  return uPct.toFixed(2);
}

function UncertaintyBadge({ cv }: { cv: number }) {
  if (cv > 10) return <span className="text-xs px-2 py-0.5 rounded-full bg-danger-50 text-danger-600 font-semibold">Crítico (&gt;10%)</span>;
  if (cv > 5) return <span className="text-xs px-2 py-0.5 rounded-full bg-warning-50 text-warning-700 font-semibold">Elevado (&gt;5%)</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-success-50 text-success-700 font-semibold">Aceitável</span>;
}

export default function IncertezasPage() {
  const [items, setItems] = useState<ControleAtivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/relatorios/controles-ativos")
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d) ? d.filter((i: ControleAtivo) => !i.inSetup) : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.equipment.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">Relatório de Incertezas</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Incerteza expandida (U, k=2, ~95%) calculada a partir do CV do período de uso.
          </p>
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
          <input
            type="text"
            placeholder="Pesquisar analito…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-w-[200px]"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
              <tr>
                {["Analito", "Equipamento", "N", "Média", "DP", "CV%", "u (%)", "U (k=2, %)", "Classificação", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                    {[...Array(10)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" /></td>)}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">Nenhum analito com período estatístico ativo.</td></tr>
              ) : filtered.map((item) => {
                const sp = item.statPeriod;
                const uPct = sp ? parseFloat(calcU(sp)) : null;
                const uExp = uPct !== null && !isNaN(uPct) ? (uPct * 2).toFixed(2) : "—";
                return (
                  <tr key={item.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-black dark:text-white">{item.name}</span>
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-50 text-primary-600 text-[10px] font-bold">{item.level}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.equipment.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{sp?.n ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">{sp ? sp.mean.toFixed(3) : "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">{sp ? sp.sd.toFixed(3) : "—"}</td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      {sp ? <span className={sp.cv > 5 ? "text-danger-500" : "text-success-600"}>{sp.cv.toFixed(2)}%</span> : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{uPct !== null && !isNaN(uPct) ? `${uPct.toFixed(2)}%` : "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold">{uExp !== "—" ? `${uExp}%` : "—"}</td>
                    <td className="px-4 py-3">{sp ? <UncertaintyBadge cv={sp.cv} /> : "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/analitos/painel?id=${item.id}`} className="text-xs text-primary-500 hover:text-primary-600 font-semibold">Painel</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] text-xs text-gray-400">
            {filtered.length} analito(s) com estatística ativa · u = SD/√n · U = 2u (k=2)
          </div>
        )}
      </div>
    </div>
  );
}
