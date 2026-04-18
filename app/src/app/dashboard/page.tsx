"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

type KpiTone = "danger" | "warning" | "info" | "success";

interface DashboardData {
  kpis: {
    nonConformities: number;
    expiringMaterials: number;
    highCvCount: number;
    inObservation: number;
  };
  equipments: {
    id: string;
    name: string;
    alertPct: number;
    errorPct: number;
    lastMaint: string | null;
    nextMaint: string | null;
    cvHighPct: number;
    cvHighCount: number;
    hasData: boolean;
  }[];
}

const toneMap: Record<KpiTone, { bg: string; text: string; gradient: string }> = {
  danger: { bg: "bg-danger-50", text: "text-danger-600", gradient: "from-danger-500 to-danger-400" },
  warning: { bg: "bg-warning-50", text: "text-warning-700", gradient: "from-warning-500 to-warning-400" },
  info: { bg: "bg-info-50", text: "text-info-600", gradient: "from-info-500 to-info-400" },
  success: { bg: "bg-success-50", text: "text-success-700", gradient: "from-success-500 to-success-400" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const kpis = [
    { label: "Não conformidades", value: data?.kpis.nonConformities ?? 0, icon: "error", tone: "danger" as KpiTone, href: "/relatorios/nao-conformidades", linkLabel: "Ver não conformidades" },
    { label: "Materiais em preparo", value: data?.kpis.expiringMaterials ?? 0, icon: "warning", tone: "warning" as KpiTone, href: "/relatorios/revisao-material", linkLabel: "Ver materiais em preparo" },
    { label: "CV elevado", value: data?.kpis.highCvCount ?? 0, icon: "trending_up", tone: "info" as KpiTone, href: "/relatorios/controles-ativos", linkLabel: "Ver controles ativos" },
    { label: "Analitos em observação", value: data?.kpis.inObservation ?? 0, icon: "visibility", tone: "success" as KpiTone, href: "/analitos", linkLabel: "Ver analitos" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl text-black dark:text-white font-bold mb-1">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Visão geral do controle de qualidade interno dos seus equipamentos e analitos.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-[#141414] rounded-lg border border-gray-100 dark:border-[#1a1a1a] px-4 py-2">
          <span className="material-symbols-outlined text-primary-500 text-[20px]">calendar_today</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Últimos 90 dias</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const tones = toneMap[k.tone];
          return (
            <div key={k.label} className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden hover:shadow-lg transition-all">
              <div className={`h-1.5 bg-gradient-to-r ${tones.gradient}`} />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl ${tones.bg} flex items-center justify-center`}>
                    <span className={`material-symbols-outlined ${tones.text} text-[24px]`}>{k.icon}</span>
                  </div>
                  {loading ? (
                    <div className="w-10 h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" />
                  ) : (
                    <span className="text-4xl font-bold text-black dark:text-white">{k.value}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">{k.label}</p>
                <Link href={k.href} className={`text-xs font-semibold ${tones.text} hover:underline flex items-center gap-1`}>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  {k.linkLabel}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Equipment panel */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="alchemy-gradient px-6 py-5 text-white flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg mb-0">Painel de Equipamentos</h3>
            <p className="text-white/80 text-sm mb-0">Revise os dados de seus equipamentos</p>
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
                {["Equipamento", "Alertas / Erros", "Últ. manutenção", "Próx. manutenção", "% CV elevado", "Pareto"].map((h, i) => (
                  <th key={h} className={`px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider ${i === 5 ? "text-center" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-[#1a1a1a]">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 rounded bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (data?.equipments ?? []).map((eq) => (
                <tr key={eq.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all">
                  <td className="px-6 py-4">
                    <Link href={`/equipamentos/lancamento?equipment=${eq.id}`} className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-semibold text-sm">
                      <span className="material-symbols-outlined text-[18px] text-gray-400">settings_applications</span>
                      {eq.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 min-w-[240px]">
                    {eq.hasData ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-warning-600">{eq.alertPct}%</span>
                          <span className="text-danger-500">{eq.errorPct}%</span>
                        </div>
                        <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-[#0c0b0b]">
                          <div className="bg-warning-500" style={{ width: `${eq.alertPct}%` }} />
                          <div className="bg-danger-500" style={{ width: `${eq.errorPct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <div className="flex-1 h-2 bg-gray-100 dark:bg-[#0c0b0b] rounded-full" />
                        <span className="text-xs">Sem dados</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{fmtDate(eq.lastMaint)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{fmtDate(eq.nextMaint)}</td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-semibold ${eq.cvHighPct > 0 ? "text-danger-500" : "text-gray-500 dark:text-gray-400"}`}>
                      {eq.cvHighPct.toFixed(1)}%{" "}
                      {eq.cvHighCount > 0 && <span className="text-gray-400 font-normal">({eq.cvHighCount})</span>}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all" aria-label="Diagrama de Pareto">
                      <span className="material-symbols-outlined text-[22px]">bar_chart</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
