"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Equipment { id: string; name: string }

interface AnalyteOption {
  id: string;
  name: string;
  unit: string | null;
  equipment: { id: string; name: string };
}

interface AnalyteMaterialItem {
  id: string;
  analyteId: string;
  equipmentId: string;
  level: number;
  manufacturerMean: number | null;
  manufacturerSD: number | null;
  status: string;
  analyte: { id: string; name: string; unit: string | null };
  equipment: { id: string; name: string };
  _count: { runs: number };
}

interface MaterialFull {
  id: string;
  name: string;
  lot: string | null;
  generation: string | null;
  expiresAt: string | null;
  active: boolean;
  fabricante: string | null;
  alertEnabled: boolean;
  alertDays: number;
  naoEnsaiado: boolean;
  analyteMaterials: AnalyteMaterialItem[];
}

export default function MaterialEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [material, setMaterial] = useState<MaterialFull | null>(null);
  const [analytes, setAnalytes] = useState<AnalyteOption[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state — Material header
  const [active, setActive] = useState(true);
  const [name, setName] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [lot, setLot] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [alertDays, setAlertDays] = useState("5");
  const [naoEnsaiado, setNaoEnsaiado] = useState(false);

  const [savingHeader, setSavingHeader] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Associate form state
  const [assocAnalyteId, setAssocAnalyteId] = useState("");
  const [assocEquipmentId, setAssocEquipmentId] = useState("");
  const [assocLevel, setAssocLevel] = useState("1");
  const [assocXm, setAssocXm] = useState("");
  const [assocDP, setAssocDP] = useState("");
  const [associating, setAssociating] = useState(false);
  const [assocError, setAssocError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [matRes, anRes, eqRes] = await Promise.all([
      fetch(`/api/materiais/${id}`).then((r) => r.json()).catch(() => null),
      fetch("/api/analitos").then((r) => r.json()).catch(() => []),
      fetch("/api/equipamentos").then((r) => r.json()).catch(() => []),
    ]);

    if (!matRes || matRes.error) {
      setMaterial(null);
      setLoading(false);
      return;
    }

    const m: MaterialFull = matRes;
    setMaterial(m);
    setActive(m.active);
    setName(m.name);
    setFabricante(m.fabricante ?? "");
    setLot(m.lot ?? "");
    setExpiresAt(m.expiresAt ? m.expiresAt.slice(0, 10) : "");
    setAlertEnabled(m.alertEnabled);
    setAlertDays(String(m.alertDays));
    setNaoEnsaiado(m.naoEnsaiado);

    if (Array.isArray(anRes)) {
      setAnalytes(
        (anRes as AnalyteOption[])
          .filter((a) => (a as { active?: boolean }).active !== false)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
    }
    if (Array.isArray(eqRes)) {
      setEquipments(
        (eqRes as Array<Equipment & { active?: boolean }>)
          .filter((e) => e.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Save header
  const handleSaveHeader = async () => {
    setSavingHeader(true);
    setSaveMessage(null);

    const res = await fetch(`/api/materiais/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        fabricante: fabricante.trim(),
        lot: lot.trim(),
        expiresAt: expiresAt || null,
        active,
        alertEnabled,
        alertDays: Number(alertDays) || 0,
        naoEnsaiado,
      }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSaveMessage({ type: "error", text: d.error ?? "Erro ao salvar" });
    } else {
      setSaveMessage({ type: "ok", text: "Material atualizado" });
      load();
      setTimeout(() => setSaveMessage(null), 2500);
    }
    setSavingHeader(false);
  };

  // Associate analyte
  const handleAssociate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssocError(null);

    if (!assocAnalyteId) { setAssocError("Selecione um analito"); return; }
    if (!assocEquipmentId) { setAssocError("Selecione um equipamento"); return; }

    setAssociating(true);
    const res = await fetch(`/api/materiais/${id}/analytes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analyteId: assocAnalyteId,
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
      // Reset form
      setAssocAnalyteId("");
      setAssocEquipmentId("");
      setAssocLevel("1");
      setAssocXm("");
      setAssocDP("");
      load();
    }
    setAssociating(false);
  };

  const handleRemoveAssoc = async (am: AnalyteMaterialItem) => {
    if (!confirm(`Remover associação ${am.analyte.name} (Nível ${am.level}) em ${am.equipment.name}?`)) return;
    const res = await fetch(`/api/materiais/${id}/analytes/${am.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Erro ao remover");
    } else {
      load();
    }
  };

  // Filter analytes by selected equipment
  const analyteOptionsForSelectedEq = analytes.filter((a) => {
    if (!assocEquipmentId) return true;
    return a.equipment.id === assocEquipmentId;
  });

  // Deduplicate analyte names for the dropdown (by name+unit)
  const uniqueAnalytes = Array.from(
    new Map(analyteOptionsForSelectedEq.map((a) => [`${a.name}||${a.unit ?? ""}`, a])).values()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Carregando material...
      </div>
    );
  }

  if (!material) {
    return (
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center text-gray-400">
        <span className="material-symbols-outlined text-5xl mb-3 block">error</span>
        <p>Material não encontrado</p>
        <Link href="/materiais" className="mt-3 inline-block text-primary-500 text-sm font-semibold hover:underline">
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
          href="/materiais"
          className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] flex items-center justify-center text-gray-500 hover:bg-primary-50 hover:text-primary-500 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-black dark:text-white">{material.name}</h1>
          <p className="text-xs text-gray-400">Edição de Material</p>
        </div>
      </div>

      {/* ── Card 1: Material header ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="bg-danger-600 px-5 py-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-white text-[18px]">science</span>
          <h3 className="text-white font-bold text-sm flex-1">Material</h3>
          <span className="text-white/70 text-xs">Edição do Material</span>
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

          {/* Material name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Material *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do material"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>

          {/* Fabricante */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fabricante *</label>
            <input
              value={fabricante}
              onChange={(e) => setFabricante(e.target.value)}
              placeholder="ex: ControlLab, Bio-Rad"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>

          {/* Lote */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lote *</label>
            <input
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              placeholder="ex: VCB 144"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>

          {/* Validade + alerta */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Validade *</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-6 md:pt-0 md:pb-2.5">
              <input
                type="checkbox"
                checked={alertEnabled}
                onChange={(e) => setAlertEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Alertar</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={alertDays}
                onChange={(e) => setAlertDays(e.target.value)}
                disabled={!alertEnabled}
                className="w-20 px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all disabled:opacity-50"
              />
              <span className="text-sm text-gray-500">dias de antecedência</span>
            </div>
          </div>

          {/* Não ensaiado */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={naoEnsaiado}
              onChange={(e) => setNaoEnsaiado(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Material não ensaiado <span className="text-gray-400">(in-house, sem valores de bula)</span>
            </span>
          </label>

          {/* Save header */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-[#1a1a1a]">
            {saveMessage && (
              <span className={`text-xs font-medium ${saveMessage.type === "ok" ? "text-success-600" : "text-danger-600"}`}>
                {saveMessage.text}
              </span>
            )}
            <button
              onClick={handleSaveHeader}
              disabled={savingHeader}
              className="px-4 py-2 rounded-lg alchemy-gradient text-white text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {savingHeader ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                  Salvando…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Salvar Material
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Card 2: Associate analyte form ─────────────────────────────────── */}
      {!naoEnsaiado && (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
          <div className="bg-gray-100 dark:bg-[#1a1a1a] px-5 py-3">
            <h3 className="font-bold text-sm text-black dark:text-white">
              Selecione um analito e insira os valores de bula
            </h3>
          </div>

          <form onSubmit={handleAssociate} className="p-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Equipamento
                </label>
                <select
                  value={assocEquipmentId}
                  onChange={(e) => { setAssocEquipmentId(e.target.value); setAssocAnalyteId(""); }}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                >
                  <option value="">Selecione um equipamento</option>
                  {equipments.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Selecionar analito
                </label>
                <select
                  value={assocAnalyteId}
                  onChange={(e) => setAssocAnalyteId(e.target.value)}
                  disabled={!assocEquipmentId}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all disabled:opacity-50"
                >
                  <option value="">
                    {!assocEquipmentId ? "Escolha o equipamento primeiro" : "Pesquise pelo nome do analito"}
                  </option>
                  {uniqueAnalytes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.unit ? `(${a.unit})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Média (Xm)</label>
                <input
                  inputMode="decimal"
                  value={assocXm}
                  onChange={(e) => setAssocXm(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Desvio padrão (DP)</label>
                <input
                  inputMode="decimal"
                  value={assocDP}
                  onChange={(e) => setAssocDP(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nível do controle</label>
                <div className="flex items-center gap-3 pt-1.5">
                  {(["1", "2", "3"] as const).map((n) => (
                    <label key={n} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="level"
                        value={n}
                        checked={assocLevel === n}
                        onChange={() => setAssocLevel(n)}
                        className="w-4 h-4 text-primary-500 focus:ring-primary-500"
                      />
                      <span className="text-sm">{n}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={associating || !assocAnalyteId || !assocEquipmentId}
                className="px-4 py-2.5 rounded-lg bg-success-600 hover:bg-success-700 text-white text-sm font-semibold shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {associating ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">link</span>
                )}
                ASSOCIAR
              </button>
            </div>

            {assocError && <p className="text-xs text-danger-600 mt-1">{assocError}</p>}
          </form>
        </div>
      )}

      {/* ── Card 3: Analytes associated table ──────────────────────────────── */}
      <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
        <div className="bg-gray-100 dark:bg-[#1a1a1a] px-5 py-3">
          <h3 className="font-bold text-sm text-black dark:text-white">
            Analitos associados a este material
            <span className="text-gray-400 font-normal ml-2">
              ({material.analyteMaterials.length})
            </span>
          </h3>
        </div>

        {material.analyteMaterials.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400">
            <span className="material-symbols-outlined text-3xl mb-2 block">link_off</span>
            <p className="text-sm">Nenhum analito associado</p>
            {!naoEnsaiado && (
              <p className="text-xs mt-1">Use o formulário acima para associar</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left w-10">#</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">Analito (Exame)</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">Equipamento</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">Xm</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">DP</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">Nível</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center">Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-center w-16">Ações</th>
                </tr>
              </thead>
              <tbody>
                {material.analyteMaterials.map((am, i) => (
                  <tr key={am.id} className="border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all">
                    <td className="px-4 py-2.5 text-xs text-gray-400 font-semibold">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-black dark:text-white">
                      {am.analyte.name}
                      {am.analyte.unit && <span className="text-gray-400 ml-1 text-xs">({am.analyte.unit})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 text-xs">{am.equipment.name}</td>
                    <td className="px-4 py-2.5 text-center font-mono">
                      {am.manufacturerMean !== null
                        ? am.manufacturerMean.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono">
                      {am.manufacturerSD !== null
                        ? am.manufacturerSD.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-[#1a1a1a] text-xs font-semibold">
                        {am.level}
                      </span>
                    </td>
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
                        {am.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
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

      {/* Footer back button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={() => router.push("/materiais")}
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-[#1a1a1a] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Voltar para a lista
        </button>
      </div>
    </div>
  );
}
