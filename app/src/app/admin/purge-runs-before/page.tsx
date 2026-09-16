"use client";

import { useState, useEffect, useCallback } from "react";

interface Preview {
  before: string;
  totals: { runsToDelete: number; runsToKeep: number; nonConformities: number; analytes: number };
  oldest: string | null;
  newest: string | null;
  byEquipment: { equipment: string; runs: number; oldest: string; newest: string }[];
}

interface Result {
  before: string;
  runsDeleted: number;
  nonConformitiesDeleted: number;
  analytesAffected: number;
  statsRecomputed: number;
  statsRemoved: number;
}

const CONFIRM_WORD = "APAGAR";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function PurgeRunsBeforePage() {
  const [before, setBefore] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const qs = before ? `?before=${encodeURIComponent(before)}` : "";

  const load = useCallback(async () => {
    if (!before) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError(null);
    setConfirmText("");
    try {
      const res = await fetch(`/api/admin/purge-runs-before${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar a prévia");
    } finally {
      setLoading(false);
    }
  }, [before, qs]);

  useEffect(() => {
    load();
  }, [load]);

  const canApply = !!preview && preview.totals.runsToDelete > 0 && confirmText.trim() === CONFIRM_WORD && !busy;

  const apply = async () => {
    if (!preview || !canApply) return;
    const ok = confirm(
      `APAGAR EM DEFINITIVO ${preview.totals.runsToDelete} corrida(s) anteriores a ${fmtDate(preview.before)}?\n\n` +
        `Ficam ${preview.totals.runsToKeep} corrida(s) de ${fmtDate(preview.before)} em diante.\n` +
        `${preview.totals.nonConformities} não conformidade(s) ligada(s) a elas também somem.\n\n` +
        `Esta ação NÃO pode ser desfeita. Baixou o backup?`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/purge-runs-before${qs}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data.result);
      setPreview(null);
      setConfirmText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao apagar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">
            Apagar corridas anteriores a uma data
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Remove em definitivo todas as corridas lançadas antes da data escolhida. Materiais,
            analitos, equipamentos e auditoria não são tocados.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-gray-500 shrink-0">
          <span className="font-semibold uppercase tracking-wide">Apagar anteriores a</span>
          <input
            type="date"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            disabled={busy}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#141414] text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-danger-500/30"
          />
          <span className="text-[11px] text-gray-400">Corridas desta data em diante ficam</span>
        </label>
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
            Limpeza concluída — corridas anteriores a {fmtDate(result.before)} apagadas
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Corridas apagadas", value: result.runsDeleted },
              { label: "Não conformidades", value: result.nonConformitiesDeleted },
              { label: "Analitos afetados", value: result.analytesAffected },
              { label: "Médias recalculadas", value: result.statsRecomputed },
              { label: "Voltaram a Preparo", value: result.statsRemoved },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-2xl font-bold text-success-700">{m.value}</p>
                <p className="text-xs text-success-600">{m.label}</p>
              </div>
            ))}
          </div>
          {result.statsRemoved > 0 && (
            <p className="text-xs text-success-700 mt-3">
              {result.statsRemoved} controle(s) ficaram com menos de 20 corridas e voltaram ao rótulo
              &quot;Preparo&quot; até completar 20 de novo. A bula continua valendo como alvo — o
              Westgard não para por causa disso.
            </p>
          )}
        </div>
      )}

      {!before ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          Escolha a data acima para ver o que seria apagado.
        </div>
      ) : loading ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          Contando corridas…
        </div>
      ) : preview ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-danger-200 dark:border-danger-900 overflow-hidden">
          <div className="bg-danger-600 px-5 py-3 flex items-center justify-between">
            <h3 className="text-white font-bold text-sm">
              O que vai ser apagado
              <span className="font-normal text-white/70"> · anteriores a {fmtDate(preview.before)}</span>
            </h3>
            <span className="text-white/70 text-xs">
              {preview.totals.runsToDelete} somem · {preview.totals.runsToKeep} ficam
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b border-gray-100 dark:border-[#1a1a1a]">
            {[
              { label: "Corridas a apagar", value: preview.totals.runsToDelete, danger: true },
              { label: "Corridas que ficam", value: preview.totals.runsToKeep, danger: false },
              { label: "Não conformidades ligadas", value: preview.totals.nonConformities, danger: true },
              { label: "Analitos afetados", value: preview.totals.analytes, danger: false },
            ].map((m) => (
              <div key={m.label}>
                <p className={`text-2xl font-bold ${m.danger ? "text-danger-600" : "text-black dark:text-white"}`}>
                  {m.value}
                </p>
                <p className="text-xs text-gray-500">{m.label}</p>
              </div>
            ))}
          </div>

          {preview.totals.runsToDelete === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              Não há corridas anteriores a {fmtDate(preview.before)}. Nada a apagar.
            </p>
          ) : (
            <>
              <div className="px-5 py-3 text-xs text-gray-500 border-b border-gray-100 dark:border-[#1a1a1a]">
                Período das corridas a apagar: <strong>{fmtDate(preview.oldest)}</strong> a{" "}
                <strong>{fmtDate(preview.newest)}</strong>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                    <tr>
                      <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Equipamento</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Corridas</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">De</th>
                      <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Até</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.byEquipment.map((e) => (
                      <tr key={e.equipment} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                        <td className="px-5 py-2.5 font-medium text-black dark:text-white">{e.equipment}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-danger-600">{e.runs}</td>
                        <td className="px-3 py-2.5 text-gray-500">{fmtDate(e.oldest)}</td>
                        <td className="px-5 py-2.5 text-gray-500">{fmtDate(e.newest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Backup + confirmação. É a ação mais destrutiva do sistema: exige a
                  palavra digitada, e ainda o confirm() do navegador depois. */}
              <div className="px-5 py-4 bg-danger-50/40 dark:bg-danger-900/10 border-t border-danger-100 dark:border-danger-900 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <a
                    href={`/api/admin/purge-runs-before${qs}&format=csv`}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#141414] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    Baixar backup (CSV)
                  </a>
                  <p className="text-xs text-gray-500">
                    Planilha com todas as corridas que vão ser apagadas — valor, data, status e quem
                    digitou. Guarde antes de continuar.
                  </p>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    Digite <strong className="font-mono text-danger-700">{CONFIRM_WORD}</strong> para liberar:
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      disabled={busy}
                      placeholder={CONFIRM_WORD}
                      className="w-32 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#141414] text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-danger-500/30"
                    />
                  </label>
                  <button
                    onClick={apply}
                    disabled={!canApply}
                    className="md:ml-auto bg-danger-600 hover:bg-danger-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${busy ? "animate-spin" : ""}`}>
                      {busy ? "progress_activity" : "auto_delete"}
                    </span>
                    {busy ? "Apagando…" : `APAGAR ${preview.totals.runsToDelete} CORRIDAS`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
