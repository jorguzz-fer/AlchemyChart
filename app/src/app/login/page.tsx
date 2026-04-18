"use client";

import Link from "next/link";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("E-mail ou senha incorretos.");
      setSubmitting(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Esquerda — Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 alchemy-gradient relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-400 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col p-12 text-white w-full h-full">
          <Link href="/" className="flex flex-col gap-1.5 w-fit">
            <Image
              src="/images/control-chat-logo-branco.png"
              alt="Alchemy Control Chart"
              width={206}
              height={60}
              className="h-14 w-auto"
              unoptimized
              priority
            />
          </Link>

          <div className="flex-1 flex items-center py-8">
          <div>
            <h1 className="text-white text-4xl md:text-5xl font-bold leading-tight mb-4">
              Controle de Qualidade
              <br />
              Interno para Laboratórios
            </h1>
            <p className="text-white/90 text-lg leading-relaxed mb-6 max-w-md">
              Gráficos Levey-Jennings, regras de Westgard e gestão completa de
              analitos, equipamentos e materiais de controle.
            </p>

            <div className="flex flex-wrap gap-4">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 flex items-center gap-3 min-w-[180px]">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white">
                    monitoring
                  </span>
                </div>
                <div>
                  <div className="text-xs text-white/70">Westgard</div>
                  <div className="text-sm font-bold">8 regras ativas</div>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 flex items-center gap-3 min-w-[180px]">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white">
                    verified_user
                  </span>
                </div>
                <div>
                  <div className="text-xs text-white/70">LGPD</div>
                  <div className="text-sm font-bold">Compatível</div>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-white/80">
            <span>© {new Date().getFullYear()} Alchemypet</span>
            <span>•</span>
            <Link href="/privacidade" className="hover:text-white">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-white">
              Termos
            </Link>
          </div>
        </div>
      </div>

      {/* Direita — Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 bg-gray-50 dark:bg-[#0c0b0b]">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="alchemy-gradient rounded-2xl px-6 py-3">
              <Image
                src="/images/control-chat-logo-branco.png"
                alt="Alchemy Control Chart"
                width={172}
                height={50}
                className="h-10 w-auto"
                unoptimized
              />
            </div>
          </div>

          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-8 md:p-10 shadow-sm">
            <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#b38d03' }}>
              Bem-vindo de volta
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              Entre na sua conta para acessar o painel de controle.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-black dark:text-white mb-2"
                >
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-black dark:text-white"
                  >
                    Senha
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary-500 hover:text-primary-600 font-medium"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                    lock
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
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
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                Manter-me conectado
              </label>

              {error && (
                <div className="flex items-center gap-2 text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full alchemy-gradient text-white font-semibold py-3 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[20px]">
                      progress_activity
                    </span>
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <span className="material-symbols-outlined text-[20px]">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-[#1a1a1a] text-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Novo laboratório?{" "}
                <Link
                  href="/signup"
                  className="text-primary-500 hover:text-primary-600 font-semibold"
                >
                  Solicitar acesso
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
        </div>
      </div>
    </div>
  );
}
