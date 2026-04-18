"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Analyte {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipmentId: string;
  equipment: { id: string; name: string };
}

interface Equipment {
  id: string;
  name: string;
}

interface RunRow {
  analyteId: string;
  name: string;
  unit: string | null;
  level: number;
  value: string;
  note: string;
  status: "idle" | "ok" | "alert" | "reject" | "error" | "saving";
  violations: string[];
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  idle: { label: "—", cls: "text-gray-400" },
  saving: { label: "Salvando…", cls: "text-gray-400 animate-pulse" },
  ok: { label: "OK", cls: "text-success-600 font-semibold" },
  alert: { label: "ALERTA", cls: "text-warning-600 font-semibold" },
  reject: { label: "REJEITAR", cls: "text-danger-600 font-semibold" },
  error: { label: "ERRO", cls: "text-danger-500 text-xs" },
};

function LancamentoInner() {
  const searchParams = useSearchParams();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [selectedEquipId, setSelectedEquipId] = useState<string>("");
  const [rows, setRows] = useState<RunRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/equipamentos")
      .then((r) => r.json())
      .then((list: Equipment[]) => {
        if (!Array.isArray(list)) return;
        setEquipments(list);
        const paramId = searchParams.get("equipment");
        const initial = paramId && list.find((e) => e.id === paramId) ? paramId : list[0]?.id ?? "";
        setSelectedEquipId(initial);
      })
      .catch(() => {});
  }, [searchParams]);

  const loadAnalytes = useCallback((equipId: string) => {
    if (!equipId) return;
    setSubmitted(false);
    fetch("/api/analitos")
      .then((r) => r.json())
      .then((list: Analyte[]) => {
        const filtered = list.filter((a) => a.equipmentId === equipId && (a as Analyte & { active?: boolean }).active !== false);
        setRows(
          filtered.map((a) => ({
            analyteId: a.id,
            name: a.name,
            unit: a.unit,
            level: a.level,
            value: "",
            note: "",
            status: "idle",
            violations: [],
          }))
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAnalytes(selectedEquipId);
  }, [selectedEquipId, loadAnalytes]);

  const updateRow = (idx: number, field: "value" | "note", val: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val, status: "idle" } : r)));
  };

  const handleSubmit = async () => {
    const toSave = rows.filter((r) => r.value.trim() !== "");
    if (toSave.length === 0) return;
    setSubmitting(true);

    setRows((prev) =>
      prev.map((r) => (r.value.trim() !== "" ? { ...r, status: "saving" } : r))
    );

    const results = await Promise.allSettled(
      toSave.map((r) =>
        fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analyteId: r.analyteId,
            value: parseFloat(r.value.replace(",", ".")),
            note: r.note || null,
          }),
        }).then((res) => res.json())
      )
    );

    setRows((prev) => {
      let saveIdx = 0;
      return prev.map((r) => {
        if (r.value.trim() === "") return r;
        const result = results[saveIdx++];
        if (result.status === "fulfilled") {
          const run = result.value;
          return {
            ...r,
            status: run.status?.toLowerCase() ?? "ok",
            violations: run.violations ?? [],
          };
        }
        return { ...r, status: "error" };
      });
    });

    setSubmitting(false);
    setSubmitted(true);
  };

  const hasValues = rows.some((r) => r.value.trim() !== "");
  const selectedEquip = equipments.find((e) => e.id === selectedEquipId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">
            Lançamento em Massa
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Lance corridas para todos os analitos de um equipamento de uma vez.
          </p>
        </div>

        <select
          value={selectedEquipId}
          onChange={(e) => setSelectedEquipId(e.target.value)}
          className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm font-medium text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-w-[220px]"
        >
          {equipments.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.name}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-gray-300 dark:text-gray-600 mb-3 block">
            inventory_2
          </span>
          <p className="text-gray-500">Nenhum analito encontrado para este equipamento.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
          <div className="alchemy-gradient px-6 py-4 text-white flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-base mb-0">
                {selectedEquip?.name ?? "Equipamento"}
              </h3>
              <p className="text-white/70 text-xs mb-0">{rows.length} analito(s)</p>
            </div>
            {submitted && (
              <span className="text-xs bg-white/20 rounded-full px-3 py-1">
                Lançamento concluído
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Analito
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">
                    Nível
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                    Valor
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Observação
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const st = STATUS_LABEL[row.status] ?? STATUS_LABEL.idle;
                  return (
                    <tr
                      key={row.analyteId}
                      className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50/50 dark:hover:bg-[#1a1a1a]/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-black dark:text-white">
                          {row.name}
                        </span>
                        {row.unit && (
                          <span className="ml-1 text-xs text-gray-400">({row.unit})</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 dark:bg-[#1a1a1a] text-primary-600 text-xs font-bold">
                          {row.level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={row.value}
                          onChange={(e) => updateRow(idx, "value", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const inputs = document.querySelectorAll<HTMLInputElement>("[data-value-input]");
                              const nextInput = inputs[idx + 1];
                              if (nextInput) nextInput.focus();
                            }
                          }}
                          data-value-input
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0b0b] text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          placeholder="Opcional…"
                          value={row.note}
                          onChange={(e) => updateRow(idx, "note", e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs ${st.cls}`}>{st.label}</span>
                        {row.violations.length > 0 && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {row.violations.join(", ")}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Use <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#2a2a2a] text-[10px]">Enter</kbd> para avançar entre os campos de valor.
            </p>
            <div className="flex items-center gap-3">
              {submitted && (
                <button
                  onClick={() => loadAnalytes(selectedEquipId)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-[#1a1a1a] rounded-lg hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-all"
                >
                  Novo lançamento
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting || !hasValues}
                className="alchemy-gradient text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    Salvando…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    Lançar corridas
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LancamentoEmMassaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando…</div>}>
      <LancamentoInner />
    </Suspense>
  );
}
