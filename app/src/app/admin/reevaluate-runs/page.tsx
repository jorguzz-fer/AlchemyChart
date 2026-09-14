"use client";

import { useState, useEffect, useCallback } from "react";

interface DetailRow {
  analyte: string;
  equipment: string;
  level: number;
  source: "manual" | "bula" | "calculada" | null;
  runs: number;
  changes: number;
  transitions: Record<string, number>;
}

interface Preview {
  totals: {
    analytes: number;
    runs: number;
    changes: number;
    bySource: Record<string, number>;
    transitions: Record<string, number>;
  };
  details: DetailRow[];
  semReferencia: { analyte: string; equipment: string; level: number; runs: number }[];
}

interface Result {
  updated: number;
  transitions: Record<string, number>;
  bySource: Record<string, number>;
}

const STATUS_LABEL: Record<string, string> = { OK: "OK", ALERT: "Alerta", REJECT: "Rejeitar" };
const STATUS_CLS: Record<string, string> = {
  OK: "bg-success-50 text-success-700",
  ALERT: "bg-warning-50 text-warning-700",
  REJECT: "bg-danger-50 text-danger-700",
};
const SOURCE_LABEL: Record<string, string> = {
  manual: "manual",
  bula: "bula",
  calculada: "calculada",
  nenhuma: "sem referência",
};

function Transition({ k, n }: { k: string; n: number }) {
  const [from, to] = k.split("→");
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`px-1.5 py-0.5 rounded-full font-bold ${STATUS_CLS[from] ?? "bg-gray-100 text-gray-600"}`}>
        {STATUS_LABEL[from] ?? from}
      </span>
      <span className="text-gray-400">→</span>
      <span className={`px-1.5 py-0.5 rounded-full font-bold ${STATUS_CLS[to] ?? "bg-gray-100 text-gray-600"}`}>
        {STATUS_LABEL[to] ?? to}
      </span>
      <span className="font-semibold text-black dark:text-white ml-1">{n}</span>
    </span>
  );
}

export default function ReevaluateRunsPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reevaluate-runs");
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

  const apply = async () => {
    if (!preview) return;
    const ok = confirm(
      `Reavaliar ${preview.totals.runs} corrida(s) contra o alvo atual?\n\n` +
        `${preview.totals.changes} corrida(s) vão mudar de status (OK / Alerta / Rejeitar).\n` +
        `Valor, data e autor de cada corrida NÃO são alterados.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reevaluate-runs", { method: "POST" });
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

  const transitionEntries = (t: Record<string, number>) =>
    Object.entries(t).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">
          Reavaliar corridas contra o alvo
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Refaz o veredito Westgard (OK / Alerta / Rejeitar) de todas as corridas usando o alvo
          atual de cada controle — alvo manual, senão a bula, senão a média calculada.
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
            Reavaliação concluída — {result.updated} corrida(s) atualizada(s)
          </h3>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {transitionEntries(result.transitions).map(([k, n]) => (
              <Transition key={k} k={k} n={n} />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          Avaliando todas as corridas… pode levar alguns segundos.
        </div>
      ) : preview ? (
        <>
          {/* Resumo */}
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
            <div className="bg-danger-600 px-5 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">O que vai mudar</h3>
              <span className="text-white/70 text-xs">
                {preview.totals.changes} de {preview.totals.runs} corridas
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b border-gray-100 dark:border-[#1a1a1a]">
              {[
                { label: "Controles avaliados", value: preview.totals.analytes },
                { label: "Corridas avaliadas", value: preview.totals.runs },
                { label: "Mudam de status", value: preview.totals.changes },
                { label: "Sem referência (pulados)", value: preview.totals.bySource.nenhuma ?? 0 },
              ].map((m) => (
                <div key={m.label}>
                  <p className="text-2xl font-bold text-black dark:text-white">{m.value}</p>
                  <p className="text-xs text-gray-500">{m.label}</p>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-b border-gray-100 dark:border-[#1a1a1a] flex flex-col md:flex-row md:items-start gap-4">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Alvo usado
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(preview.totals.bySource).map(([k, n]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-gray-50 dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-300"
                    >
                      {SOURCE_LABEL[k] ?? k}
                      <span className="font-bold text-black dark:text-white">{n}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Transições
                </p>
                {preview.totals.changes === 0 ? (
                  <p className="text-xs text-gray-400">Nenhuma.</p>
                ) : (
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {transitionEntries(preview.totals.transitions).map(([k, n]) => (
                      <Transition key={k} k={k} n={n} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {preview.totals.changes === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">
                Nada a reavaliar — todas as corridas já estão com o veredito do alvo atual.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                      <tr>
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Analito</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Equipamento</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Nível</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Alvo</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Corridas</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Mudam</th>
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Transições</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.details.map((d, i) => (
                        <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a] align-top">
                          <td className="px-5 py-2.5 font-medium text-black dark:text-white">{d.analyte}</td>
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{d.equipment}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600 dark:text-gray-400">N{d.level}</td>
                          <td className="px-3 py-2.5 text-gray-500">{d.source ? SOURCE_LABEL[d.source] : "—"}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">{d.runs}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-black dark:text-white">{d.changes}</td>
                          <td className="px-5 py-2.5">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {transitionEntries(d.transitions).map(([k, n]) => (
                                <Transition key={k} k={k} n={n} />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between gap-4">
                  <p className="text-xs text-gray-500">
                    Só o status muda. Valor, data e quem digitou ficam como estão.
                  </p>
                  <button
                    onClick={apply}
                    disabled={busy}
                    className="bg-danger-600 hover:bg-danger-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${busy ? "animate-spin" : ""}`}>
                      {busy ? "progress_activity" : "rule"}
                    </span>
                    {busy ? "Aplicando…" : "REAVALIAR CORRIDAS"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Sem referência */}
          {preview.semReferencia.length > 0 && (
            <div className="bg-warning-50 border border-warning-200 rounded-2xl p-5">
              <h3 className="font-bold text-warning-800 mb-2 text-sm">
                Sem alvo para avaliar ({preview.semReferencia.length})
              </h3>
              <p className="text-xs text-warning-700 mb-3">
                Estes controles não têm bula cadastrada, nem alvo manual, nem 20 corridas de
                preparo. Cadastre a bula em Materiais para eles entrarem na próxima rodada.
              </p>
              <ul className="space-y-1 text-xs text-warning-800">
                {preview.semReferencia.map((s, i) => (
                  <li key={i}>
                    <strong>{s.analyte}</strong> — {s.equipment} · N{s.level} · {s.runs} corrida(s)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
