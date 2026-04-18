"use client";

import LeveyJenningsChart from "@/components/LeveyJenningsChart";
import Link from "next/link";
import { useState } from "react";

/**
 * Painel de Controle (coração do sistema)
 * Mock: Leucócitos em HEMATO 01, Nível 1 + Nível 2
 */

interface Run {
  id: number;
  level1: number | null;
  level2: number | null;
  level3: number | null;
  alerts?: string[];
}

const RUNS_MOCK: Run[] = [
  { id: 21, level1: 8.19, level2: 28.36, level3: null },
  { id: 22, level1: 7.33, level2: 26.56, level3: null },
  { id: 23, level1: 7.22, level2: 26.71, level3: null },
];

const STATS = {
  usage: {
    l1: { mean: 7.54, sd: 2.0, cv: null, runs: null },
    l2: { mean: 25.29, sd: 3.0, cv: null, runs: null },
  },
  current: {
    l1: { mean: 7.651, sd: 0.474, cv: 6.2, runs: 22 },
    l2: { mean: 26.207, sd: 4.869, cv: 18.6, runs: 23 },
  },
};

// Levey-Jennings data — Nível 1
const LJ_VALUES_L1 = [
  7.4, 7.6, 7.8, 7.5, 7.7, 7.3, 7.9, 7.2, 7.6, 7.8,
  7.5, 7.7, 7.4, 8.1, 7.3, 7.5, 7.8, 7.6, 7.4, 8.19,
  7.33, 7.22,
];

export default function PainelControle() {
  const [chartScope, setChartScope] = useState<"ultimo" | "todos">("ultimo");
  const [lotScope, setLotScope] = useState<"em-uso" | "todos">("em-uso");
  const [condition, setCondition] = useState<"preparo" | "ativo">("ativo");
  const [observing, setObserving] = useState(false);
  const [newL1, setNewL1] = useState("");
  const [newL2, setNewL2] = useState("");

  return (
    <div className="space-y-6">
      {/* Preparo banner */}
      <div className="bg-info-50 dark:bg-info-900/20 border border-info-200 dark:border-info-800 rounded-xl p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-info-500 text-[22px]">info</span>
        <p className="text-sm text-info-800 dark:text-info-200 mb-0">
          Seus dados estão na fase <strong>em preparo</strong>. Após 20 entradas
          os controles podem ser ativados. Os testes das regras de Westgard
          ocorrem somente com os dados na fase de ativos.
        </p>
      </div>

      {/* Header with toggles */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/analitos"
              className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] flex items-center justify-center text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl text-black dark:text-white font-bold mb-0">
                Painel de Controle
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-0">
                01. Leucócitos — HEMATO 01
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={observing}
                onChange={(e) => setObserving(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              Analito em observação
            </label>

            <Toggle
              label="Valores no gráfico"
              optionA="Último"
              optionB="Todos"
              active={chartScope === "todos"}
              onToggle={(v) => setChartScope(v ? "todos" : "ultimo")}
            />
            <Toggle
              label="Visualizar lotes"
              optionA="Em uso"
              optionB="Todos"
              active={lotScope === "todos"}
              onToggle={(v) => setLotScope(v ? "todos" : "em-uso")}
            />
            <Toggle
              label="Condição do controle"
              optionA="Preparo"
              optionB="Ativo"
              active={condition === "ativo"}
              onToggle={(v) => setCondition(v ? "ativo" : "preparo")}
            />
          </div>
        </div>
      </div>

      {/* Grid: Corridas (esquerda) + Chart + Stats (direita) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Corridas table */}
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
          <div className="alchemy-gradient px-6 py-4 text-white">
            <h3 className="text-white font-bold text-base mb-0 flex items-center gap-2">
              <span className="material-symbols-outlined">table_rows</span>
              Corridas
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Editar</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-primary-500"></span>
                      Nível 1
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-info-500"></span>
                      Nível 2
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-gray-200"></span>
                      Nível 3
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Alertas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {RUNS_MOCK.map((run) => (
                  <tr
                    key={run.id}
                    className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                  >
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-semibold">{run.id}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-primary-50 hover:text-primary-500" aria-label="Editar">
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-danger-50 hover:text-danger-500" aria-label="Excluir">
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-primary-600 font-semibold">{run.level1?.toFixed(3) ?? "-"}</td>
                    <td className="px-4 py-3 text-info-600 font-semibold">{run.level2?.toFixed(2) ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-400">-</td>
                    <td className="px-4 py-3 text-gray-400">-</td>
                    <td className="px-4 py-3">
                      <button className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-info-50 hover:text-info-500" aria-label="Comentar">
                        <span className="material-symbols-outlined text-[16px]">sms</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Nova entrada */}
                <tr className="border-t border-gray-100 dark:border-[#1a1a1a] bg-primary-50/30 dark:bg-[#1a1a1a]/50">
                  <td className="px-4 py-3 text-gray-400 font-semibold">24</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newL1}
                      onChange={(e) => setNewL1(e.target.value)}
                      placeholder="0,000"
                      className="w-20 px-2 py-1 rounded border border-primary-200 bg-white dark:bg-[#141414] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newL2}
                      onChange={(e) => setNewL2(e.target.value)}
                      placeholder="0,00"
                      className="w-20 px-2 py-1 rounded border border-primary-200 bg-white dark:bg-[#141414] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                    />
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3">
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white alchemy-gradient hover:shadow-md transition-all">
                      <span className="material-symbols-outlined text-[14px]">save</span>
                      Salvar
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Levey-Jennings chart */}
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
          <div className="alchemy-gradient-gold px-6 py-4 text-white flex items-center justify-between">
            <h3 className="text-white font-bold text-base mb-0 flex items-center gap-2">
              <span className="material-symbols-outlined">monitoring</span>
              Levey-Jennings — Nível 1
            </h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-white/90">Exibir observações</span>
            </label>
          </div>
          <div className="p-4">
            <LeveyJenningsChart
              mean={STATS.current.l1.mean}
              sd={STATS.current.l1.sd}
              values={LJ_VALUES_L1}
              height={340}
            />
          </div>
        </div>
      </div>

      {/* Dados dos controles */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="alchemy-gradient px-6 py-4 text-white flex items-center gap-2">
          <span className="material-symbols-outlined">analytics</span>
          <h3 className="text-white font-bold text-base mb-0">Dados dos controles</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-32" />
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase" />
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Nível 1</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Nível 2</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Nível 3</th>
              </tr>
            </thead>
            <tbody>
              <StatsGroup
                group="Uso"
                rows={[
                  { label: "Média", l1: STATS.usage.l1.mean, l2: STATS.usage.l2.mean, l3: null },
                  { label: "Desvio padrão", l1: STATS.usage.l1.sd, l2: STATS.usage.l2.sd, l3: null },
                ]}
              />
              <StatsGroup
                group="Corrente"
                highlight
                rows={[
                  { label: "Média", l1: STATS.current.l1.mean, l2: STATS.current.l2.mean, l3: null },
                  { label: "Desvio padrão", l1: STATS.current.l1.sd, l2: STATS.current.l2.sd, l3: null },
                  {
                    label: "Coef. de Variação",
                    l1: STATS.current.l1.cv,
                    l2: STATS.current.l2.cv,
                    l3: null,
                    cvAlert: true,
                  },
                  { label: "Nº de corridas", l1: STATS.current.l1.runs, l2: STATS.current.l2.runs, l3: null },
                ]}
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  optionA,
  optionB,
  active,
  onToggle,
}: {
  label: string;
  optionA: string;
  optionB: string;
  active: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-2 text-sm">
        <span className={active ? "text-gray-400" : "text-black dark:text-white font-semibold"}>{optionA}</span>
        <button
          onClick={() => onToggle(!active)}
          className={`relative w-10 h-5 rounded-full transition-all ${
            active ? "bg-primary-500" : "bg-gray-300 dark:bg-[#1a1a1a]"
          }`}
          aria-label={label}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
              active ? "left-5" : "left-0.5"
            }`}
          />
        </button>
        <span className={active ? "text-black dark:text-white font-semibold" : "text-gray-400"}>{optionB}</span>
      </div>
    </div>
  );
}

function StatsGroup({
  group,
  rows,
  highlight,
}: {
  group: string;
  rows: { label: string; l1: number | null; l2: number | null; l3: number | null; cvAlert?: boolean }[];
  highlight?: boolean;
}) {
  const isCvHigh = (v: number | null) => v != null && v > 5;

  return (
    <>
      {rows.map((r, i) => (
        <tr
          key={`${group}-${r.label}`}
          className={`border-t border-gray-100 dark:border-[#1a1a1a] ${highlight ? "bg-primary-50/20 dark:bg-[#1a1a1a]/30" : ""}`}
        >
          {i === 0 && (
            <td
              rowSpan={rows.length}
              className="px-6 py-3 text-center font-bold text-primary-600 uppercase tracking-widest text-xs border-r border-gray-100 dark:border-[#1a1a1a] align-middle"
            >
              <div className="flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-primary-500 text-[20px]">
                  {group === "Uso" ? "inventory" : "bolt"}
                </span>
                {group}
              </div>
            </td>
          )}
          <td className="px-6 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.label}</td>
          <td
            className={`px-6 py-3 text-center font-semibold ${
              r.cvAlert && isCvHigh(r.l1)
                ? "bg-danger-100 text-danger-700 dark:bg-danger-900/30"
                : "text-black dark:text-white"
            }`}
          >
            {r.l1 != null ? (r.label === "Nº de corridas" ? r.l1 : r.l1.toFixed(3)) : "-"}
          </td>
          <td
            className={`px-6 py-3 text-center font-semibold ${
              r.cvAlert && isCvHigh(r.l2)
                ? "bg-danger-100 text-danger-700 dark:bg-danger-900/30"
                : "text-black dark:text-white"
            }`}
          >
            {r.l2 != null ? (r.label === "Nº de corridas" ? r.l2 : r.l2.toFixed(3)) : "-"}
          </td>
          <td className="px-6 py-3 text-center text-gray-400">
            {r.l3 != null ? r.l3.toFixed(3) : "-"}
          </td>
        </tr>
      ))}
    </>
  );
}
