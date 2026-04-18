"use client";

import Link from "next/link";
import { useState } from "react";

type KpiTone = "danger" | "warning" | "info" | "success";

interface KPI {
  label: string;
  value: number;
  icon: string;
  tone: KpiTone;
  href: string;
  linkLabel: string;
}

const KPIS: KPI[] = [
  {
    label: "Não conformidades",
    value: 0,
    icon: "error",
    tone: "danger",
    href: "/relatorios/nao-conformidades",
    linkLabel: "Ir para não conformidades",
  },
  {
    label: "Alertas em preparo",
    value: 0,
    icon: "warning",
    tone: "warning",
    href: "/relatorios/revisao-preparo",
    linkLabel: "Ir para alertas em preparo",
  },
  {
    label: "Controles com CV elevado",
    value: 1,
    icon: "trending_up",
    tone: "info",
    href: "/relatorios/controles-ativos",
    linkLabel: "Ir para relatórios do CV",
  },
  {
    label: "Analitos em observação",
    value: 2,
    icon: "visibility",
    tone: "success",
    href: "/analitos",
    linkLabel: "Ir para analitos em observação",
  },
];

interface Equipment {
  name: string;
  alertPct: number; // 0–100
  errorPct: number; // 0–100
  lastMaint?: string;
  nextMaint?: string;
  cvHighPct: number;
  cvHighCount: number;
  hasData: boolean;
}

const EQUIPAMENTOS: Equipment[] = [
  { name: "AU 480 (1)", alertPct: 92.5, errorPct: 7.5, cvHighPct: 1.0, cvHighCount: 23, hasData: true },
  { name: "AU 480 (2)", alertPct: 95.5, errorPct: 4.5, cvHighPct: 0.0, cvHighCount: 4, hasData: true },
  { name: "HEMATO 01", alertPct: 100, errorPct: 0, cvHighPct: 0.0, cvHighCount: 2, hasData: true },
  { name: "HEMATO 02", alertPct: 100, errorPct: 0, cvHighPct: 0.0, cvHighCount: 0, hasData: true },
  { name: "Immulite 2000", alertPct: 0, errorPct: 0, cvHighPct: 0.0, cvHighCount: 0, hasData: false },
];

const toneMap: Record<KpiTone, { bg: string; ring: string; text: string; border: string; gradient: string }> = {
  danger: {
    bg: "bg-danger-50",
    ring: "bg-danger-500",
    text: "text-danger-600",
    border: "border-danger-200",
    gradient: "from-danger-500 to-danger-400",
  },
  warning: {
    bg: "bg-warning-50",
    ring: "bg-warning-500",
    text: "text-warning-700",
    border: "border-warning-200",
    gradient: "from-warning-500 to-warning-400",
  },
  info: {
    bg: "bg-info-50",
    ring: "bg-info-500",
    text: "text-info-600",
    border: "border-info-200",
    gradient: "from-info-500 to-info-400",
  },
  success: {
    bg: "bg-success-50",
    ring: "bg-success-500",
    text: "text-success-700",
    border: "border-success-200",
    gradient: "from-success-500 to-success-400",
  },
};

export default function DashboardPage() {
  const [rowsPerPage] = useState(5);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl text-black dark:text-white font-bold mb-1">
            Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Visão geral do controle de qualidade interno dos seus equipamentos e analitos.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-[#141414] rounded-lg border border-gray-100 dark:border-[#1a1a1a] px-4 py-2">
          <span className="material-symbols-outlined text-primary-500 text-[20px]">
            calendar_today
          </span>
          <span className="text-sm font-semibold text-black dark:text-white">
            18/01/2026
          </span>
          <span className="material-symbols-outlined text-gray-400 text-[18px]">
            arrow_forward
          </span>
          <span className="text-sm font-semibold text-black dark:text-white">
            18/04/2026
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((k) => {
          const tones = toneMap[k.tone];
          return (
            <div
              key={k.label}
              className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden hover:shadow-lg transition-all group"
            >
              <div className={`h-1.5 bg-gradient-to-r ${tones.gradient}`} />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl ${tones.bg} flex items-center justify-center`}>
                    <span className={`material-symbols-outlined ${tones.text} text-[24px]`}>
                      {k.icon}
                    </span>
                  </div>
                  <span className="text-4xl font-bold text-black dark:text-white">
                    {k.value}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">
                  {k.label}
                </p>
                <Link
                  href={k.href}
                  className={`text-xs font-semibold ${tones.text} hover:underline flex items-center gap-1`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    arrow_forward
                  </span>
                  {k.linkLabel}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Equipment panel */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="alchemy-gradient-blue px-6 py-5 text-white flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg mb-0">
              Painel de Equipamentos
            </h3>
            <p className="text-white/80 text-sm mb-0">
              Revise os dados de seus equipamentos
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm">
            <span className="material-symbols-outlined text-[18px]">date_range</span>
            <span className="font-medium">Últimos 90 dias</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Equipamento
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Alertas / Erros
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Últ. manutenção
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Próx. manutenção
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  % CV elevado
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Pareto
                </th>
              </tr>
            </thead>
            <tbody>
              {EQUIPAMENTOS.slice(0, rowsPerPage).map((eq) => (
                <tr
                  key={eq.name}
                  className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/equipamentos/${encodeURIComponent(eq.name)}`}
                      className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[18px] text-gray-400">
                        info
                      </span>
                      {eq.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 min-w-[280px]">
                    {eq.hasData ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-warning-600">{eq.alertPct}%</span>
                          <span className="text-danger-500">{eq.errorPct}%</span>
                        </div>
                        <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-[#0c0b0b]">
                          <div
                            className="bg-warning-500"
                            style={{ width: `${eq.alertPct}%` }}
                          />
                          <div
                            className="bg-danger-500"
                            style={{ width: `${eq.errorPct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <div className="flex-1 h-2 bg-gray-100 dark:bg-[#0c0b0b] rounded-full" />
                        <span className="text-xs">Sem dados</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {eq.lastMaint ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {eq.nextMaint ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-sm font-semibold ${
                        eq.cvHighPct > 0 ? "text-danger-500" : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {eq.cvHighPct.toFixed(1)}%{" "}
                      {eq.cvHighCount > 0 && (
                        <span className="text-gray-400 font-normal">
                          ({eq.cvHighCount})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all"
                      aria-label="Abrir diagrama de Pareto"
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        bar_chart
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-6 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a]">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            Linhas por página
            <select className="px-2 py-1 rounded border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm">
              <option>5</option>
              <option>10</option>
              <option>25</option>
            </select>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>Exibindo 1–5 de 5 resultados</span>
            <div className="flex items-center gap-1">
              <button
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                disabled
              >
                <span className="material-symbols-outlined text-[18px]">first_page</span>
              </button>
              <button
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                disabled
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                disabled
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
              <button
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                disabled
              >
                <span className="material-symbols-outlined text-[18px]">last_page</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
