"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface FormState {
  labName: string;
  userName: string;
  email: string;
  password: string;
  confirm: string;
  acceptedTerms: boolean;
}

const EMPTY_FORM: FormState = {
  labName: "",
  userName: "",
  email: "",
  password: "",
  confirm: "",
  acceptedTerms: false,
};

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

  if (!longEnough && classes < 2) {
    return { score: 1, label: "Fraca", color: "bg-danger-500", hint: "Adicione mais caracteres e variação." };
  }
  if (!longEnough || classes < 3) {
    return { score: 2, label: "Razoável", color: "bg-warning-500", hint: "Mínimo 10 caracteres e 3 tipos (A-a-1-!)." };
  }
  if (longEnough && classes === 3) {
    return { score: 3, label: "Boa", color: "bg-success-500", hint: "Ótimo — inclua um símbolo para turbinar." };
  }
  return { score: 4, label: "Forte", color: "bg-success-600", hint: "Excelente!" };
}

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => evaluateStrength(form.password), [form.password]);

  const passwordsMatch = !form.confirm || form.password === form.confirm;
  const formIsValid =
    form.labName.trim().length >= 2 &&
    form.userName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    form.password.length >= 10 &&
    passwordsMatch &&
    form.acceptedTerms;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passwordsMatch) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labName: form.labName.trim(),
          userName: form.userName.trim(),
          email: form.email.trim(),
          password: form.password,
          acceptedTerms: form.acceptedTerms,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao criar conta.");
        setSubmitting(false);
        return;
      }

      // Success → go to login with a flash param
      const params = new URLSearchParams({ created: "1", email: form.email.trim() });
      router.push(`/login?${params.toString()}`);
    } catch {
      setError("Erro de rede. Verifique sua conexão e tente novamente.");
      setSubmitting(false);
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen flex">
      {/* Esquerda — Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 alchemy-gradient relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-400 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col p-12 text-white w-full h-full">
          <Link href="/" style={{ marginTop: "200px" }}>
            <Image
              src="/images/control-chat-logo-branco-320x79.png"
              alt="Alchemy Control Chart"
              width={320}
              height={79}
              className="w-auto"
              unoptimized
              priority
            />
          </Link>

          <div className="flex-1 flex items-center py-8">
            <div>
              <h1 className="text-white text-4xl md:text-5xl font-bold leading-tight mb-4">
                Comece agora
                <br />o seu Controle de Qualidade
              </h1>
              <p className="text-white/90 text-lg leading-relaxed mb-6 max-w-md">
                Crie a conta do seu laboratório em 1 minuto. Plano gratuito para começar,
                sem cartão de crédito.
              </p>

              <ul className="space-y-3 text-white/90 text-sm max-w-md">
                {[
                  "Regras de Westgard aplicadas automaticamente",
                  "Gráficos Levey-Jennings prontos",
                  "Gestão de equipamentos, materiais e analitos",
                  "Multi-usuário com perfis e auditoria",
                  "LGPD by design",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-secondary-400 text-[20px] mt-[-2px]">
                      check_circle
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-white/80">
            <span>© {new Date().getFullYear()} Alchemypet</span>
            <span>•</span>
            <Link href="/privacidade" className="hover:text-white">Privacidade</Link>
            <Link href="/termos" className="hover:text-white">Termos</Link>
          </div>
        </div>
      </div>

      {/* Direita — Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 bg-gray-50 dark:bg-[#0c0b0b]">
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
            <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: "#b38d03" }}>
              Criar conta
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              Cadastre seu laboratório e o administrador inicial.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Nome do laboratório */}
              <div>
                <label htmlFor="labName" className="block text-sm font-semibold text-black dark:text-white mb-2">
                  Nome do laboratório
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                    science
                  </span>
                  <input
                    id="labName"
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Laboratório Exemplo Ltda."
                    autoComplete="organization"
                    value={form.labName}
                    onChange={(e) => setField("labName", e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
              </div>

              {/* Seu nome */}
              <div>
                <label htmlFor="userName" className="block text-sm font-semibold text-black dark:text-white mb-2">
                  Seu nome
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                    person
                  </span>
                  <input
                    id="userName"
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Nome completo"
                    autoComplete="name"
                    value={form.userName}
                    onChange={(e) => setField("userName", e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
              </div>

              {/* E-mail */}
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
                    maxLength={200}
                    placeholder="seu@laboratorio.com"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-black dark:text-white mb-2">
                  Senha
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                    lock
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={10}
                    placeholder="Mínimo 10 caracteres"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
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

                {/* Strength meter */}
                {form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-all ${
                            i <= strength.score ? strength.color : "bg-gray-200 dark:bg-[#1a1a1a]"
                          }`}
                        />
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
                  Confirmar senha
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                    lock_reset
                  </span>
                  <input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(e) => setField("confirm", e.target.value)}
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

              {/* Aceitar termos */}
              <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.acceptedTerms}
                  onChange={(e) => setField("acceptedTerms", e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span>
                  Li e aceito os{" "}
                  <Link href="/termos" target="_blank" className="text-primary-500 hover:text-primary-600 font-semibold">
                    Termos de Uso
                  </Link>{" "}
                  e a{" "}
                  <Link href="/privacidade" target="_blank" className="text-primary-500 hover:text-primary-600 font-semibold">
                    Política de Privacidade
                  </Link>
                  .
                </span>
              </label>

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
                    Criando conta...
                  </>
                ) : (
                  <>
                    Criar conta
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-[#1a1a1a] text-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Já tem uma conta?{" "}
                <Link href="/login" className="text-primary-500 hover:text-primary-600 font-semibold">
                  Entrar
                </Link>
              </span>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-gray-400">
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">lock</span>
              Conexão segura — dados criptografados
            </span>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <Link href="/privacidade" className="hover:text-gray-700 dark:hover:text-gray-200">Privacidade</Link>
            <span aria-hidden="true">•</span>
            <Link href="/termos" className="hover:text-gray-700 dark:hover:text-gray-200">Termos</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
