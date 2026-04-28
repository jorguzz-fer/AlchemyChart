"use client";

import { useState } from "react";
import Link from "next/link";

interface ImportSummary {
  analytesUpdated: number;
  analytesCreatedDuringMaterials: number;
  equipmentsCreated: number;
  materialsCreated: number;
  analyteMaterialsCreated: number;
  analyteMaterialsExisting: number;
  legacyCleaned: number;
  legacyPreserved: number;
  skippedRows: string[];
}

interface ImportResult {
  ok: boolean;
  summary: ImportSummary;
  seed: { analytes: number; materials: number; generatedAt: string };
}

export default function ImportQualichartPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!confirm("Importar dados da QualiChart? A operação é idempotente — não duplica registros existentes, apenas atualiza ou cria os faltantes.")) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-qualichart", { method: "POST" });
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
            Importar dados da QualiChart
          </h1>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-5 space-y-3">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-info-500 text-[24px]">info</span>
          <div className="flex-1 text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p>
              Esta operação importa os <strong>46 analitos</strong> e <strong>133 vínculos de materiais</strong>{" "}
              do arquivo <code className="text-xs bg-gray-100 dark:bg-[#1a1a1a] px-1 py-0.5 rounded">qualichart_analitos_estruturado.xlsx</code>{" "}
              para a sua unidade. Isso inclui:
            </p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>Casas decimais, imprecisão máxima e origem por analito</li>
              <li>Configuração das 8 regras de Westgard (Alertar/Rejeitar)</li>
              <li>Vínculos com 4 equipamentos (HEMATO 01/02, AU 480 (1)/(2)) e 3 materiais (Hemato Canino 90135/90136, Soro Canino)</li>
              <li>Nível e situação de cada vínculo</li>
            </ul>
            <p className="pt-1">
              <strong>Idempotente:</strong> pode rodar várias vezes. Atualiza analitos existentes
              (sincroniza regras Westgard, casas decimais e imprecisão), cria os faltantes,
              e não duplica vínculos já existentes.
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
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              Importando…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
              Executar importação
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-sm text-danger-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-success-700 font-semibold">
            <span className="material-symbols-outlined">check_circle</span>
            Importação concluída
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Analitos atualizados</div>
              <div className="text-2xl font-bold text-success-700">{result.summary.analytesUpdated}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Analitos criados</div>
              <div className="text-2xl font-bold text-success-700">{result.summary.analytesCreatedDuringMaterials}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Equipamentos criados</div>
              <div className="text-2xl font-bold text-success-700">{result.summary.equipmentsCreated}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Materiais criados</div>
              <div className="text-2xl font-bold text-success-700">{result.summary.materialsCreated}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Vínculos novos</div>
              <div className="text-2xl font-bold text-success-700">{result.summary.analyteMaterialsCreated}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Vínculos já existentes</div>
              <div className="text-2xl font-bold text-gray-500">{result.summary.analyteMaterialsExisting}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Legados removidos</div>
              <div className="text-2xl font-bold text-warning-700">{result.summary.legacyCleaned}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-success-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Legados preservados</div>
              <div className="text-2xl font-bold text-gray-500" title="Vínculos não previstos no seed mas com corridas — preservados pra não perder histórico">
                {result.summary.legacyPreserved}
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 pt-2 border-t border-success-200">
            Seed: {result.seed.analytes} analitos × {result.seed.materials} vínculos —
            gerado em {new Date(result.seed.generatedAt).toLocaleString("pt-BR")}
          </div>

          {result.summary.skippedRows.length > 0 && (
            <div className="pt-2 border-t border-success-200">
              <div className="text-xs font-semibold text-warning-600 mb-1">
                {result.summary.skippedRows.length} linha(s) ignorada(s):
              </div>
              <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                {result.summary.skippedRows.map((s, i) => <li key={i}>{s}</li>)}
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
              Lançar corridas →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
