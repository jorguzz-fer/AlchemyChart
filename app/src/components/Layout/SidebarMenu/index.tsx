"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

interface SidebarMenuProps {
  toggleActive: () => void;
}

interface MenuItem {
  label: string;
  icon: string;
  href?: string;
  children?: { label: string; href: string }[];
}

const MENU: MenuItem[] = [
  { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
  {
    label: "Por Analitos",
    icon: "biotech",
    children: [
      { label: "Lista de Analitos", href: "/analitos" },
      { label: "Painel de Controle", href: "/analitos/painel" },
    ],
  },
  {
    label: "Por Equipamentos",
    icon: "settings_applications",
    children: [
      { label: "Lista de Equipamentos", href: "/equipamentos" },
      { label: "Lançamento em Massa", href: "/equipamentos/lancamento" },
    ],
  },
  { label: "Materiais", icon: "science", href: "/materiais" },
  {
    label: "Auditoria",
    icon: "fact_check",
    children: [{ label: "Frequência", href: "/auditoria" }],
  },
  {
    label: "Relatórios",
    icon: "summarize",
    children: [
      { label: "Controles Ativos", href: "/relatorios/controles-ativos" },
      { label: "Revisão em Preparo", href: "/relatorios/revisao-preparo" },
      { label: "Não Conformidades", href: "/relatorios/nao-conformidades" },
      { label: "Intervenções", href: "/relatorios/intervencoes" },
      { label: "Incertezas", href: "/relatorios/incertezas" },
    ],
  },
  { label: "Assistente de Erros", icon: "report_problem", href: "/assistente-erros" },
];

const SidebarMenu: React.FC<SidebarMenuProps> = () => {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + "/");
  };

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

      {/* Main menu */}
      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {MENU.map((item) => {
            const hasChildren = !!item.children?.length;
            const isOpen = openMenus[item.label];
            const active = isActive(item.href);

            return (
              <li key={item.label}>
                {hasChildren ? (
                  <>
                    <button
                      onClick={() => toggleMenu(item.label)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                        isOpen
                          ? "bg-primary-50 text-primary-700 dark:bg-[#1a1a1a]"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {item.icon}
                      </span>
                      <span className="flex-1 text-sm font-medium">
                        {item.label}
                      </span>
                      <span
                        className={`material-symbols-outlined text-[18px] transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      >
                        expand_more
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="mt-1 ml-8 space-y-0.5">
                        {item.children!.map((sub) => (
                          <li key={sub.href}>
                            <Link
                              href={sub.href}
                              className={`block px-3 py-2 text-sm rounded-md transition-all ${
                                isActive(sub.href)
                                  ? "text-primary-600 font-semibold"
                                  : "text-gray-600 dark:text-gray-400 hover:text-primary-500"
                              }`}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href!}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      active
                        ? "alchemy-gradient text-white shadow-md"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {item.icon}
                    </span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Plan badge */}
      <div className="mx-4 my-4 p-4 rounded-xl alchemy-gradient text-white text-center">
        <p className="text-xs opacity-90 mb-1 font-semibold tracking-wide">
          PLANO PREMIUM
        </p>
        <p className="text-xs opacity-75 leading-snug">
          Acesso completo aos recursos
          <br />de CQI laboratorial
        </p>
      </div>
    </aside>
  );
};

export default SidebarMenu;
