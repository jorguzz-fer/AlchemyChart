"use client";

import React, { useEffect, useState } from "react";
import DarkMode from "./DarkMode";
import Notifications from "./Notifications";
import ProfileMenu from "./ProfileMenu";

interface HeaderProps {
  toggleActive: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleActive }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    document.addEventListener("scroll", handleScroll);
    return () => document.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      id="header"
      className={`header-area bg-white dark:bg-[#0c0b0b] py-[13px] px-[20px] md:px-[25px] fixed top-[15px] md:top-[25px] z-[6] rounded-xl transition-all border border-gray-100 dark:border-[#1a1a1a] ${
        scrolled ? "shadow-md" : ""
      }`}
    >
      <div className="md:flex md:items-center md:justify-between gap-4">
        <div className="flex items-center justify-between md:justify-normal gap-3 flex-1">
          <button
            type="button"
            className="xl:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-primary-50 hover:text-primary-500 transition-all"
            onClick={toggleActive}
            aria-label="Toggle sidebar"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>

          {/* Tenant / Lab selector */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#141414]">
            <span className="material-symbols-outlined text-primary-500 text-[18px]">
              domain
            </span>
            <div className="leading-tight">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium tracking-wide">
                LABORATÓRIO
              </div>
              <div className="text-xs text-black dark:text-white font-semibold">
                Alchemypet Medicina Diagnóstica
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-[18px] ml-2">
              unfold_more
            </span>
          </div>

          {/* Unidade selector */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#141414]">
            <span className="material-symbols-outlined text-secondary-500 text-[18px]">
              location_on
            </span>
            <div className="leading-tight">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium tracking-wide">
                UNIDADE
              </div>
              <div className="text-xs text-black dark:text-white font-semibold">
                Matriz
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-[18px] ml-2">
              unfold_more
            </span>
          </div>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <input
                type="search"
                placeholder="Buscar analito, equipamento..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#141414] text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              />
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                search
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center md:justify-normal gap-1 mt-3 md:mt-0">
          <DarkMode />
          <Notifications />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
};

export default Header;
