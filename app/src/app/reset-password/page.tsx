"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

interface StrengthInfo {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  hint: string;
}

function evaluateStrength(pw: string): StrengthInfo {
  if (!pw) return { score: 0, label: "", color: "bg-gray-200 dark:bg-[#1a1a1a]", hint: "" };
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  const longEnough = pw.length >= 10;
  if (!longEnough && classes < 2) return { score: 1, label: "Fraca", color: "bg-danger-500", hint: "Adicione mais caracteres e variação." };
  if (!longEnough || classes < 3) return { score: 2, label: "Razoável", color: "bg-warning-500", hint: "Mínimo 10 caracteres e 3 tipos (A-a-1-!)." };
  if (longEnough && classes === 3) return { score: 3, label: "Boa", color: "bg-success-500", hint: "Ótimo — inclua um símbolo para turbinar." };
  return { score: 4, label: "Forte", color: "bg-success-600", hint: "Excelente!" };
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lê o token da URL (client-only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);
  }, []);

  const strength = useMemo(() => evaluateStrength(password), [password]);
  const passwordsMatch = !confirm || password === confirm;
  const formIsValid = !!token && password.length >= 10 && passwordsMatch && !!confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passwordsMatch) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao redefinir senha.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Erro de rede. Verifique sua conexão e tente novamente.");
      setSubmitting(false);
    }
  };

  // Token ausente na URL
  if (token === null && typeof window !== "undefined" && !new URLSearchParams(window.location.search).get("token")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-[#0c0b0b]">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-10 shadow-sm">
            <span className="material-symbols-outlined text-danger-400 text-[48px] mb-4 block">link_off</span>
            <h2 className="text-xl font-bold text-black dark:text-white mb-2">Link inválido</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
              Este link de redefinição é inválido ou já foi utilizado.
            </p>
            <Link href="/forgot-password" className="text-primary-500 hover:text-primary-600 font-semibold text-sm">
              Solicitar novo link →
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
          {success ? (
            /* ── Sucesso ── */
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-success-600 text-[36px]">lock_reset</span>
              </div>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Senha redefinida!</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Sua nova senha foi salva. Você já pode fazer login.
              </p>
              <Link
                href="/login"
                className="w-full alchemy-gradient text-white font-semibold py-3 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
              >
                Ir para o login
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </Link>
            </div>
          ) : (
            /* ── Formulário ── */
            <>
              <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: "#b38d03" }}>
                Nova senha
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                Escolha uma senha forte para proteger sua conta.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Nova senha */}
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-black dark:text-white mb-2">
                    Nova senha
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">lock</span>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={10}
                      placeholder="Mínimo 10 caracteres"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-11 py-3 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {showPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= strength.score ? strength.color : "bg-gray-200 dark:bg-[#1a1a1a]"}`} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                        <span className="font-semibold">{strength.label}</span>
                        {strength.hint && <span className="text-gray-400">· {strength.hint}</span>}
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirmar senha */}
                <div>
                  <label htmlFor="confirm" className="block text-sm font-semibold text-black dark:text-white mb-2">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">lock_reset</span>
                    <input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className={`w-full pl-10 pr-4 py-3 rounded-lg border bg-gray-50 dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 transition-all ${
                        passwordsMatch
                          ? "border-gray-200 dark:border-[#1a1a1a] focus:ring-primary-500/30 focus:border-primary-500"
                          : "border-danger-300 focus:ring-danger-500/30 focus:border-danger-500"
                      }`}
                    />
                  </div>
                  {!passwordsMatch && (
                    <p className="text-xs text-danger-600 mt-1.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">error</span>
                      As senhas não conferem.
                    </p>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !formIsValid}
                  className="w-full alchemy-gradient text-white font-semibold py-3 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                      Salvando...
                    </>
                  ) : (
                    <>
                      Salvar nova senha
                      <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>
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
