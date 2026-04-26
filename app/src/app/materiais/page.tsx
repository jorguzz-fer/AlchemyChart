"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Material {
  id: string;
  name: string;
  lot: string | null;
  generation: string | null;
  expiresAt: string | null;
  active: boolean;
  fabricante: string | null;
  _count: { analyteMaterials: number };
}

interface FormState {
  name: string;
  lot: string;
  generation: string;
  expiresAt: string;
}

const EMPTY_FORM: FormState = { name: "", lot: "", generation: "", expiresAt: "" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function isExpiring(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 30 && diff >= 0;
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export default function MateriaisPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/materiais");
    setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = editItem ? `/api/materiais/${editItem.id}` : "/api/materiais";
    const method = editItem ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        expiresAt: form.expiresAt || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao salvar");
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowModal(false);
    fetchItems();
  };

  const handleToggleActive = async (item: Material) => {
    await fetch(`/api/materiais/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    fetchItems();
  };

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.lot ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Materiais de Controle</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Gerencie os materiais de controle da sua unidade
          </p>
        </div>
        <button
          onClick={openCreate}
          className="alchemy-gradient text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-md hover:shadow-lg transition-all w-fit"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Novo Material
        </button>
      </div>

      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-[#1a1a1a]">
          <div className="relative max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
              search
            </span>
            <input
              type="search"
              placeholder="Buscar material ou lote..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="material-symbols-outlined text-5xl mb-3">science</span>
            <p className="text-sm font-medium">Nenhum material encontrado</p>
            {!search && (
              <button onClick={openCreate} className="mt-3 text-primary-500 text-sm font-semibold hover:underline">
                Cadastrar o primeiro material
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  {["Nome", "Lote", "Geração", "Validade", "Status", "Ações"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider ${i === 5 ? "text-center" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const expired = isExpired(item.expiresAt);
                  const expiring = isExpiring(item.expiresAt);
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                    >
                      <td className="px-6 py-4 font-semibold text-black dark:text-white">{item.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.lot ?? "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.generation ?? "—"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-sm font-medium ${
                            expired
                              ? "text-danger-500"
                              : expiring
                              ? "text-warning-600"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {item.expiresAt ? (
                            <>
                              {formatDate(item.expiresAt)}
                              {expired && (
                                <span className="ml-1.5 text-xs bg-danger-50 text-danger-600 px-1.5 py-0.5 rounded-full">
                                  Vencido
                                </span>
                              )}
                              {expiring && !expired && (
                                <span className="ml-1.5 text-xs bg-warning-50 text-warning-700 px-1.5 py-0.5 rounded-full">
                                  A vencer
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            item.active
                              ? "bg-success-50 text-success-700"
                              : "bg-gray-100 dark:bg-[#1a1a1a] text-gray-500"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${item.active ? "bg-success-500" : "bg-gray-400"}`} />
                          {item.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/materiais/${item.id}`}
                            title="Editar"
                            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </Link>
                          <button
                            onClick={() => handleToggleActive(item)}
                            title={item.active ? "Desativar" : "Ativar"}
                            className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${
                              item.active
                                ? "text-gray-500 hover:bg-danger-50 hover:text-danger-500"
                                : "text-gray-500 hover:bg-success-50 hover:text-success-500"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {item.active ? "block" : "check_circle"}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-black dark:text-white">
                {editItem ? "Editar Material" : "Novo Material"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Nome *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Liquichek Cardiac"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Lote</label>
                  <input
                    value={form.lot}
                    onChange={(e) => setForm((f) => ({ ...f, lot: e.target.value }))}
                    placeholder="ex: L240001"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Geração</label>
                  <input
                    value={form.generation}
                    onChange={(e) => setForm((f) => ({ ...f, generation: e.target.value }))}
                    placeholder="ex: 3"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Validade</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>

              {error && (
                <p className="text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-[#1a1a1a] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl alchemy-gradient text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[16px]">
                        progress_activity
                      </span>
                      Salvando...
                    </>
                  ) : (
                    "Salvar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
