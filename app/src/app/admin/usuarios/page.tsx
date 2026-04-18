"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

interface Unit { id: string; name: string }

interface UserItem {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "SUPERVISOR" | "ANALYST" | "VIEWER" | "SUPERADMIN";
  active: boolean;
  unitId: string | null;
  unit: { id: string; name: string } | null;
  createdAt: string;
}

interface FormState {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "SUPERVISOR" | "ANALYST" | "VIEWER";
  unitId: string;
}

const EMPTY_FORM: FormState = {
  name: "", email: "", password: "", role: "ANALYST", unitId: "",
};

const ROLE_META: Record<string, { label: string; desc: string; cls: string }> = {
  SUPERADMIN:  { label: "Super Admin", desc: "Equipe Alchemy",              cls: "bg-purple-100 text-purple-700" },
  ADMIN:       { label: "Administrador", desc: "Gestão total do laboratório", cls: "bg-primary-100 text-primary-700" },
  SUPERVISOR:  { label: "Supervisor",   desc: "Supervisão da unidade",         cls: "bg-info-100 text-info-700" },
  ANALYST:     { label: "Analista",     desc: "Lança corridas e visualiza",    cls: "bg-success-100 text-success-700" },
  VIEWER:      { label: "Visualizador", desc: "Somente leitura",               cls: "bg-gray-100 text-gray-600" },
};

export default function UsuariosPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [items, setItems] = useState<UserItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<UserItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/usuarios");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
    fetch("/api/unidades").then((r) => r.json()).then((u) => {
      if (Array.isArray(u)) setUnits(u);
    }).catch(() => {});
  }, [fetchItems]);

  const openCreate = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (item: UserItem) => {
    setEditItem(item);
    setForm({
      name: item.name ?? "",
      email: item.email,
      password: "",
      role: (item.role === "SUPERADMIN" ? "ADMIN" : item.role) as FormState["role"],
      unitId: item.unitId ?? "",
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = editItem ? `/api/usuarios/${editItem.id}` : "/api/usuarios";
    const method = editItem ? "PATCH" : "POST";

    const payload: Partial<FormState> = { ...form };
    if (editItem && !payload.password) delete payload.password;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao salvar");
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowModal(false);
    fetchItems();
  };

  const handleToggleActive = async (item: UserItem) => {
    if (item.id === currentUserId) return;
    await fetch(`/api/usuarios/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    fetchItems();
  };

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    return (
      (i.name ?? "").toLowerCase().includes(q) ||
      i.email.toLowerCase().includes(q) ||
      i.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Usuários</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Gerencie quem tem acesso ao sistema
          </p>
        </div>
        <button
          onClick={openCreate}
          className="alchemy-gradient text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-md hover:shadow-lg transition-all w-fit"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Novo Usuário
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
              placeholder="Buscar por nome, e-mail, perfil..."
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
            <span className="material-symbols-outlined text-5xl mb-3">group</span>
            <p className="text-sm font-medium">Nenhum usuário encontrado</p>
            {!search && (
              <button onClick={openCreate} className="mt-3 text-primary-500 text-sm font-semibold hover:underline">
                Cadastrar o primeiro usuário
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  {["Usuário", "E-mail", "Perfil", "Unidade", "Status", "Ações"].map((h, i) => (
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
                  const roleMeta = ROLE_META[item.role] ?? ROLE_META.VIEWER;
                  const isSelf = item.id === currentUserId;
                  const initial = (item.name ?? item.email).charAt(0).toUpperCase();
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full alchemy-gradient text-white flex items-center justify-center font-bold text-sm">
                            {initial}
                          </div>
                          <div>
                            <div className="font-semibold text-black dark:text-white flex items-center gap-2">
                              {item.name ?? "—"}
                              {isSelf && (
                                <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-semibold">
                                  VOCÊ
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{item.email}</td>
                      <td className="px-6 py-4">
                        <div>
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${roleMeta.cls}`}>
                            {roleMeta.label}
                          </span>
                          <div className="text-[11px] text-gray-400 mt-1">{roleMeta.desc}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {item.unit?.name ?? "—"}
                      </td>
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
                            disabled={isSelf}
                            title={isSelf ? "Não é possível desativar seu próprio usuário" : item.active ? "Desativar" : "Ativar"}
                            className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${
                              isSelf
                                ? "text-gray-300 cursor-not-allowed"
                                : item.active
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#1a1a1a]">
              <h3 className="text-lg font-bold text-black dark:text-white">
                {editItem ? "Editar Usuário" : "Novo Usuário"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Nome *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">E-mail *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@laboratorio.com"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">
                  Senha {editItem ? "(deixe em branco para manter)" : "*"}
                </label>
                <input
                  required={!editItem}
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Perfil *</label>
                <select
                  required
                  disabled={editItem?.id === currentUserId}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as FormState["role"] }))}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all disabled:opacity-60"
                >
                  <option value="ADMIN">Administrador — Gestão total</option>
                  <option value="SUPERVISOR">Supervisor — Supervisão da unidade</option>
                  <option value="ANALYST">Analista — Lança corridas</option>
                  <option value="VIEWER">Visualizador — Somente leitura</option>
                </select>
                {editItem?.id === currentUserId && (
                  <p className="text-[11px] text-gray-400 mt-1">Você não pode alterar seu próprio perfil</p>
                )}
              </div>

              {units.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Unidade</label>
                  <select
                    value={form.unitId}
                    onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  >
                    <option value="">— Selecionar —</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}

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
                      <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
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
