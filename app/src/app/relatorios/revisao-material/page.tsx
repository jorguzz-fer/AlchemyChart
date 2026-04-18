"use client";

import { useState, useEffect } from "react";

interface Material {
  id: string;
  name: string;
  lot: string | null;
  generation: string | null;
  expiresAt: string | null;
  active: boolean;
  _count?: { analytes: number };
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-400 text-xs">Sem validade</span>;
  if (days < 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-50 text-danger-600"><span className="material-symbols-outlined text-[12px]">error</span>Vencido ({Math.abs(days)}d)</span>;
  if (days <= 7) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-50 text-danger-600"><span className="material-symbols-outlined text-[12px]">warning</span>{days}d restantes</span>;
  if (days <= 30) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-50 text-warning-700"><span className="material-symbols-outlined text-[12px]">schedule</span>{days}d restantes</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success-50 text-success-700"><span className="material-symbols-outlined text-[12px]">check_circle</span>{days}d restantes</span>;
}

export default function RevisaoMaterialPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "urgent" | "expiring">("all");

  useEffect(() => {
    fetch("/api/materiais")
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sorted = [...items].sort((a, b) => {
    const da = daysUntil(a.expiresAt) ?? 9999;
    const db = daysUntil(b.expiresAt) ?? 9999;
    return da - db;
  });

  const filtered = sorted.filter((m) => {
    const days = daysUntil(m.expiresAt);
    if (filter === "urgent") return days !== null && days <= 7;
    if (filter === "expiring") return days !== null && days <= 30;
    return true;
  });

  const urgent = items.filter((m) => { const d = daysUntil(m.expiresAt); return d !== null && d <= 7; }).length;
  const expiring = items.filter((m) => { const d = daysUntil(m.expiresAt); return d !== null && d <= 30; }).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">Revisão em Preparo (Material)</h1>
        <p className="text-gray-500 dark:text-gray-400">Materiais de controle ordenados por data de validade.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Urgente (≤7d)", count: urgent, tone: "danger", f: "urgent" },
          { label: "A vencer (≤30d)", count: expiring, tone: "warning", f: "expiring" },
          { label: "Total materiais", count: items.length, tone: "info", f: "all" },
        ].map((card) => (
          <button
            key={card.f}
            onClick={() => setFilter(card.f as typeof filter)}
            className={`bg-white dark:bg-[#141414] rounded-2xl border p-5 text-left transition-all hover:shadow-md ${filter === card.f ? "border-primary-400 ring-1 ring-primary-400" : "border-gray-100 dark:border-[#1a1a1a]"}`}
          >
            <p className="text-3xl font-bold text-black dark:text-white mb-1">{loading ? "—" : card.count}</p>
            <p className="text-sm text-gray-500">{card.label}</p>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
              <tr>
                {["Material", "Lote", "Geração", "Validade", "Status", "Analitos"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Nenhum material encontrado.</td></tr>
              ) : filtered.map((m) => {
                const days = daysUntil(m.expiresAt);
                return (
                  <tr key={m.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 font-medium text-sm text-black dark:text-white">{m.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{m.lot ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{m.generation ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {m.expiresAt ? new Date(m.expiresAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3"><ExpiryBadge days={days} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{(m as Material & { _count?: { analytes: number } })._count?.analytes ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
