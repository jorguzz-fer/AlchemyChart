"use client";

import { useState, useEffect, useCallback } from "react";

interface FamilyRow {
  family: string;
  n1: string | null;
  n2: string | null;
}

interface EquipRow extends FamilyRow {
  equipment: string;
}

interface SkippedRow {
  family: string;
  reason: string;
  materials: string[];
}

interface DetailRow {
  equipment: string;
  level: number;
  from: string;
  to: string;
  action: string;
  count: number;
}

interface Preview {
  families: FamilyRow[];
  equipments: EquipRow[];
  skipped: SkippedRow[];
  totals: { reassign: number; create: number; merge: number; runsAffected: number };
  details: DetailRow[];
}

interface Result {
  reassigned: number;
  created: number;
  merged: number;
  runsMoved: number;
}

const ACTION_STYLE: Record<string, string> = {
  reapontar: "bg-primary-50 text-primary-700",
  criar: "bg-success-50 text-success-700",
  unificar: "bg-warning-50 text-warning-700",
};

export default function RepairControlLevelsPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/repair-control-levels");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar a prévia");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalChanges = preview
    ? preview.totals.reassign + preview.totals.create + preview.totals.merge
    : 0;

  const apply = async () => {
    if (!preview) return;
    const ok = confirm(
      `Aplicar ${totalChanges} alteração(ões) de vínculo de controle?\n\n` +
        `• ${preview.totals.reassign} vínculo(s) reapontado(s) para o material do nível correto\n` +
        `• ${preview.totals.create} vínculo(s) criado(s) para níveis sem controle\n` +
        `• ${preview.totals.merge} vínculo(s) duplicado(s) unificado(s)\n\n` +
        `Nenhuma corrida é apagada.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/repair-control-levels", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data.result);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao aplicar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">
          Corrigir controle de cada nível
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Aponta cada nível para o frasco de controle certo — o material de número menor
          vira o Nível 1 e o maior o Nível 2.
        </p>
      </div>

      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl px-5 py-3 text-sm text-danger-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && (
        <div className="bg-success-50 border border-success-200 rounded-2xl p-5">
          <h3 className="font-bold text-success-800 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">task_alt</span>
            Correção concluída
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Vínculos reapontados", value: result.reassigned },
              { label: "Vínculos criados", value: result.created },
              { label: "Duplicados unificados", value: result.merged },
              { label: "Corridas remanejadas", value: result.runsMoved },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-2xl font-bold text-success-700">{m.value}</p>
                <p className="text-xs text-success-600">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          Carregando prévia…
        </div>
      ) : preview ? (
        <>
          {/* Pareamento deduzido */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
            <div className="bg-danger-600 px-5 py-3">
              <h3 className="text-white font-bold text-sm">Pareamento por equipamento</h3>
            </div>
            {preview.equipments.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">
                Nenhum equipamento com controle identificado.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                  <tr>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Equipamento</th>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Nível 1</th>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Nível 2</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.equipments.map((e) => (
                    <tr key={e.equipment} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                      <td className="px-5 py-2.5 font-semibold text-black dark:text-white">{e.equipment}</td>
                      <td className="px-5 py-2.5 text-gray-600 dark:text-gray-400">{e.n1 ?? "—"}</td>
                      <td className="px-5 py-2.5 text-gray-600 dark:text-gray-400">{e.n2 ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Famílias ignoradas */}
          {preview.skipped.length > 0 && (
            <div className="bg-warning-50 border border-warning-200 rounded-2xl p-5">
              <h3 className="font-bold text-warning-800 mb-2 text-sm">
                Não dá para deduzir o nível ({preview.skipped.length})
              </h3>
              <p className="text-xs text-warning-700 mb-3">
                Estes materiais ficam de fora da correção — nada é chutado.
              </p>
              <ul className="space-y-1.5 text-xs text-warning-800">
                {preview.skipped.map((s, i) => (
                  <li key={i}>
                    <strong>{s.materials.join(", ")}</strong> — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* O que vai mudar */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
            <div className="bg-danger-600 px-5 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">O que vai mudar</h3>
              <span className="text-white/70 text-xs">{totalChanges} alteração(ões)</span>
            </div>

            {totalChanges === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">
                Nada a corrigir — todos os níveis já apontam para o controle certo.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b border-gray-100 dark:border-[#1a1a1a]">
                  {[
                    { label: "Reapontar", value: preview.totals.reassign },
                    { label: "Criar", value: preview.totals.create },
                    { label: "Unificar", value: preview.totals.merge },
                    { label: "Corridas envolvidas", value: preview.totals.runsAffected },
                  ].map((m) => (
                    <div key={m.label}>
                      <p className="text-2xl font-bold text-black dark:text-white">{m.value}</p>
                      <p className="text-xs text-gray-500">{m.label}</p>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                      <tr>
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Equipamento</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Nível</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">De</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Para</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Ação</th>
                        <th className="text-right px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Analitos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.details.map((d, i) => (
                        <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                          <td className="px-5 py-2.5 font-medium text-black dark:text-white">{d.equipment}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600 dark:text-gray-400">N{d.level}</td>
                          <td className="px-3 py-2.5 text-gray-500">{d.from}</td>
                          <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 font-medium">{d.to}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                ACTION_STYLE[d.action] ?? "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {d.action}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right font-semibold text-black dark:text-white">{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between gap-4">
                  <p className="text-xs text-gray-500">
                    Nenhuma corrida é apagada — só passa a constar o controle certo em cada nível.
                  </p>
                  <button
                    onClick={apply}
                    disabled={busy}
                    className="bg-danger-600 hover:bg-danger-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${busy ? "animate-spin" : ""}`}>
                      {busy ? "progress_activity" : "build"}
                    </span>
                    {busy ? "Aplicando…" : "APLICAR CORREÇÃO"}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
