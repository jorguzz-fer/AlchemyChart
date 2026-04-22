"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao processar solicitação.");
        setSubmitting(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Erro de rede. Verifique sua conexão e tente novamente.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-[#0c0b0b]">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image
            src="/images/control-chat-logo-collor320x79.png"
            alt="Alchemy Control Chart"
            width={320}
            height={79}
            className="w-auto h-14"
            unoptimized
          />
        </div>

        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-8 md:p-10 shadow-sm">
          {sent ? (
            /* ── Estado de sucesso ── */
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-success-600 text-[36px]">mark_email_read</span>
              </div>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
                E-mail enviado!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                Se <strong className="text-gray-700 dark:text-gray-200">{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
              </p>
              <p className="text-sm text-gray-400 mb-6">
                Verifique também a pasta de spam. O link expira em <strong>1 hora</strong>.
              </p>
              <Link
                href="/login"
                className="text-primary-500 hover:text-primary-600 font-semibold text-sm"
              >
                ← Voltar para o login
              </Link>
            </div>
          ) : (
            /* ── Formulário ── */
            <>
              <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: "#b38d03" }}>
                Recuperar senha
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                Digite seu e-mail e enviaremos um link para criar uma nova senha.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-black dark:text-white mb-2">
                    E-mail
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                      mail
                    </span>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="seu@email.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="w-full alchemy-gradient text-white font-semibold py-3 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                      Enviando...
                    </>
                  ) : (
                    <>
                      Enviar link de recuperação
                      <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-[#1a1a1a] text-center">
                <Link href="/login" className="text-sm text-primary-500 hover:text-primary-600 font-semibold">
                  ← Voltar para o login
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-gray-400">
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            Conexão segura — dados criptografados
          </span>
        </div>
      </div>
    </div>
  );
}
