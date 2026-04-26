"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

interface SidebarMenuProps {
  toggleActive: () => void;
}

interface AnalyteItem {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipment: { id: string; name: string };
  _count: { stats: number };
}

interface AnalyteNameGroup {
  name: string;
  unit: string | null;
  equipments: { id: string; name: string; hasAtivo: boolean; hasPreparo: boolean }[];
}

interface EquipmentItem {
  id: string;
  name: string;
}

const RELATORIOS = [
  { label: "Controles Ativos", href: "/relatorios/controles-ativos" },
  { label: "Revisão em preparo (Material)", href: "/relatorios/revisao-material" },
  { label: "Revisão em preparo (Data)", href: "/relatorios/revisao-data" },
  { label: "Equipamentos/Analitos", href: "/relatorios/equipamentos-analitos" },
  { label: "Não Conformidades", href: "/relatorios/nao-conformidades" },
  { label: "Intervenção em Equipamentos", href: "/relatorios/intervencoes" },
  { label: "Relatório de Incertezas", href: "/relatorios/incertezas" },
];

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mx-3 mb-2">
      <input
        type="text"
        placeholder="Pesquisar..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-3 pr-8 py-1.5 text-xs rounded-md border border-gray-200 dark:border-[#2a2a2a] bg-gray-50 dark:bg-[#0c0b0b] text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary-400"
      />
      <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]">
        search
      </span>
    </div>
  );
}

const SidebarMenu: React.FC<SidebarMenuProps> = () => {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [analyteGroups, setAnalyteGroups] = useState<AnalyteNameGroup[]>([]);
  const [expandedAnalyteNames, setExpandedAnalyteNames] = useState<Set<string>>(new Set());
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [analyteSearch, setAnalyteSearch] = useState("");
  const [equipSearch, setEquipSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/analitos").then((r) => r.json()).catch(() => []),
      fetch("/api/equipamentos").then((r) => r.json()).catch(() => []),
    ]).then(([anal, eq]) => {
      if (Array.isArray(anal)) {
        // Group analytes by name → equipment
        const nameMap = new Map<string, AnalyteNameGroup>();
        for (const a of anal as AnalyteItem[]) {
          const key = `${a.name}||${a.unit ?? ""}`;
          if (!nameMap.has(key)) nameMap.set(key, { name: a.name, unit: a.unit, equipments: [] });
          const g = nameMap.get(key)!;
          let eg = g.equipments.find((e) => e.id === a.equipment.id);
          if (!eg) {
            eg = { id: a.equipment.id, name: a.equipment.name, hasAtivo: false, hasPreparo: false };
            g.equipments.push(eg);
          }
          if (a._count.stats > 0) eg.hasAtivo = true;
          else eg.hasPreparo = true;
        }
        setAnalyteGroups(
          Array.from(nameMap.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        );
      }
      if (Array.isArray(eq)) setEquipments(eq);
    });
  }, []);

  const toggleMenu = (label: string) =>
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));

  const toggleAnalyteName = (key: string) =>
    setExpandedAnalyteNames((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const filteredGroups = analyteGroups.filter((g) =>
    g.name.toLowerCase().includes(analyteSearch.toLowerCase()) ||
    g.equipments.some((e) => e.name.toLowerCase().includes(analyteSearch.toLowerCase()))
  );
  const filteredEquipments = equipments.filter((e) =>
    e.name.toLowerCase().includes(equipSearch.toLowerCase())
  );
  const filteredAudit = equipments.filter((e) =>
    e.name.toLowerCase().includes(auditSearch.toLowerCase())
  );

  const subLinkClass = (href: string) =>
    `block px-3 py-1.5 text-xs rounded-md transition-all ${
      isActive(href)
        ? "text-primary-600 font-semibold bg-primary-50 dark:bg-[#1a1a1a]"
        : "text-gray-600 dark:text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
    }`;

  const sectionBtnClass = (key: string) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
      openMenus[key]
        ? "bg-primary-50 text-primary-700 dark:bg-[#1a1a1a] dark:text-primary-400"
        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
    }`;

  return (
    <aside
      className="sidebar-area bg-white dark:bg-[#0c0b0b] fixed z-10 top-0 h-screen transition-all overflow-y-auto border-r border-gray-100 dark:border-[#1a1a1a]"
      style={{ boxShadow: "0 0 20px rgba(109, 58, 140, 0.08)" }}
    >
      {/* Brand */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-[#1a1a1a] sticky top-0 bg-white dark:bg-[#0c0b0b] z-10">
        <Link href="/dashboard">
          <Image
            src="/images/control-chat-logo-collor220x55.png"
            alt="Alchemy Control Chart"
            width={220}
            height={55}
            className="w-auto"
            unoptimized
            priority
          />
        </Link>
      </div>

      {/* Quick tabs */}
      <div className="grid grid-cols-3 gap-2 px-4 py-4 border-b border-gray-100 dark:border-[#1a1a1a]">
        {[
          { label: "Analitos", icon: "biotech", href: "/analitos" },
          { label: "Equipam.", icon: "settings_applications", href: "/equipamentos" },
          { label: "Materiais", icon: "science", href: "/materiais" },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-[#1a1a1a] transition-all group"
          >
            <span className="material-symbols-outlined text-gray-500 group-hover:text-primary-500 transition-all">
              {item.icon}
            </span>
            <span className="text-[11px] text-gray-600 dark:text-gray-400 group-hover:text-primary-500 font-medium">
              {item.label}
            </span>
          </Link>
        ))}
      </div>

      {/* Nav */}
      <nav className="px-3 py-4">
        <ul className="space-y-1">

          {/* Dashboard */}
          <li>
            <Link
              href="/dashboard"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                isActive("/dashboard")
                  ? "alchemy-gradient text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">dashboard</span>
              <span className="text-sm font-medium">Dashboard</span>
            </Link>
          </li>

          {/* Por Analitos — árvore nome → equipamento */}
          <li>
            <button onClick={() => toggleMenu("analitos")} className={sectionBtnClass("analitos")}>
              <span className="material-symbols-outlined text-[20px]">biotech</span>
              <span className="flex-1 text-sm font-medium">por Analitos</span>
              <span className={`material-symbols-outlined text-[18px] transition-transform ${openMenus["analitos"] ? "rotate-180" : ""}`}>
                expand_more
              </span>
            </button>
            {openMenus["analitos"] && (
              <div className="mt-1">
                <SearchInput value={analyteSearch} onChange={setAnalyteSearch} />
                <div className="max-h-72 overflow-y-auto">
                  {filteredGroups.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</p>
                  )}
                  {filteredGroups.map((g, gi) => {
                    const nameKey = `${g.name}||${g.unit ?? ""}`;
                    const isExpanded = expandedAnalyteNames.has(nameKey);
                    return (
                      <div key={nameKey}>
                        <button
                          onClick={() => toggleAnalyteName(nameKey)}
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all rounded-md"
                        >
                          <span className="text-[10px] font-bold text-gray-400 w-5 shrink-0">
                            {String(gi + 1).padStart(2, "0")}.
                          </span>
                          <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                            {g.name}
                            {g.unit && <span className="text-gray-400 ml-1">({g.unit})</span>}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">{g.equipments.length}</span>
                          <span className={`material-symbols-outlined text-[14px] text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                            expand_more
                          </span>
                        </button>
                        {isExpanded && g.equipments.map((eq) => {
                          const href = `/analitos/painel?name=${encodeURIComponent(g.name)}&eq=${eq.id}`;
                          const active = isActive("/analitos/painel") && pathname.includes("painel");
                          return (
                            <Link
                              key={eq.id}
                              href={href}
                              className={`flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-md transition-all ${
                                active && typeof window !== "undefined" && window.location.search.includes(`eq=${eq.id}`)
                                  ? "text-primary-600 font-semibold bg-primary-50 dark:bg-[#1a1a1a]"
                                  : "text-gray-500 dark:text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[13px]">precision_manufacturing</span>
                              <span className="flex-1 text-xs truncate">{eq.name}</span>
                              <div className="flex gap-0.5 shrink-0">
                                {eq.hasAtivo && <span className="w-1.5 h-1.5 rounded-full bg-success-500" title="Ativo" />}
                                {eq.hasPreparo && <span className="w-1.5 h-1.5 rounded-full bg-warning-400" title="Preparo" />}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 px-1 space-y-0.5 border-t border-gray-100 dark:border-[#1a1a1a] pt-1">
                  <Link href="/analitos/painel" className={subLinkClass("/analitos/painel")}>
                    Painel de Controle
                  </Link>
                  <Link href="/analitos" className={subLinkClass("/analitos")}>
                    Lista de Analitos
                  </Link>
                </div>
              </div>
            )}
          </li>

          {/* Por Equipamentos — dynamic */}
          <li>
            <button onClick={() => toggleMenu("equipamentos")} className={sectionBtnClass("equipamentos")}>
              <span className="material-symbols-outlined text-[20px]">settings_applications</span>
              <span className="flex-1 text-sm font-medium">por Equipamentos</span>
              <span className={`material-symbols-outlined text-[18px] transition-transform ${openMenus["equipamentos"] ? "rotate-180" : ""}`}>
                expand_more
              </span>
            </button>
            {openMenus["equipamentos"] && (
              <div className="mt-1">
                <SearchInput value={equipSearch} onChange={setEquipSearch} />
                <ul className="max-h-56 overflow-y-auto space-y-0.5 px-1">
                  {filteredEquipments.length === 0 && (
                    <li className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</li>
                  )}
                  {filteredEquipments.map((e) => (
                    <li key={e.id}>
                      <Link href={`/equipamentos/lancamento?equipment=${e.id}`} className={subLinkClass(`/equipamentos/lancamento?equipment=${e.id}`)}>
                        {e.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 px-1">
                  <Link href="/equipamentos" className={subLinkClass("/equipamentos")}>
                    Lista de Equipamentos
                  </Link>
                </div>
              </div>
            )}
          </li>

          {/* Materiais */}
          <li>
            <Link
              href="/materiais"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                isActive("/materiais")
                  ? "alchemy-gradient text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">science</span>
              <span className="text-sm font-medium">Materiais</span>
            </Link>
          </li>

          {/* Auditoria — dynamic */}
          <li>
            <button onClick={() => toggleMenu("auditoria")} className={sectionBtnClass("auditoria")}>
              <span className="material-symbols-outlined text-[20px]">fact_check</span>
              <span className="flex-1 text-sm font-medium">Auditoria</span>
              <span className={`material-symbols-outlined text-[18px] transition-transform ${openMenus["auditoria"] ? "rotate-180" : ""}`}>
                expand_more
              </span>
            </button>
            {openMenus["auditoria"] && (
              <div className="mt-1">
                <SearchInput value={auditSearch} onChange={setAuditSearch} />
                <ul className="max-h-48 overflow-y-auto space-y-0.5 px-1">
                  {filteredAudit.length === 0 && (
                    <li className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</li>
                  )}
                  {filteredAudit.map((e) => (
                    <li key={e.id}>
                      <Link href={`/auditoria?equipment=${e.id}`} className={subLinkClass(`/auditoria?equipment=${e.id}`)}>
                        {e.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>

          {/* Relatórios */}
          <li>
            <button onClick={() => toggleMenu("relatorios")} className={sectionBtnClass("relatorios")}>
              <span className="material-symbols-outlined text-[20px]">summarize</span>
              <span className="flex-1 text-sm font-medium">Relatórios</span>
              <span className={`material-symbols-outlined text-[18px] transition-transform ${openMenus["relatorios"] ? "rotate-180" : ""}`}>
                expand_more
              </span>
            </button>
            {openMenus["relatorios"] && (
              <ul className="mt-1 ml-8 space-y-0.5">
                {RELATORIOS.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={subLinkClass(item.href)}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {/* Assistente de Erros */}
          <li>
            <Link
              href="/assistente-erros"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                isActive("/assistente-erros")
                  ? "alchemy-gradient text-white shadow-md"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">report_problem</span>
              <span className="text-sm font-medium">Assistente de Erros</span>
            </Link>
          </li>

        </ul>
      </nav>

      {/* Plan badge */}
      <div className="mx-4 my-4 p-4 rounded-xl alchemy-gradient text-white text-center">
        <p className="text-xs opacity-90 mb-1 font-semibold tracking-wide">PLANO PREMIUM</p>
        <p className="text-xs opacity-75 leading-snug">
          Acesso completo aos recursos
          <br />de CQI laboratorial
        </p>
      </div>
    </aside>
  );
};

export default SidebarMenu;
