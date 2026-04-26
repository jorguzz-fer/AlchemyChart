"use client";

import { useState, useEffect, useCallback } from "react";

interface Equipment { id: string; name: string }
interface Material { id: string; name: string }

// Resposta de /api/analitos/list (deduplicada por nome+unidade)
interface GroupedAnalyte {
  masterId: string;
  name: string;
  unit: string | null;
  active: boolean;
  decimalPlaces: number;
  maxImprecision: number | null;
  imprecisionSource: string | null;
  westgardRules: unknown;
  duplicateIds: string[];
  analyteMaterials: AnalyteMaterialItem[];
  totalRuns: number;
  totalStats: number;
  equipmentCount: number;
  levelCount: number;
}

interface AnalyteMaterialItem {
  id: string;
  analyteId: string;
  equipmentId: string;
  equipment: { id: string; name: string };
  materialId: string;
  material: { id: string; name: string; lot: string | null };
  level: number;
  status: string;
  manufacturerMean: number | null;
  manufacturerSD: number | null;
}

interface FormState {
  name: string;
  unit: string;
  level: string;
  equipmentId: string;
  materialId: string;
  decimalPlaces: string;
  maxImprecision: string;
  imprecisionSource: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  unit: "",
  level: "1",
  equipmentId: "",
  materialId: "",
  decimalPlaces: "3",
  maxImprecision: "",
  imprecisionSource: "",
};

export default function AnalitosPage() {
  const [items, setItems] = useState<GroupedAnalyte[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("active");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<GroupedAnalyte | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [a, e, m] = await Promise.all([
      fetch("/api/analitos/list").then((r) => r.json()),
      fetch("/api/equipamentos").then((r) => r.json()),
      fetch("/api/materiais").then((r) => r.json()),
    ]);
    setItems(Array.isArray(a) ? a : []);
    setEquipments((Array.isArray(e) ? e : []).filter((eq: Equipment & { active?: boolean }) => eq.active !== false));
    setMaterials((Array.isArray(m) ? m : []).filter((mt: Material & { active?: boolean }) => mt.active !== false));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (item: GroupedAnalyte) => {
    setEditItem(item);
    // Pega a primeira combinação como referência para os campos legacy
    const firstAm = item.analyteMaterials[0];
    setForm({
      name: item.name,
      unit: item.unit ?? "",
      level: String(firstAm?.level ?? 1),
      equipmentId: firstAm?.equipmentId ?? "",
      materialId: firstAm?.materialId ?? "",
      decimalPlaces: String(item.decimalPlaces),
      maxImprecision: item.maxImprecision !== null ? String(item.maxImprecision) : "",
      imprecisionSource: item.imprecisionSource ?? "",
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = editItem ? `/api/analitos/${editItem.masterId}` : "/api/analitos";
    const method = editItem ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        unit: form.unit,
        level: Number(form.level),
        equipmentId: form.equipmentId,
        materialId: form.materialId,
        decimalPlaces: Number(form.decimalPlaces),
        maxImprecision: form.maxImprecision === "" ? null : Number(form.maxImprecision.replace(",", ".")),
        imprecisionSource: form.imprecisionSource,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao salvar");
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowModal(false);
    fetchAll();
  };

  const handleToggleActive = async (item: GroupedAnalyte) => {
    // Toggle em todas as duplicatas
    await Promise.all(
      item.duplicateIds.map((id) =>
        fetch(`/api/analitos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !item.active }),
        })
      )
    );
    fetchAll();
  };

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    const matchesQuery = !q
      || i.name.toLowerCase().includes(q)
      || i.analyteMaterials.some((am) => am.equipment.name.toLowerCase().includes(q))
      || i.analyteMaterials.some((am) => am.material.name.toLowerCase().includes(q));

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && i.active) ||
      (filterStatus === "inactive" && !i.active);

    return matchesQuery && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Analitos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Gerencie os analitos (exames) e suas associações a equipamentos e materiais
          </p>
        </div>
        <button
          onClick={openCreate}
          className="alchemy-gradient text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-md hover:shadow-lg transition-all w-fit"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Novo Analito
        </button>
      </div>

      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-[#1a1a1a] flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Filtros de status */}
          <div className="flex items-center gap-4 text-sm">
            {([
              { value: "active", label: "Habilitados" },
              { value: "inactive", label: "Desabilitados" },
              { value: "all", label: "Todos" },
            ] as const).map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="filter"
                  value={opt.value}
                  checked={filterStatus === opt.value}
                  onChange={() => setFilterStatus(opt.value)}
                  className="w-4 h-4 text-primary-500 focus:ring-primary-500"
                />
                <span className={filterStatus === opt.value ? "font-semibold text-black dark:text-white" : "text-gray-500"}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>

          <div className="relative flex-1 max-w-sm sm:ml-auto">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
              search
            </span>
            <input
              type="search"
              placeholder="Pesquisar por nome..."
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
            <span className="material-symbols-outlined text-5xl mb-3">biotech</span>
            <p className="text-sm font-medium">Nenhum analito encontrado</p>
            {!search && (
              <button onClick={openCreate} className="mt-3 text-primary-500 text-sm font-semibold hover:underline">
                Cadastrar o primeiro analito
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center w-24">Ações</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-left">Analito (Exame)</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-left">Imprecisão máxima</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-left">Equipamentos</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-left">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.masterId}
                    className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                  >
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
                          title={item.active ? "Desabilitar" : "Habilitar"}
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
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-black dark:text-white">{item.name}</div>
                        {item.unit && (
                          <div className="text-xs text-gray-400 mt-0.5">{item.unit}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {item.maxImprecision !== null ? (
                        <span>{item.maxImprecision.toString().replace(".", ",")}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(
                          new Map(item.analyteMaterials.map((am) => [am.equipment.id, am.equipment])).values()
                        ).map((eq) => (
                          <span
                            key={eq.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-400"
                          >
                            {eq.name}
                          </span>
                        ))}
                        {item.analyteMaterials.length === 0 && (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>
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
                        {item.active ? "Habilitado" : "Desabilitado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de criação/edição (vai virar página dedicada na Fase 4) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-6 w-full max-w-lg shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-black dark:text-white">
                {editItem ? "Editar Analito" : "Novo Analito"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Nome *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="ex: Hemoglobina"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Unidade</label>
                  <input
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="ex: g/dL"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">
                    Casas decimais (máx. 3)
                  </label>
                  <select
                    value={form.decimalPlaces}
                    onChange={(e) => setForm((f) => ({ ...f, decimalPlaces: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">
                    Imprecisão máxima (%)
                  </label>
                  <input
                    inputMode="decimal"
                    value={form.maxImprecision}
                    onChange={(e) => setForm((f) => ({ ...f, maxImprecision: e.target.value }))}
                    placeholder="ex: 5,5"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">
                  Origem da imprecisão
                </label>
                <input
                  value={form.imprecisionSource}
                  onChange={(e) => setForm((f) => ({ ...f, imprecisionSource: e.target.value }))}
                  placeholder="ex: Tabela de Variação Biológica, CLIA, RiliBÄK"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>

              {!editItem && (
                <>
                  <div className="border-t border-gray-100 dark:border-[#1a1a1a] pt-4">
                    <p className="text-xs text-gray-500 mb-3">
                      Primeira associação (você poderá adicionar mais materiais depois):
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">Nível</label>
                    <select
                      value={form.level}
                      onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">
                      Equipamento *
                    </label>
                    <select
                      required
                      value={form.equipmentId}
                      onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                    >
                      <option value="">Selecione um equipamento</option>
                      {equipments.map((eq) => (
                        <option key={eq.id} value={eq.id}>{eq.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-black dark:text-white mb-1.5">
                      Material de Controle *
                    </label>
                    <select
                      required
                      value={form.materialId}
                      onChange={(e) => setForm((f) => ({ ...f, materialId: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                    >
                      <option value="">Selecione um material</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </>
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
