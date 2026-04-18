"use client";

import { useState, useEffect } from "react";

interface Run {
  id: string;
  value: number;
  status: string;
  violations: string[];
  note: string | null;
  runAt: string;
  analyte: { id: string; name: string; level: number };
  equipment: { id: string; name: string };
  user: { name: string | null };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function IntervencoesPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/relatorios/intervencoes")
      .then((r) => r.json())
      .then((d) => { setRuns(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = runs.filter((r) =>
    r.analyte.name.toLowerCase().includes(search.toLowerCase()) ||
    r.equipment.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.note ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">Intervenção em Equipamentos</h1>
          <p className="text-gray-500 dark:text-gray-400">Corridas rejeitadas que podem indicar necessidade de intervenção.</p>
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
          <input
            type="text"
            placeholder="Pesquisar…"
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
                {["Data", "Analito", "Equipamento", "Valor", "Regras violadas", "Observação", "Analista"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                    {[...Array(7)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" /></td>)}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Nenhuma intervenção registrada.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.runAt)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-black dark:text-white">{r.analyte.name}</span>
                    <span className="ml-1 text-xs text-gray-400">N{r.analyte.level}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.equipment.name}</td>
                  <td className="px-4 py-3 text-sm font-mono font-semibold text-danger-600">{r.value}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.violations.map((v) => (
                        <span key={v} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-danger-50 text-danger-600">{v}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{r.note ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{r.user.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] text-xs text-gray-400">
            {filtered.length} intervenção(ões)
          </div>
        )}
      </div>
    </div>
  );
}
