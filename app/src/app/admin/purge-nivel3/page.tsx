"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Counts {
  analytes: number;
  analyteMaterials: number;
  runs: number;
  statPeriods: number;
}

const ZERO: Counts = { analytes: 0, analyteMaterials: 0, runs: 0, statPeriods: 0 };

export default function PurgeNivel3Page() {
  const [preview, setPreview] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/purge-nivel3");
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

  const total = preview
    ? preview.analytes + preview.analyteMaterials + preview.runs + preview.statPeriods
    : 0;

  const handleDelete = async () => {
    if (!preview) return;
    if (
      !confirm(
        `Excluir DEFINITIVAMENTE todos os registros de nível 3?\n\n` +
          `• ${preview.analytes} analito(s)\n` +
          `• ${preview.analyteMaterials} vínculo(s)/controle(s)\n` +
          `• ${preview.runs} corrida(s)\n` +
          `• ${preview.statPeriods} estatística(s)\n\n` +
          `Esta ação é IRREVERSÍVEL.`
      )
    )
      return;

    setRunning(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/purge-nivel3", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao excluir");
      } else {
        setDone(data.deleted ?? ZERO);
        setPreview(ZERO);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    }
    setRunning(false);
  };

  const Stat = ({ label, value, tone }: { label: string; value: number; tone: "danger" | "gray" }) => (
    <div
      className={`bg-white dark:bg-[#141414] rounded-lg p-3 border ${
        tone === "danger" ? "border-danger-200" : "border-gray-200 dark:border-[#1a1a1a]"
      }`}
    >
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-2xl font-bold ${tone === "danger" ? "text-danger-600" : "text-gray-500"}`}>
        {value.toLocaleString("pt-BR")}
      </div>
    </div>
  );

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
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Administração
          </p>
          <h1 className="text-xl font-bold text-black dark:text-white">Excluir registros de nível 3</h1>
        </div>
      </div>

      {/* Aviso */}
      <div className="bg-danger-50 dark:bg-danger-900/10 border border-danger-200 dark:border-danger-900/40 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-danger-500 text-[24px]">warning</span>
          <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <p>
              Esta ferramenta remove <strong>permanentemente</strong> todos os controles, vínculos,
              corridas e estatísticas de <strong>nível 3</strong> da sua unidade.
            </p>
            <p>
              Use apenas se o laboratório <strong>nunca utilizou o nível 3</strong>. A ação é{" "}
              <strong>irreversível</strong> — confira a prévia abaixo antes de confirmar.
            </p>
          </div>
        </div>
      </div>

      {/* Prévia */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-black dark:text-white">
            Prévia — o que será excluído
          </h3>
          <button
            onClick={loadPreview}
            disabled={loading || running}
            title="Atualizar prévia"
            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] flex items-center justify-center transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>
              refresh
            </span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            Carregando prévia...
          </div>
        ) : preview ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Analitos" value={preview.analytes} tone="danger" />
              <Stat label="Vínculos/Controles" value={preview.analyteMaterials} tone="danger" />
              <Stat label="Corridas" value={preview.runs} tone="danger" />
              <Stat label="Estatísticas" value={preview.statPeriods} tone="gray" />
            </div>

            {total === 0 ? (
              <div className="flex items-center gap-2 text-success-700 bg-success-50 border border-success-200 rounded-lg px-4 py-3 text-sm font-semibold">
                <span className="material-symbols-outlined">check_circle</span>
                Nenhum registro de nível 3 encontrado — nada a excluir.
              </div>
            ) : (
              <button
                onClick={handleDelete}
                disabled={running}
                className="px-6 py-3 rounded-xl bg-danger-600 hover:bg-danger-700 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {running ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[20px]">
                      progress_activity
                    </span>
                    Excluindo...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">delete_forever</span>
                    Excluir nível 3 ({total.toLocaleString("pt-BR")} registros)
                  </>
                )}
              </button>
            )}
          </>
        ) : null}
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-sm text-danger-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* Resultado */}
      {done && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-success-700 font-semibold">
            <span className="material-symbols-outlined">check_circle</span>
            Exclusão concluída
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Analitos" value={done.analytes} tone="gray" />
            <Stat label="Vínculos/Controles" value={done.analyteMaterials} tone="gray" />
            <Stat label="Corridas" value={done.runs} tone="gray" />
            <Stat label="Estatísticas" value={done.statPeriods} tone="gray" />
          </div>
          <div className="pt-2 flex gap-3">
            <Link
              href="/equipamentos/lancamento"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-primary-600 hover:bg-primary-50 transition-all"
            >
              Ver painel de lançamento →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
