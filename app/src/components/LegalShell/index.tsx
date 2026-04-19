import Link from "next/link";
import Image from "next/image";
import { ReactNode } from "react";

interface LegalShellProps {
  title: string;
  subtitle?: string;
  updatedAt: string;
  children: ReactNode;
}

export default function LegalShell({ title, subtitle, updatedAt, children }: LegalShellProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0c0b0b] flex flex-col">
      <header className="alchemy-gradient text-white">
        <div className="max-w-4xl mx-auto px-6 md:px-10 py-10 md:py-14">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white mb-6">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Voltar ao login
          </Link>
          <div className="flex items-center gap-4 mb-4">
            <Image
              src="/images/control-chat-logo-branco-320x79.png"
              alt="Alchemy Control Chart"
              width={200}
              height={50}
              className="w-auto h-10 md:h-12"
              unoptimized
            />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">{title}</h1>
          {subtitle && <p className="text-white/85 mt-3 max-w-2xl">{subtitle}</p>}
          <p className="text-white/70 text-xs mt-4">Atualizado em {updatedAt}</p>
        </div>
      </header>

      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-14 text-gray-800 dark:text-gray-200 leading-relaxed space-y-6">
          {children}
        </article>
      </main>

      <footer className="border-t border-gray-100 dark:border-[#1a1a1a] bg-white dark:bg-[#141414]">
        <div className="max-w-4xl mx-auto px-6 md:px-10 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>© {new Date().getFullYear()} Alchemypet — Alchemy Control Chart</span>
          <div className="flex items-center gap-5">
            <Link href="/privacidade" className="hover:text-gray-700 dark:hover:text-gray-200">Privacidade</Link>
            <Link href="/termos" className="hover:text-gray-700 dark:hover:text-gray-200">Termos</Link>
            <Link href="/login" className="hover:text-gray-700 dark:hover:text-gray-200">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
