"use client";

import { useState, useEffect, useCallback } from "react";

interface Equipment {
  id: string;
  name: string;
  model: string | null;
  serial: string | null;
  active: boolean;
  lastMaint: string | null;
  nextMaint: string | null;
}

interface FormState {
  name: string;
  model: string;
  serial: string;
}

const EMPTY_FORM: FormState = { name: "", model: "", serial: "" };

export default function EquipamentosPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Equipment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/equipamentos");
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

  const openEdit = (item: Equipment) => {
    setEditItem(item);
    setForm({ name: item.name, model: item.model ?? "", serial: item.serial ?? "" });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = editItem ? `/api/equipamentos/${editItem.id}` : "/api/equipamentos";
    const method = editItem ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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

  const handleToggleActive = async (item: Equipment) => {
    await fetch(`/api/equipamentos/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    fetchItems();
  };

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.model ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Equipamentos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Gerencie os equipamentos da sua unidade
          </p>
        </div>
        <button
          onClick={openCreate}
          className="alchemy-gradient text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-md hover:shadow-lg transition-all w-fit"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Novo Equipamento
        </button>
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        {/* Search */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-[#1a1a1a]">
          <div className="relative max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
              search
            </span>
            <input
              type="search"
              placeholder="Buscar equipamento..."
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
            <span className="material-symbols-outlined text-5xl mb-3">settings_applications</span>
            <p className="text-sm font-medium">Nenhum equipamento encontrado</p>
            {!search && (
              <button onClick={openCreate} className="mt-3 text-primary-500 text-sm font-semibold hover:underline">
                Cadastrar o primeiro equipamento
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  {["Nome", "Modelo", "Nº de Série", "Status", "Ações"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider ${i === 4 ? "text-center" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                  >
                    <td className="px-6 py-4 font-semibold text-black dark:text-white">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.model ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.serial ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          item.active
                            ? "bg-success-50 text-success-700"
                            : "bg-gray-100 dark:bg-[#1a1a1a] text-gray-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${item.active ? "bg-success-500" : "bg-gray-400"}`}
                        />
                        {item.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          title="Editar"
                          className="w-8 h-8 rounded-lg text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-black dark:text-white">
                {editItem ? "Editar Equipamento" : "Novo Equipamento"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {[
                { label: "Nome *", key: "name", placeholder: "ex: AU 480 (1)", required: true },
                { label: "Modelo", key: "model", placeholder: "ex: Beckman AU480", required: false },
                { label: "Nº de Série", key: "serial", placeholder: "ex: SN123456", required: false },
              ].map(({ label, key, placeholder, required }) => (
                <div key={key}>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">
                    {label}
                  </label>
                  <input
                    required={required}
                    value={form[key as keyof FormState]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
              ))}

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
