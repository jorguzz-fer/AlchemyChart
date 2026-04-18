"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface ControleAtivo {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipment: { id: string; name: string };
  material: { id: string; name: string; lot: string | null };
  totalRuns: number;
  statPeriod: { mean: number; sd: number; cv: number; n: number; period: string } | null;
  inSetup: boolean;
}

export default function ControlesAtivosPage() {
  const [items, setItems] = useState<ControleAtivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "setup" | "active" | "highcv">("all");

  useEffect(() => {
    fetch("/api/relatorios/controles-ativos")
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.equipment.name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "setup") return item.inSetup;
    if (filter === "active") return !item.inSetup;
    if (filter === "highcv") return item.statPeriod && item.statPeriod.cv > 5;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">Controles Ativos</h1>
          <p className="text-gray-500 dark:text-gray-400">Todos os analitos ativos com seus parâmetros estatísticos.</p>
        </div>
        <div className="flex items-center gap-2">
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
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm focus:outline-none"
          >
            <option value="all">Todos</option>
            <option value="setup">Em setup</option>
            <option value="active">Ativos</option>
            <option value="highcv">CV elevado (&gt;5%)</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
              <tr>
                {["Analito", "Equipamento", "Material", "N", "Média", "DP", "CV%", "Status", ""].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    Nenhum controle encontrado.
                  </td>
                </tr>
              ) : filtered.map((item) => {
                const sp = item.statPeriod;
                const highCv = sp && sp.cv > 5;
                return (
                  <tr key={item.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-black dark:text-white">{item.name}</span>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-50 dark:bg-[#1a1a1a] text-primary-600 text-[10px] font-bold">{item.level}</span>
                        {item.unit && <span className="text-xs text-gray-400">({item.unit})</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.equipment.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {item.material.name}
                      {item.material.lot && <span className="text-xs text-gray-400 ml-1">Lote {item.material.lot}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.totalRuns}</td>
                    <td className="px-4 py-3 text-sm font-mono">{sp ? sp.mean.toFixed(2) : "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">{sp ? sp.sd.toFixed(2) : "—"}</td>
                    <td className="px-4 py-3">
                      {sp ? (
                        <span className={`text-sm font-semibold ${highCv ? "text-danger-500" : "text-success-600"}`}>
                          {sp.cv.toFixed(1)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.inSetup ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning-50 text-warning-700">
                          <span className="material-symbols-outlined text-[12px]">hourglass_empty</span>
                          Setup ({item.totalRuns}/20)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-50 text-success-700">
                          <span className="material-symbols-outlined text-[12px]">check_circle</span>
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/analitos/painel?id=${item.id}`} className="inline-flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 font-semibold">
                        <span className="material-symbols-outlined text-[14px]">monitoring</span>
                        Painel
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] text-xs text-gray-400">
            {filtered.length} de {items.length} controles
          </div>
        )}
      </div>
    </div>
  );
}
