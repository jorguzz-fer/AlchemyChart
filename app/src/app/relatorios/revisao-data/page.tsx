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
  statPeriod: { mean: number; sd: number; cv: number; n: number; period: string; createdAt?: string } | null;
  inSetup: boolean;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function RevisaoDataPage() {
  const [items, setItems] = useState<ControleAtivo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/relatorios/controles-ativos")
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Group by equipment
  const byEquip = items.reduce<Record<string, { name: string; items: ControleAtivo[] }>>((acc, item) => {
    const key = item.equipment.id;
    if (!acc[key]) acc[key] = { name: item.equipment.name, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});

  const inSetup = items.filter((i) => i.inSetup).length;
  const active = items.filter((i) => !i.inSetup).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">Revisão em Preparo (Data)</h1>
        <p className="text-gray-500 dark:text-gray-400">Analitos agrupados por equipamento com data de início do período estatístico.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Em setup", value: loading ? "—" : inSetup, cls: "text-warning-600" },
          { label: "Ativos", value: loading ? "—" : active, cls: "text-success-600" },
          { label: "Total analitos", value: loading ? "—" : items.length, cls: "text-black dark:text-white" },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5">
            <p className={`text-3xl font-bold mb-1 ${card.cls}`}>{card.value}</p>
            <p className="text-sm text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5 animate-pulse">
              <div className="h-5 w-1/4 bg-gray-100 dark:bg-[#1a1a1a] rounded mb-4" />
              <div className="space-y-2">{[...Array(3)].map((_, j) => <div key={j} className="h-4 bg-gray-100 dark:bg-[#1a1a1a] rounded" />)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(byEquip).map((group) => (
            <div key={group.name} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 dark:bg-[#0c0b0b] border-b border-gray-100 dark:border-[#1a1a1a]">
                <span className="material-symbols-outlined text-primary-500 text-[20px]">settings_applications</span>
                <h3 className="font-semibold text-black dark:text-white text-sm">{group.name}</h3>
                <span className="ml-auto text-xs text-gray-400">{group.items.length} analito(s)</span>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50/50 dark:bg-[#0c0b0b]/50">
                  <tr>
                    {["Analito", "Nível", "Corridas", "Início período", "Média", "DP", "CV%", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 py-2.5 text-sm font-medium text-black dark:text-white">{item.name}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-50 text-primary-600 text-[10px] font-bold">{item.level}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">{item.totalRuns}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                        {fmtDate((item.statPeriod as { createdAt?: string } | null)?.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-mono">{item.statPeriod ? item.statPeriod.mean.toFixed(2) : "—"}</td>
                      <td className="px-4 py-2.5 text-sm font-mono">{item.statPeriod ? item.statPeriod.sd.toFixed(2) : "—"}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold">
                        {item.statPeriod ? (
                          <span className={item.statPeriod.cv > 5 ? "text-danger-500" : "text-success-600"}>
                            {item.statPeriod.cv.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {item.inSetup ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-warning-50 text-warning-700 font-medium">Setup</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-success-50 text-success-700 font-medium">Ativo</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/analitos/painel?id=${item.id}`} className="text-xs text-primary-500 hover:text-primary-600 font-semibold">
                          Painel
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
