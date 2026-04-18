"use client";

import React from "react";

const Footer: React.FC = () => {
  return (
    <>
      <div className="grow" />
      <footer className="bg-white dark:bg-[#141414] rounded-t-xl mt-6 px-5 md:px-7 py-4 md:py-5 text-center border-t border-gray-100 dark:border-[#1a1a1a]">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-0">
          © {new Date().getFullYear()}{" "}
          <span className="text-primary-500 font-semibold">Alchemy Control Chart</span>
          {" — "}
          <a
            href="https://alchemypet.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary-600 font-medium transition-all hover:underline"
          >
            Alchemypet Medicina Diagnóstica
          </a>
        </p>
      </footer>
    </>
  );
};

export default Footer;
