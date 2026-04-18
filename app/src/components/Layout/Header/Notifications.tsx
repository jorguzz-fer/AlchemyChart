"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Notification = {
  id: string;
  icon: string;
  tone: "danger" | "warning" | "info" | "success";
  title: string;
  message: string;
  time: string;
  link: string;
  isNew?: boolean;
};

const toneStyles: Record<Notification["tone"], string> = {
  danger: "bg-danger-50 text-danger-500",
  warning: "bg-warning-50 text-warning-600",
  info: "bg-info-50 text-info-500",
  success: "bg-success-50 text-success-600",
};

const NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    icon: "error",
    tone: "danger",
    title: "Controle rejeitado",
    message: "AU 480 (1) — Glicose Nível 2 violou regra 1:3s",
    time: "há 12 min",
    link: "/analitos/painel",
    isNew: true,
  },
  {
    id: "2",
    icon: "warning",
    tone: "warning",
    title: "CV elevado",
    message: "HEMATO 01 — Leucócitos Nível 2 com CV de 18,6%",
    time: "há 2h",
    link: "/relatorios/controles-ativos",
  },
  {
    id: "3",
    icon: "schedule",
    tone: "info",
    title: "Material próximo do vencimento",
    message: "Hormônios 144 (Lote VCB 144) vence em 5 dias",
    time: "há 1 dia",
    link: "/materiais",
  },
];

const Notifications: React.FC = () => {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setActive(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const hasNew = NOTIFICATIONS.some((n) => n.isNew);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setActive((p) => !p)}
        className={`relative inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all ${
          active
            ? "bg-primary-50 text-primary-500"
            : "text-gray-600 dark:text-gray-300 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-[#1a1a1a]"
        }`}
        aria-label="Notificações"
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {hasNew && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger-500 ring-2 ring-white dark:ring-[#0c0b0b]" />
        )}
      </button>

      {active && (
        <div className="absolute top-full right-0 mt-3 w-[340px] bg-white dark:bg-[#141414] rounded-xl border border-gray-100 dark:border-[#1a1a1a] shadow-xl z-20 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#1a1a1a]">
            <div>
              <span className="font-semibold text-black dark:text-white">
                Notificações
              </span>
              <span className="text-gray-400 text-sm ml-1">
                ({NOTIFICATIONS.length})
              </span>
            </div>
            <button className="text-xs text-primary-500 font-medium hover:text-primary-600">
              Marcar como lidas
            </button>
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {NOTIFICATIONS.map((n) => (
              <li
                key={n.id}
                className="relative px-5 py-3 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all border-b border-gray-50 dark:border-[#1a1a1a] last:border-0"
              >
                <div className="flex gap-3">
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${toneStyles[n.tone]}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {n.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-black dark:text-white mb-0.5">
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug mb-1">
                      {n.message}
                    </p>
                    <span className="text-xs text-gray-400">{n.time}</span>
                  </div>
                  {n.isNew && (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-danger-500 mt-2" />
                  )}
                </div>
                <Link href={n.link} className="absolute inset-0" />
              </li>
            ))}
          </ul>

          <div className="p-3 border-t border-gray-100 dark:border-[#1a1a1a]">
            <Link
              href="/notificacoes"
              className="block text-center text-sm text-primary-500 font-medium hover:text-primary-600"
            >
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
