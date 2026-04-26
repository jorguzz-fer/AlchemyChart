"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  WESTGARD_RULE_KEYS,
  WESTGARD_RULE_DESCRIPTIONS,
  DEFAULT_WESTGARD_RULES,
  parseWestgardRules,
  type WestgardRuleKey,
  type WestgardRuleState,
} from "@/lib/westgard-config";

interface Equipment { id: string; name: string }
interface Material { id: string; name: string; lot: string | null }

interface AnalyteMaterialItem {
  id: string;
  ownerAnalyteId: string;
  analyteId: string;
  equipmentId: string;
  materialId: string;
  level: number;
  manufacturerMean: number | null;
  manufacturerSD: number | null;
  status: string;
  equipment: { id: string; name: string };
  material: { id: string; name: string; lot: string | null };
  _count: { runs: number };
}

interface AnalyteFull {
  id: string;
  name: string;
  unit: string | null;
  active: boolean;
  decimalPlaces: number;
  maxImprecision: number | null;
  imprecisionSource: string | null;
  westgardRules: unknown;
  duplicateIds: string[];
  analyteMaterials: AnalyteMaterialItem[];
  _count: { runs: number; stats: number };
}

const RULE_STATE_OPTIONS: { value: WestgardRuleState; label: string; color: string }[] = [
  { value: "OFF",    label: "Desabilitada", color: "bg-gray-100 text-gray-500" },
  { value: "ALERT",  label: "Alertar",      color: "bg-warning-50 text-warning-700" },
  { value: "REJECT", label: "Rejeitar",     color: "bg-danger-50 text-danger-700" },
];

export default function AnalyteEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [analyte, setAnalyte] = useState<AnalyteFull | null>(null);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  // Form: header
  const [active, setActive] = useState(true);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [decimalPlaces, setDecimalPlaces] = useState("3");
  const [maxImprecision, setMaxImprecision] = useState("");
  const [imprecisionSource, setImprecisionSource] = useState("");

  // Form: westgard rules
  const [rules, setRules] = useState<Record<WestgardRuleKey, WestgardRuleState>>(
    DEFAULT_WESTGARD_RULES
  );

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Associate form state
  const [assocEquipmentId, setAssocEquipmentId] = useState("");
  const [assocMaterialId, setAssocMaterialId] = useState("");
  const [assocLevel, setAssocLevel] = useState("1");
  const [assocXm, setAssocXm] = useState("");
  const [assocDP, setAssocDP] = useState("");
  const [associating, setAssociating] = useState(false);
  const [assocError, setAssocError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, eqRes, mtRes] = await Promise.all([
      fetch(`/api/analitos/${id}`).then((r) => r.json()).catch(() => null),
      fetch("/api/equipamentos").then((r) => r.json()).catch(() => []),
      fetch("/api/materiais").then((r) => r.json()).catch(() => []),
    ]);

    if (!aRes || aRes.error) {
      setAnalyte(null);
      setLoading(false);
      return;
    }

    const a: AnalyteFull = aRes;
    setAnalyte(a);
    setActive(a.active);
    setName(a.name);
    setUnit(a.unit ?? "");
    setDecimalPlaces(String(a.decimalPlaces));
    setMaxImprecision(a.maxImprecision !== null ? String(a.maxImprecision).replace(".", ",") : "");
    setImprecisionSource(a.imprecisionSource ?? "");
    setRules(parseWestgardRules(a.westgardRules));

    if (Array.isArray(eqRes)) {
      setEquipments(
        (eqRes as Array<Equipment & { active?: boolean }>)
          .filter((e) => e.active !== false)
          .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
      );
    }
    if (Array.isArray(mtRes)) {
      setMaterials(
        (mtRes as Array<Material & { active?: boolean }>)
          .filter((m) => m.active !== false)
          .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
      );
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Save
  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);

    const res = await fetch(`/api/analitos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        unit: unit.trim() || null,
        decimalPlaces: Number(decimalPlaces),
        maxImprecision: maxImprecision.trim() === ""
          ? null
          : Number(maxImprecision.replace(",", ".")),
        imprecisionSource: imprecisionSource.trim() || null,
        westgardRules: rules,
        active,
      }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSaveMessage({ type: "error", text: d.error ?? "Erro ao salvar" });
    } else {
      setSaveMessage({ type: "ok", text: "Analito atualizado" });
      load();
      setTimeout(() => setSaveMessage(null), 2500);
    }
    setSaving(false);
  };

  const handleResetRules = () => {
    if (confirm("Restaurar configuração padrão das regras de Westgard?")) {
      setRules({ ...DEFAULT_WESTGARD_RULES });
    }
  };

  const handleAssociate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssocError(null);

    if (!analyte) return;
    if (!assocEquipmentId) { setAssocError("Selecione um equipamento"); return; }
    if (!assocMaterialId) { setAssocError("Selecione um material"); return; }

    // Encontra ou cria o Analyte legado para essa combinação (durante transição,
    // associação por enquanto cria via /api/materiais/[id]/analytes que requer
    // analyteId — usamos o id do master analyte aqui).
    setAssociating(true);
    const res = await fetch(`/api/materiais/${assocMaterialId}/analytes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analyteId: analyte.id, // usa o master; no futuro, lógica de dedup será feita aqui
        equipmentId: assocEquipmentId,
        level: Number(assocLevel),
        manufacturerMean: assocXm.replace(",", ".") || null,
        manufacturerSD: assocDP.replace(",", ".") || null,
      }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAssocError(d.error ?? "Erro ao associar");
    } else {
      setAssocEquipmentId("");
      setAssocMaterialId("");
      setAssocLevel("1");
      setAssocXm("");
      setAssocDP("");
      load();
    }
    setAssociating(false);
  };

  const handleRemoveAssoc = async (am: AnalyteMaterialItem) => {
    if (am._count.runs > 0) {
      alert(`Existem ${am._count.runs} corrida(s) associada(s). Use status DESABILITADO em vez disso.`);
      return;
    }
    if (!confirm(`Remover associação ${am.material.name} em ${am.equipment.name} (Nível ${am.level})?`)) return;

    const res = await fetch(`/api/materiais/${am.materialId}/analytes/${am.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Erro ao remover");
    } else {
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Carregando analito...
      </div>
    );
  }

  if (!analyte) {
    return (
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
        <span className="material-symbols-outlined text-5xl mb-3 block">error</span>
        <p>Analito não encontrado</p>
        <Link href="/analitos" className="mt-3 inline-block text-primary-500 text-sm font-semibold hover:underline">
          ← Voltar para a lista
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/analitos"
          className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] flex items-center justify-center text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-black dark:text-white">{analyte.name}</h1>
          <p className="text-xs text-gray-400">Editar analito</p>
        </div>
      </div>

      {/* ── Card 1: Analito header ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="bg-danger-600 px-5 py-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-white text-[18px]">biotech</span>
          <h3 className="text-white font-bold text-sm flex-1">Analito</h3>
          <span className="text-white/70 text-xs">Editar analito</span>
        </div>

        <div className="p-5 space-y-4">
          {/* Habilitado */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-sm font-semibold text-black dark:text-white">Habilitado</span>
          </label>

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Analito (Exame) *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: 01. Leucócitos"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>

          {/* Unidade + casas decimais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Unidade de medida *
              </label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="ex: /mm³, g/dL, mg/dL"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Casas decimais * (máx 3)
              </label>
              <select
                value={decimalPlaces}
                onChange={(e) => setDecimalPlaces(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </div>

          {/* Imprecisão máxima + origem */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Imprecisão máxima (%)
              </label>
              <input
                inputMode="decimal"
                value={maxImprecision}
                onChange={(e) => setMaxImprecision(e.target.value)}
                placeholder="ex: 5,5"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Origem da imprecisão
              </label>
              <input
                value={imprecisionSource}
                onChange={(e) => setImprecisionSource(e.target.value)}
                placeholder="ex: Tabela de Variação Biológica, CLIA, RiliBÄK"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 2: Westgard rules ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="bg-gray-100 dark:bg-[#1a1a1a] px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm text-black dark:text-white">
            Defina abaixo quais as regras de Westgard que deseja aplicar
          </h3>
          <button
            onClick={handleResetRules}
            className="text-xs text-danger-600 hover:underline font-semibold"
          >
            Retornar à configuração inicial
          </button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {WESTGARD_RULE_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-gray-400 text-[14px]" title={WESTGARD_RULE_DESCRIPTIONS[key]}>
                    info
                  </span>
                  Regra {key} *
                </label>
                <select
                  value={rules[key]}
                  onChange={(e) => setRules((r) => ({ ...r, [key]: e.target.value as WestgardRuleState }))}
                  className={`w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all font-medium ${
                    rules[key] === "REJECT"
                      ? "border-danger-300 bg-danger-50/30 text-danger-700"
                      : rules[key] === "ALERT"
                      ? "border-warning-300 bg-warning-50/30 text-warning-700"
                      : "border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] text-gray-500"
                  }`}
                >
                  {RULE_STATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Card 3: Materials associated ────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="bg-gray-100 dark:bg-[#1a1a1a] px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm text-black dark:text-white">
            Materiais associados ao analito
            <span className="text-gray-400 font-normal ml-2">({analyte.analyteMaterials.length})</span>
          </h3>
        </div>

        {/* Associate form */}
        <form onSubmit={handleAssociate} className="p-5 border-b border-gray-100 dark:border-[#1a1a1a] bg-gray-50/50 dark:bg-[#1a1a1a]/30 space-y-3">
          <p className="text-xs text-gray-500 mb-2">Adicionar nova associação:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Equipamento</label>
              <select
                value={assocEquipmentId}
                onChange={(e) => setAssocEquipmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              >
                <option value="">Selecione</option>
                {equipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Material</label>
              <select
                value={assocMaterialId}
                onChange={(e) => setAssocMaterialId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              >
                <option value="">Selecione</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.lot ? `— Lote ${m.lot}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nível</label>
              <select
                value={assocLevel}
                onChange={(e) => setAssocLevel(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Média (Xm) — bula</label>
              <input
                inputMode="decimal"
                value={assocXm}
                onChange={(e) => setAssocXm(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Desvio padrão (DP) — bula</label>
              <input
                inputMode="decimal"
                value={assocDP}
                onChange={(e) => setAssocDP(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={associating || !assocEquipmentId || !assocMaterialId}
              className="px-4 py-2 rounded-lg bg-success-600 hover:bg-success-700 text-white text-sm font-semibold shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {associating ? (
                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">link</span>
              )}
              Associar Material
            </button>
          </div>
          {assocError && <p className="text-xs text-danger-600">{assocError}</p>}
        </form>

        {/* Materials table */}
        {analyte.analyteMaterials.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400">
            <span className="material-symbols-outlined text-3xl mb-2 block">link_off</span>
            <p className="text-sm">Nenhum material associado ainda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">Material</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">Equipamento</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">Situação</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">Nível</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">Xm</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">DP</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center w-16">Ações</th>
                </tr>
              </thead>
              <tbody>
                {analyte.analyteMaterials.map((am) => (
                  <tr key={am.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all">
                    <td className="px-4 py-2.5 font-medium text-black dark:text-white">
                      <div>
                        {am.material.name}
                        {am.material.lot && <span className="text-gray-400 ml-1 text-xs">({am.material.lot})</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 text-xs">{am.equipment.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        am.status === "PRONTO"
                          ? "bg-success-50 text-success-700"
                          : am.status === "PREPARO"
                          ? "bg-warning-50 text-warning-700"
                          : am.status === "EXPIRADO"
                          ? "bg-danger-50 text-danger-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {am.status === "PRONTO" ? "Pronto" : am.status.charAt(0) + am.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-[#1a1a1a] text-xs font-semibold">
                        {am.level}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs">
                      {am.manufacturerMean !== null
                        ? am.manufacturerMean.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-xs">
                      {am.manufacturerSD !== null
                        ? am.manufacturerSD.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/materiais/${am.materialId}`}
                          title="Editar material"
                          className="w-7 h-7 rounded text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </Link>
                        <button
                          onClick={() => handleRemoveAssoc(am)}
                          title={am._count.runs > 0 ? `${am._count.runs} corrida(s) — não pode remover` : "Remover associação"}
                          className="w-7 h-7 rounded text-gray-400 hover:text-danger-500 hover:bg-danger-50 transition-all flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
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

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2 sticky bottom-0 bg-gray-50 dark:bg-[#0c0b0b] -mx-6 px-6 py-3 border-t border-gray-100 dark:border-[#1a1a1a]">
        {saveMessage && (
          <span className={`text-sm font-medium ${saveMessage.type === "ok" ? "text-success-600" : "text-danger-600"}`}>
            {saveMessage.text}
          </span>
        )}
        <button
          onClick={() => router.push("/analitos")}
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-[#1a1a1a] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg alchemy-gradient text-white text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {saving ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              Salvando…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]">save</span>
              Salvar Analito
            </>
          )}
        </button>
      </div>
    </div>
  );
}
