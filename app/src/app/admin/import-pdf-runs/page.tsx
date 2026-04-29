"use client";

import { useState } from "react";
import Link from "next/link";

interface ImportSummary {
  analytesProcessed: number;
  equipmentsCreated: number;
  materialsCreated: number;
  analyteMaterialsCreated: number;
  runsCreated: number;
  runsSkipped: number;
  skippedRows: string[];
}

interface ImportResult {
  ok: boolean;
  summary: ImportSummary;
  source: { generatedAt: string; analytes: number };
}

export default function ImportPdfRunsPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (
      !confirm(
        "Importar corridas dos relatórios PDF? Operação idempotente — não duplica corridas já existentes."
      )
    )
      return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-pdf-runs", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao importar");
      } else {
        setResult(data);
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
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Administração
          </p>
          <h1 className="text-xl font-bold text-black dark:text-white">
            Importar corridas dos relatórios PDF
          </h1>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5 space-y-3">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-info-500 text-[24px]">info</span>
          <div className="flex-1 text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p>
              Esta operação importa as <strong>285 corridas históricas</strong> dos{" "}
              <strong>27 analitos</strong> do equipamento <strong>AU 480 (1)</strong>{" "}
              extraídas dos relatórios <em>REVISÃO EM PREPARO</em> do QualiChart.
            </p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>Materiais Soro Canino com lotes VCB 147, VCB 148 (e VCB145 para alguns analitos)</li>
              <li>Período: 28/01/2026 à 28/04/2026</li>
              <li>Valores por nível (N1/N2) com data e número CA</li>
            </ul>
            <p className="pt-1">
              <strong>Idempotente:</strong> pode rodar várias vezes. Corridas já existentes
              (mesmo analito + material + data + valor) são ignoradas.
            </p>
            <p className="text-warning-600 dark:text-warning-400">
              <strong>Pré-requisito:</strong> executar <em>Importar dados QualiChart</em>{" "}
              antes para garantir que os analitos existam.
            </p>
          </div>
        </div>
      </div>

      {/* Trigger */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5">
        <button
          onClick={handleRun}
          disabled={running}
          className="px-6 py-3 rounded-xl alchemy-gradient text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {running ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[20px]">
                progress_activity
              </span>
              Importando…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
              Executar importação
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-sm text-danger-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-success-700 font-semibold">
            <span className="material-symbols-outlined">check_circle</span>
            Importação concluída
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                Corridas importadas
              </div>
              <div className="text-2xl font-bold text-success-700">
                {result.summary.runsCreated}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                Corridas ignoradas
              </div>
              <div className="text-2xl font-bold text-gray-500">
                {result.summary.runsSkipped}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                Vínculos criados
              </div>
              <div className="text-2xl font-bold text-success-700">
                {result.summary.analyteMaterialsCreated}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                Materiais (lotes) criados
              </div>
              <div className="text-2xl font-bold text-success-700">
                {result.summary.materialsCreated}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                Analitos processados
              </div>
              <div className="text-2xl font-bold text-gray-500">
                {result.summary.analytesProcessed}
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 pt-2 border-t border-success-200">
            Arquivo gerado em{" "}
            {new Date(result.source.generatedAt).toLocaleString("pt-BR")} —{" "}
            {result.source.analytes} analitos
          </div>

          {result.summary.skippedRows.length > 0 && (
            <div className="pt-2 border-t border-success-200">
              <div className="text-xs font-semibold text-warning-600 mb-1">
                {result.summary.skippedRows.length} aviso(s):
              </div>
              <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                {result.summary.skippedRows.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-3 flex gap-3">
            <Link
              href="/analitos"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-primary-600 hover:bg-primary-50 transition-all"
            >
              Ver analitos →
            </Link>
            <Link
              href="/equipamentos/lancamento"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-primary-600 hover:bg-primary-50 transition-all"
            >
              Painel de lançamento →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
