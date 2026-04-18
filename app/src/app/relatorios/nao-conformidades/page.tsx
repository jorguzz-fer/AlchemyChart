"use client";

import { useState, useEffect } from "react";

interface NonConformity {
  id: string;
  description: string;
  action: string | null;
  resolvedAt: string | null;
  createdAt: string;
  run: {
    value: number;
    status: string;
    violations: string[];
    runAt: string;
    analyte: { id: string; name: string; level: number };
    equipment: { id: string; name: string };
    user: { name: string | null };
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function NaoConformidadesPage() {
  const [items, setItems] = useState<NonConformity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [resolving, setResolving] = useState<string | null>(null);
  const [actionText, setActionText] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/relatorios/nao-conformidades")
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleResolve = async (id: string) => {
    const action = actionText[id] ?? "";
    const res = await fetch("/api/relatorios/nao-conformidades", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((nc) => nc.id === id ? { ...nc, ...updated } : nc));
      setResolving(null);
    }
  };

  const filtered = items.filter((nc) => {
    if (filter === "open") return !nc.resolvedAt;
    if (filter === "resolved") return !!nc.resolvedAt;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">Não Conformidades</h1>
          <p className="text-gray-500 dark:text-gray-400">Registros de corridas que violaram regras de Westgard.</p>
        </div>
        <div className="flex gap-1 bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#1a1a1a] rounded-lg p-1">
          {(["all", "open", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${filter === f ? "alchemy-gradient text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
            >
              {f === "all" ? "Todas" : f === "open" ? "Abertas" : "Resolvidas"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5 animate-pulse">
              <div className="h-5 w-1/3 bg-gray-100 dark:bg-[#1a1a1a] rounded mb-3" />
              <div className="h-4 w-2/3 bg-gray-100 dark:bg-[#1a1a1a] rounded" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-success-400 block mb-3">check_circle</span>
            <p className="text-gray-500">Nenhuma não conformidade {filter === "open" ? "aberta" : "encontrada"}.</p>
          </div>
        ) : filtered.map((nc) => (
          <div key={nc.id} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
            <div className={`h-1 ${nc.resolvedAt ? "bg-success-400" : "bg-danger-500"}`} />
            <div className="p-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-semibold text-black dark:text-white">{nc.run.analyte.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 font-medium">Nível {nc.run.analyte.level}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${nc.run.status === "REJECT" ? "bg-danger-50 text-danger-600" : "bg-warning-50 text-warning-600"}`}>
                      {nc.run.status}
                    </span>
                    {nc.resolvedAt && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-success-50 text-success-700 font-medium">Resolvida</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p><span className="font-medium">Equipamento:</span> {nc.run.equipment.name}</p>
                    <p><span className="font-medium">Valor:</span> <span className="font-mono">{nc.run.value}</span></p>
                    <p><span className="font-medium">Regras:</span> {nc.run.violations.join(", ") || "—"}</p>
                    <p><span className="font-medium">Descrição:</span> {nc.description}</p>
                    {nc.action && <p><span className="font-medium">Ação:</span> {nc.action}</p>}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400 shrink-0">
                  <p>{fmtDate(nc.run.runAt)}</p>
                  <p>{nc.run.user.name ?? "—"}</p>
                </div>
              </div>

              {!nc.resolvedAt && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[#1a1a1a]">
                  {resolving === nc.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Descreva a ação corretiva…"
                        value={actionText[nc.id] ?? ""}
                        onChange={(e) => setActionText((prev) => ({ ...prev, [nc.id]: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                      />
                      <button onClick={() => handleResolve(nc.id)} className="alchemy-gradient text-white px-4 py-2 rounded-lg text-sm font-semibold">
                        Confirmar
                      </button>
                      <button onClick={() => setResolving(null)} className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a]">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setResolving(nc.id)}
                      className="flex items-center gap-1.5 text-sm text-success-600 hover:text-success-700 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Marcar como resolvida
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
