"use client";

import React, { useState, useEffect } from "react";

const DarkMode: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") setIsDarkMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    const html = document.querySelector("html");
    if (!html) return;
    if (isDarkMode) html.classList.add("dark");
    else html.classList.remove("dark");
  }, [isDarkMode]);

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-[#1a1a1a] transition-all"
      onClick={() => setIsDarkMode((p) => !p)}
      aria-label="Alternar tema"
    >
      <span className="material-symbols-outlined text-[20px]">
        {isDarkMode ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
};

export default DarkMode;
