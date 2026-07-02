"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface DetailRow {
  exam: string;
  equipment: string;
  fromLevel: number;
  toLevel: number;
  runs: number;
  needsCreate: boolean;
}
interface Preview {
  misfiledLinks: number;
  runsAffected: number;
  analytesToCreate: number;
  details: DetailRow[];
}
interface RepairResult {
  runsRelinked: number;
  amsMoved: number;
  amsMerged: number;
  analytesCreated: number;
  statsRecomputed: number;
}

export default function RepairRunLevelsPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<RepairResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/repair-run-levels");
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Erro ao carregar prévia");
      else setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleRun = async () => {
    if (!preview) return;
    if (
      !confirm(
        `Corrigir o vínculo de nível de ${preview.runsAffected.toLocaleString("pt-BR")} corrida(s)?\n\n` +
          `As corridas serão movidas para o analito do nível correto. ` +
          `As estatísticas serão recalculadas por nível.\n\n` +
          `A ação é definitiva (mas pode rodar de novo com segurança).`
      )
    )
      return;
    setRunning(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/repair-run-levels", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Erro ao executar");
      else {
        setDone(data.result);
        await loadPreview();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    }
    setRunning(false);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] flex items-center justify-center text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Administração</p>
          <h1 className="text-xl font-bold text-black dark:text-white">Corrigir níveis das corridas importadas</h1>
        </div>
      </div>

      <div className="bg-info-50 dark:bg-info-900/10 border border-info-200 dark:border-info-900/40 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-info-500 text-[24px]">info</span>
          <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <p>
              A importação do QualiChart vinculou <strong>todas as corridas</strong> de um controle a um
              único analito, ignorando o nível — por isso N1 e N2 aparecem juntos numa coluna só no painel.
            </p>
            <p>
              Esta correção <strong>re-vincula</strong> cada corrida ao analito do nível correto (usando o
              nível já registrado no vínculo do material) e <strong>recalcula as estatísticas por nível</strong>.
              É <strong>idempotente</strong> — pode rodar quantas vezes quiser.
            </p>
            <p className="text-warning-600 dark:text-warning-400">
              Controles que ficarem com menos de 20 corridas por nível voltam para a fase de{" "}
              <strong>preparo</strong> até acumularem 20 — mas as estatísticas atuais (misturando níveis)
              estavam incorretas de qualquer forma.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-black dark:text-white">Prévia — o que será corrigido</h3>
          <button
            onClick={loadPreview}
            disabled={loading || running}
            title="Atualizar prévia"
            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] flex items-center justify-center transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            Carregando prévia...
          </div>
        ) : preview ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-[#141414] rounded-lg p-3 border border-warning-200">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Corridas afetadas</div>
                <div className="text-2xl font-bold text-warning-600">{preview.runsAffected.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white dark:bg-[#141414] rounded-lg p-3 border border-gray-200 dark:border-[#1a1a1a]">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Vínculos a corrigir</div>
                <div className="text-2xl font-bold text-gray-500">{preview.misfiledLinks.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white dark:bg-[#141414] rounded-lg p-3 border border-gray-200 dark:border-[#1a1a1a]">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Analitos a criar</div>
                <div className="text-2xl font-bold text-gray-500">{preview.analytesToCreate.toLocaleString("pt-BR")}</div>
              </div>
            </div>

            {preview.details.length > 0 && (
              <div className="overflow-x-auto border border-gray-100 dark:border-[#1a1a1a] rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Exame</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Equipamento</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Correção</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Corridas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.details.map((d, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                        <td className="px-3 py-2 font-medium text-black dark:text-white">{d.exam}</td>
                        <td className="px-3 py-2 text-gray-500">{d.equipment}</td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
                          → Nível {d.toLevel}
                          {d.needsCreate && <span className="ml-1 text-[10px] text-primary-500">(novo)</span>}
                        </td>
                        <td className="px-3 py-2 text-center font-semibold text-warning-600">{d.runs.toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.runsAffected === 0 && preview.misfiledLinks === 0 ? (
              <div className="flex items-center gap-2 text-success-700 bg-success-50 border border-success-200 rounded-lg px-4 py-3 text-sm font-semibold">
                <span className="material-symbols-outlined">check_circle</span>
                Nenhuma corrida mal-alocada — está tudo certo.
              </div>
            ) : (
              <button
                onClick={handleRun}
                disabled={running}
                className="px-6 py-3 rounded-xl bg-warning-600 hover:bg-warning-700 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {running ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                    Corrigindo…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">build</span>
                    Corrigir vínculos ({preview.runsAffected.toLocaleString("pt-BR")} corridas)
                  </>
                )}
              </button>
            )}
          </>
        ) : null}
      </div>

      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-sm text-danger-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {done && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-success-700 font-semibold">
            <span className="material-symbols-outlined">check_circle</span>
            Correção concluída
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Corridas re-vinculadas</div>
              <div className="text-2xl font-bold text-success-700">{done.runsRelinked.toLocaleString("pt-BR")}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Vínculos movidos</div>
              <div className="text-2xl font-bold text-gray-500">{done.amsMoved}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Analitos criados</div>
              <div className="text-2xl font-bold text-gray-500">{done.analytesCreated}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Estatísticas recalc.</div>
              <div className="text-2xl font-bold text-gray-500">{done.statsRecomputed}</div>
            </div>
          </div>
          <div className="pt-2">
            <Link
              href="/analitos/painel"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-primary-600 hover:bg-primary-50 transition-all"
            >
              Ver painel de controle →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
