"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

const MENU = [
  { href: "/perfil", icon: "account_circle", label: "Meu perfil" },
  { href: "/admin/usuarios", icon: "group", label: "Gerir usuários" },
  { href: "/admin/unidades", icon: "domain", label: "Gerir unidades" },
  { href: "/admin/laboratorio", icon: "corporate_fare", label: "Gerir laboratório" },
  { href: "/ajuda", icon: "help", label: "Ajuda & Suporte" },
];

const ProfileMenu: React.FC = () => {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setActive(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setActive((p) => !p)}
        className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-all ${
          active ? "bg-primary-50 dark:bg-[#1a1a1a]" : "hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
        }`}
      >
        <div className="w-9 h-9 rounded-full alchemy-gradient flex items-center justify-center text-white font-bold text-sm shadow-md">
          AK
        </div>
        <div className="hidden lg:block text-left leading-tight">
          <div className="text-xs font-semibold text-black dark:text-white">
            Adilson Kleber
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Responsável técnico
          </div>
        </div>
        <span className="material-symbols-outlined text-gray-400 text-[18px] hidden lg:inline">
          expand_more
        </span>
      </button>

      {active && (
        <div className="absolute top-full right-0 mt-3 w-[240px] bg-white dark:bg-[#141414] rounded-xl border border-gray-100 dark:border-[#1a1a1a] shadow-xl z-20 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-[#1a1a1a] alchemy-gradient">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-primary-500 font-bold">
              AK
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">
                Adilson Kleber Ferreira
              </div>
              <div className="text-xs text-white/80">Lab ID: 3461</div>
            </div>
          </div>

          <ul className="py-2">
            {MENU.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-[#1a1a1a] transition-all"
                >
                  <span className="material-symbols-outlined text-[20px] text-gray-400">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100 dark:border-[#1a1a1a]">
            <Link
              href="/logout"
              className="flex items-center gap-3 px-4 py-3 text-sm text-danger-500 hover:bg-danger-50 dark:hover:bg-[#1a1a1a] transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              Sair
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
