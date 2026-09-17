"use client";

import { useState } from "react";

interface Preview {
  totals: {
    rows: number;
    toInsert: number;
    alreadyExists: number;
    unresolved: number;
    ambiguousCombos: number;
    analytes: number;
  };
  oldest: string | null;
  newest: string | null;
  byEquipment: { equipment: string; runs: number }[];
  unresolved: { analyte: string; equipment: string; level: number; reason: string; runs: number }[];
  missingUsers: { name: string; runs: number }[];
  invalid: { count: number; sample: { line: number; reason: string }[] };
}

interface Result {
  inserted: number;
  alreadyExists: number;
  unresolved: number;
  invalid: number;
  analytesAffected: number;
  statsRecomputed: number;
  usersFallback: number;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function RestoreRunsPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const call = async (text: string, apply: boolean) => {
    const res = await fetch("/api/admin/restore-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text, apply }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    return data;
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    setResult(null);
    setPreview(null);
    setCsv(null);
    setFileName(file?.name ?? null);
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      setCsv(text);
      setPreview(await call(text, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ler o arquivo");
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!csv || !preview || preview.totals.toInsert === 0) return;
    const ok = confirm(
      `Restaurar ${preview.totals.toInsert} corrida(s) de ${fmtDate(preview.oldest)} a ${fmtDate(preview.newest)}?\n\n` +
        (preview.totals.alreadyExists > 0 ? `${preview.totals.alreadyExists} já existem e serão puladas.\n` : "") +
        (preview.totals.unresolved > 0 ? `${preview.totals.unresolved} não têm mais analito/equipamento e ficam de fora.\n` : "")
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const data = await call(csv, true);
      setResult(data.result);
      // Nova prévia: deve mostrar tudo como "já existe"
      setPreview(await call(csv, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao restaurar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">
          Restaurar corridas de um backup
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Envie o CSV baixado em &quot;Apagar corridas anteriores a uma data&quot;. As corridas voltam
          com valor, data, status, observação e quem digitou. Enviar o mesmo arquivo duas vezes não
          duplica nada.
        </p>
      </div>

      <label className="flex flex-col md:flex-row md:items-center gap-3 bg-white dark:bg-[#141414] rounded-2xl border border-dashed border-gray-300 dark:border-[#2a2a2a] p-5 cursor-pointer hover:border-primary-400 transition-colors">
        <span className="material-symbols-outlined text-[32px] text-gray-400">upload_file</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-black dark:text-white">
            {fileName ?? "Escolher arquivo de backup (.csv)"}
          </p>
          <p className="text-xs text-gray-500">backup-corridas-antes-de-AAAA-MM-DD.csv</p>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy || loading}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>

      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl px-5 py-3 text-sm text-danger-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && (
        <div className="bg-success-50 border border-success-200 rounded-2xl p-5">
          <h3 className="font-bold text-success-800 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">task_alt</span>
            Restauração concluída
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Corridas restauradas", value: result.inserted },
              { label: "Analitos", value: result.analytesAffected },
              { label: "Médias de Uso recalculadas", value: result.statsRecomputed },
              { label: "Ficaram de fora", value: result.unresolved + result.invalid },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-2xl font-bold text-success-700">{m.value}</p>
                <p className="text-xs text-success-600">{m.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-success-700 mt-3">
            O status (OK / Alerta / Rejeitar) voltou como estava no backup. Para alinhar com o alvo
            atual, rode <strong>&quot;Reavaliar corridas contra o alvo&quot;</strong>.
          </p>
        </div>
      )}

      {loading && (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
          Lendo o arquivo e conferindo com o sistema…
        </div>
      )}

      {preview && !loading && (
        <>
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
            <div className="bg-danger-600 px-5 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">
                O que vai voltar
                <span className="font-normal text-white/70">
                  {" "}· {fmtDate(preview.oldest)} a {fmtDate(preview.newest)}
                </span>
              </h3>
              <span className="text-white/70 text-xs">{preview.totals.rows} linhas no arquivo</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b border-gray-100 dark:border-[#1a1a1a]">
              {[
                { label: "Corridas a restaurar", value: preview.totals.toInsert },
                { label: "Já existem (puladas)", value: preview.totals.alreadyExists },
                { label: "Sem analito/equipamento", value: preview.totals.unresolved },
                { label: "Linhas inválidas", value: preview.invalid.count },
              ].map((m) => (
                <div key={m.label}>
                  <p className="text-2xl font-bold text-black dark:text-white">{m.value}</p>
                  <p className="text-xs text-gray-500">{m.label}</p>
                </div>
              ))}
            </div>

            {preview.byEquipment.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                  <tr>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Equipamento</th>
                    <th className="text-right px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Corridas a restaurar</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.byEquipment.map((e) => (
                    <tr key={e.equipment} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                      <td className="px-5 py-2.5 font-medium text-black dark:text-white">{e.equipment}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-black dark:text-white">{e.runs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="px-5 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between gap-4">
              <p className="text-xs text-gray-500">
                {preview.totals.toInsert === 0
                  ? "Nada a restaurar — tudo o que está no arquivo já existe no sistema."
                  : "Não conformidades das corridas apagadas não estão no backup e não voltam."}
              </p>
              <button
                onClick={apply}
                disabled={busy || preview.totals.toInsert === 0}
                className="bg-success-600 hover:bg-success-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
              >
                <span className={`material-symbols-outlined text-[18px] ${busy ? "animate-spin" : ""}`}>
                  {busy ? "progress_activity" : "settings_backup_restore"}
                </span>
                {busy ? "Restaurando…" : `RESTAURAR ${preview.totals.toInsert} CORRIDAS`}
              </button>
            </div>
          </div>

          {(preview.unresolved.length > 0 || preview.missingUsers.length > 0 || preview.invalid.count > 0) && (
            <div className="bg-warning-50 border border-warning-200 rounded-2xl p-5 space-y-4 text-xs text-warning-800">
              {preview.unresolved.length > 0 && (
                <div>
                  <h3 className="font-bold text-sm mb-1">Ficam de fora — não há mais onde encaixar</h3>
                  <ul className="space-y-1">
                    {preview.unresolved.map((u, i) => (
                      <li key={i}>
                        <strong>{u.analyte}</strong> — {u.equipment} · N{u.level} · {u.runs} corrida(s): {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.missingUsers.length > 0 && (
                <div>
                  <h3 className="font-bold text-sm mb-1">Analistas que não existem mais no sistema</h3>
                  <p className="mb-1">As corridas deles voltam, mas registradas no seu nome:</p>
                  <ul className="space-y-1">
                    {preview.missingUsers.map((u, i) => (
                      <li key={i}>
                        <strong>{u.name}</strong> — {u.runs} corrida(s)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.invalid.count > 0 && (
                <div>
                  <h3 className="font-bold text-sm mb-1">Linhas que não deu para ler ({preview.invalid.count})</h3>
                  <ul className="space-y-1">
                    {preview.invalid.sample.map((v, i) => (
                      <li key={i}>
                        linha {v.line}: {v.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
