import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0c0b0b]">
      <div className="text-center px-6">
        <p className="text-8xl font-bold text-primary-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-black dark:text-white mb-2">
          Página não encontrada
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 alchemy-gradient text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
