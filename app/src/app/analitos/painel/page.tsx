"use client";

import LeveyJenningsChart from "@/components/LeveyJenningsChart";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyteRaw {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  active: boolean;
  equipment: { id: string; name: string };
  material: { id: string; name: string };
  _count: { stats: number };
}

interface RunRow {
  no: number;
  values: (number | null)[];
  statuses: (string | null)[];
  violations: (string[] | null)[];
  runIds: (string | null)[];
  runAt: (string | null)[];
}

interface LevelStats {
  statPeriod: { mean: number; sd: number; cv: number; n: number } | null;
  currentStats: { mean: number; sd: number; cv: number; n: number } | null;
}

interface PainelData {
  analytes: AnalyteRaw[];
  rows: RunRow[];
  stats: LevelStats[];
  total: number;
}

// ─── Sidebar grouping ─────────────────────────────────────────────────────────

interface EquipmentGroup {
  equipmentId: string;
  equipmentName: string;
  ids: string[]; // analyte IDs (all levels, all conditions)
  hasAtivo: boolean;
  hasPreparo: boolean;
}

interface NameGroup {
  name: string;
  unit: string | null;
  equipmentGroups: EquipmentGroup[];
}

function groupAnalytes(items: AnalyteRaw[]): NameGroup[] {
  const byName = new Map<string, NameGroup>();

  for (const a of items) {
    const key = `${a.name}||${a.unit ?? ""}`;
    if (!byName.has(key)) byName.set(key, { name: a.name, unit: a.unit, equipmentGroups: [] });
    const ng = byName.get(key)!;

    let eg = ng.equipmentGroups.find((g) => g.equipmentId === a.equipment.id);
    if (!eg) {
      eg = { equipmentId: a.equipment.id, equipmentName: a.equipment.name, ids: [], hasAtivo: false, hasPreparo: false };
      ng.equipmentGroups.push(eg);
    }
    eg.ids.push(a.id);
    if (a._count.stats > 0) eg.hasAtivo = true;
    else eg.hasPreparo = true;
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  label,
  optA,
  optB,
  value,
  onChange,
}: {
  label: string;
  optA: string;
  optB: string;
  value: boolean; // false = optA, true = optB
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`font-medium ${!value ? "text-black dark:text-white" : "text-gray-400"}`}>{optA}</span>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative w-8 h-4 rounded-full transition-colors ${value ? "bg-danger-500" : "bg-gray-300 dark:bg-gray-600"}`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className={`font-medium ${value ? "text-black dark:text-white" : "text-gray-400"}`}>{optB}</span>
      </div>
    </div>
  );
}

// ─── Level header color ────────────────────────────────────────────────────────

const LEVEL_COLORS = ["text-danger-600", "text-primary-600", "text-success-600"];
const LEVEL_BG = ["bg-danger-50 dark:bg-danger-900/20", "bg-primary-50 dark:bg-primary-900/20", "bg-success-50 dark:bg-success-900/20"];

// ─── Main inner component ─────────────────────────────────────────────────────

function PainelControleInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // All analytes from API
  const [allAnalytes, setAllAnalytes] = useState<AnalyteRaw[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Sidebar state
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Selection state: (name||unit, equipmentId)
  const [selectedKey, setSelectedKey] = useState<string>(""); // "name||unit||equipmentId"

  // Toggles
  const [condAtivo, setCondAtivo] = useState(true); // false=Preparo, true=Ativo
  const [chartLevelIdx, setChartLevelIdx] = useState(0); // which level to show in chart

  // Panel data
  const [painelData, setPainelData] = useState<PainelData | null>(null);
  const [loadingPanel, setLoadingPanel] = useState(false);

  // New run entry
  const [newValues, setNewValues] = useState<string[]>(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Edit mode
  const [editRunIdx, setEditRunIdx] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<string[]>(["", "", ""]);

  // ── Load all analytes ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/analitos")
      .then((r) => r.json())
      .then((list: AnalyteRaw[]) => {
        setAllAnalytes(list);
        setLoadingList(false);

        // Auto-select from URL params
        const paramName = searchParams.get("name");
        const paramEq = searchParams.get("eq");
        if (paramName && paramEq) {
          const unit = list.find((a) => a.name === paramName)?.unit ?? "";
          const key = `${paramName}||${unit}||${paramEq}`;
          setSelectedKey(key);
          const nameKey = `${paramName}||${unit}`;
          setExpandedNames(new Set([nameKey]));
        } else {
          // Auto-select first group
          const groups = groupAnalytes(list);
          if (groups.length > 0 && groups[0].equipmentGroups.length > 0) {
            const g = groups[0];
            const eg = g.equipmentGroups[0];
            const key = `${g.name}||${g.unit ?? ""}||${eg.equipmentId}`;
            setSelectedKey(key);
            setExpandedNames(new Set([`${g.name}||${g.unit ?? ""}`]));
          }
        }
      });
  }, [searchParams]);

  // ── Groups ────────────────────────────────────────────────────────────────────

  const groups = useMemo(() => groupAnalytes(allAnalytes), [allAnalytes]);

  const filteredGroups = useMemo(() => {
    const q = sidebarSearch.toLowerCase().trim();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        equipmentGroups: g.equipmentGroups.filter(
          (eg) => eg.equipmentName.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.name.toLowerCase().includes(q) || g.equipmentGroups.length > 0);
  }, [groups, sidebarSearch]);

  // ── Selected group ───────────────────────────────────────────────────────────

  const [selName, selUnit, selEqId] = useMemo(() => selectedKey.split("||"), [selectedKey]);

  // IDs of analytes for selected condition (Ativo or Preparo)
  const selectedAnalyteIds = useMemo(() => {
    if (!selName || !selEqId) return [];
    const matches = allAnalytes.filter(
      (a) =>
        a.name === selName &&
        (a.unit ?? "") === (selUnit ?? "") &&
        a.equipment.id === selEqId &&
        (condAtivo ? a._count.stats > 0 : a._count.stats === 0)
    );
    return matches.sort((a, b) => a.level - b.level).map((a) => a.id);
  }, [allAnalytes, selName, selUnit, selEqId, condAtivo]);

  // Check if both conditions exist for selected group
  const selectedGroup = useMemo(() => {
    if (!selName || !selEqId) return null;
    for (const g of groups) {
      if (g.name === selName && (g.unit ?? "") === (selUnit ?? "")) {
        return g.equipmentGroups.find((eg) => eg.equipmentId === selEqId) ?? null;
      }
    }
    return null;
  }, [groups, selName, selUnit, selEqId]);

  // ── Load panel data ──────────────────────────────────────────────────────────

  const loadPanel = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setPainelData(null); return; }
    setLoadingPanel(true);
    setSaveError(null);
    const res = await fetch(`/api/painel/runs?ids=${ids.join(",")}`);
    if (res.ok) {
      const data: PainelData = await res.json();
      setPainelData(data);
      setPage(Math.ceil(data.total / PAGE_SIZE) || 1);
      setChartLevelIdx(0);
    } else {
      setPainelData(null);
    }
    setLoadingPanel(false);
  }, []);

  useEffect(() => {
    if (selectedAnalyteIds.length > 0) loadPanel(selectedAnalyteIds);
    else setPainelData(null);
  }, [selectedAnalyteIds, loadPanel]);

  // ── Save new run ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!painelData) return;
    const entries = painelData.analytes.map((a, i) => {
      const raw = newValues[i]?.replace(",", ".").trim();
      return { analyteId: a.id, value: raw ? parseFloat(raw) : NaN };
    });

    const hasValue = entries.some((e) => !isNaN(e.value));
    if (!hasValue) { setSaveError("Informe ao menos um valor"); return; }
    const invalid = entries.some((e) => !isNaN(e.value) === false && newValues[entries.indexOf(e)]?.trim() !== "");
    if (invalid) { setSaveError("Valor inválido"); return; }

    setSaving(true);
    setSaveError(null);

    const results = await Promise.all(
      entries
        .filter((e) => !isNaN(e.value))
        .map((e) =>
          fetch("/api/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analyteId: e.analyteId, value: e.value }),
          })
        )
    );

    const failed = results.find((r) => !r.ok);
    if (failed) {
      const d = await failed.json();
      setSaveError(d.error ?? "Erro ao salvar");
    } else {
      setNewValues(["", "", ""]);
      loadPanel(selectedAnalyteIds);
    }
    setSaving(false);
  };

  // ── Paginated rows ────────────────────────────────────────────────────────────

  const rows = painelData?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const analytes = painelData?.analytes ?? [];
  const levelCount = analytes.length;

  // ── Chart data ────────────────────────────────────────────────────────────────

  const chartValues = rows.map((r) => r.values[chartLevelIdx]).filter((v): v is number => v !== null);
  const chartStat = painelData?.stats[chartLevelIdx];
  const chartMean = chartStat?.statPeriod?.mean ?? chartStat?.currentStats?.mean ?? 0;
  const chartSd = chartStat?.statPeriod?.sd ?? chartStat?.currentStats?.sd ?? 1;

  // ── Select handler ────────────────────────────────────────────────────────────

  const handleSelect = (nameKey: string, eqId: string, name: string, unit: string | null) => {
    const key = `${name}||${unit ?? ""}||${eqId}`;
    setSelectedKey(key);
    setSidebarOpen(false);
    setPage(1);
    setNewValues(["", "", ""]);
    setEditRunIdx(null);
    // Update URL
    router.replace(`/analitos/painel?name=${encodeURIComponent(name)}&eq=${encodeURIComponent(eqId)}`, { scroll: false });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const isSetupPhase = !painelData || painelData.stats.every((s) => !s.statPeriod);
  const setupCount = painelData ? Math.max(...painelData.analytes.map((_, i) => painelData.rows.filter((r) => r.values[i] !== null).length), 0) : 0;

  return (
    <div className="flex h-full min-h-screen -m-6 overflow-hidden">
      {/* ── Sidebar (analyte tree) ─────────────────────────────────────────── */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 lg:relative lg:inset-auto
          w-64 bg-white dark:bg-[#141414] border-r border-gray-100 dark:border-[#1a1a1a]
          flex flex-col overflow-hidden transition-transform duration-200
          ${sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ top: 0 }}
      >
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#1a1a1a] flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-500 text-[20px]">biotech</span>
          <span className="font-bold text-sm text-black dark:text-white flex-1">por Analitos</span>
          <button
            className="lg:hidden text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100 dark:border-[#1a1a1a]">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]">
              search
            </span>
            <input
              type="search"
              placeholder="Pesquisar..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] focus:outline-none focus:ring-1 focus:ring-primary-500/30 transition-all"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingList ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-xs gap-1">
              <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              Carregando...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Nenhum analito encontrado</div>
          ) : (
            filteredGroups.map((g, gi) => {
              const nameKey = `${g.name}||${g.unit ?? ""}`;
              const isExpanded = expandedNames.has(nameKey);
              return (
                <div key={nameKey}>
                  {/* Name row */}
                  <button
                    onClick={() =>
                      setExpandedNames((prev) => {
                        const next = new Set(prev);
                        if (next.has(nameKey)) next.delete(nameKey);
                        else next.add(nameKey);
                        return next;
                      })
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all"
                  >
                    <span className="text-xs font-bold text-gray-400 w-6 shrink-0">
                      {String(gi + 1).padStart(2, "0")}.
                    </span>
                    <span className="flex-1 text-xs font-semibold text-black dark:text-white truncate">
                      {g.name}
                      {g.unit && <span className="text-gray-400 font-normal ml-1">({g.unit})</span>}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium shrink-0">
                      {g.equipmentGroups.length}
                    </span>
                    <span className="material-symbols-outlined text-[14px] text-gray-400 shrink-0 transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "" }}>
                      expand_more
                    </span>
                  </button>

                  {/* Equipment sub-items */}
                  {isExpanded && g.equipmentGroups.map((eg) => {
                    const isSelected = selectedKey === `${g.name}||${g.unit ?? ""}||${eg.equipmentId}`;
                    return (
                      <button
                        key={eg.equipmentId}
                        onClick={() => handleSelect(nameKey, eg.equipmentId, g.name, g.unit)}
                        className={`w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-left transition-all ${
                          isSelected
                            ? "bg-primary-50 dark:bg-primary-900/20 border-r-2 border-primary-500"
                            : "hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                        }`}
                      >
                        <span className={`material-symbols-outlined text-[14px] ${isSelected ? "text-primary-500" : "text-gray-400"}`}>
                          precision_manufacturing
                        </span>
                        <span className={`flex-1 text-xs truncate ${isSelected ? "font-semibold text-primary-600 dark:text-primary-400" : "text-gray-600 dark:text-gray-400"}`}>
                          {eg.equipmentName}
                        </span>
                        <div className="flex gap-0.5">
                          {eg.hasAtivo && (
                            <span className="w-2 h-2 rounded-full bg-success-500" title="Ativo" />
                          )}
                          {eg.hasPreparo && (
                            <span className="w-2 h-2 rounded-full bg-warning-400" title="Preparo" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-auto bg-gray-50 dark:bg-[#0c0b0b]">
        {/* Setup phase banner */}
        {painelData && isSetupPhase && (
          <div className="bg-warning-50 dark:bg-warning-900/20 border-b border-warning-200 px-6 py-2.5 flex items-center gap-2 text-xs text-warning-800 dark:text-warning-200">
            <span className="material-symbols-outlined text-warning-500 text-[16px]">info</span>
            Seus dados estão na fase em <strong className="ml-1">preparo</strong>. Após 20 entradas os controles podem ser ativados.
            Os testes das regras de Westgard ocorrem somente com os dados na fase de ativos.
          </div>
        )}

        <div className="flex-1 p-6 space-y-5 max-w-full">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Hamburger + title */}
            <div className="flex items-center gap-3 flex-1">
              <button
                className="lg:hidden w-9 h-9 rounded-lg bg-white dark:bg-[#141414] border border-gray-100 dark:border-[#1a1a1a] flex items-center justify-center text-gray-500 hover:text-primary-500 transition-all"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="material-symbols-outlined text-[20px]">menu</span>
              </button>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Painel de Controle</p>
                {selName ? (
                  <h1 className="text-lg font-bold text-black dark:text-white leading-tight">
                    {selName}
                    {selUnit && <span className="text-gray-400 font-normal ml-1 text-base">({selUnit})</span>}
                    {selectedGroup && (
                      <span className="text-gray-400 font-normal ml-2">— {selectedGroup.equipmentName}</span>
                    )}
                  </h1>
                ) : (
                  <h1 className="text-lg font-bold text-gray-400">Selecione um analito</h1>
                )}
              </div>
            </div>

            {/* Toggles */}
            {selName && (
              <div className="flex items-center gap-4 flex-wrap">
                {/* Analito em observação */}
                <label className="flex flex-col items-center gap-1 cursor-pointer">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Analito em observação</span>
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                </label>

                <div className="w-px h-8 bg-gray-200 dark:bg-[#1a1a1a]" />

                {/* Condição do controle */}
                {selectedGroup && (selectedGroup.hasAtivo || selectedGroup.hasPreparo) && (
                  <Toggle
                    label="Condição do controle"
                    optA="Preparo"
                    optB="Ativo"
                    value={condAtivo}
                    onChange={(v) => { setCondAtivo(v); setPage(1); setNewValues(["", "", ""]); }}
                  />
                )}
              </div>
            )}
          </div>

          {/* No selection */}
          {!selName && !loadingList && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <span className="material-symbols-outlined text-5xl mb-3">monitoring</span>
              <p className="text-sm font-medium">Selecione um analito no menu lateral</p>
            </div>
          )}

          {/* No analytes for this condition */}
          {selName && !loadingPanel && selectedAnalyteIds.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <span className="material-symbols-outlined text-4xl mb-2">info</span>
              <p className="text-sm font-medium">
                Nenhum analito em fase de {condAtivo ? "Ativo" : "Preparo"} para este equipamento.
              </p>
              {selectedGroup && (
                <button
                  onClick={() => setCondAtivo(!condAtivo)}
                  className="mt-3 text-primary-500 text-sm font-semibold hover:underline"
                >
                  Alternar para {condAtivo ? "Preparo" : "Ativo"}
                </button>
              )}
            </div>
          )}

          {/* Loading panel */}
          {loadingPanel && (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Carregando dados...
            </div>
          )}

          {/* Panel content */}
          {!loadingPanel && painelData && (
            <>
              {/* Grid: Corridas + Chart */}
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                {/* ── Corridas table ─────────────────────────────────────── */}
                <div className="xl:col-span-3 bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
                  {/* Table header */}
                  <div className="bg-danger-600 px-5 py-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-white text-[18px]">table_rows</span>
                    <h3 className="text-white font-bold text-sm flex-1">Corridas</h3>
                    <span className="text-white/60 text-xs">{rows.length} registros</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-[#1a1a1a] sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 w-10">#</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 w-16">Editar</th>
                          {analytes.map((a, i) => (
                            <th key={a.id} className="px-3 py-3 text-center text-xs font-semibold min-w-[90px]">
                              <div className="flex items-center justify-center gap-1.5">
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={a._count.stats > 0}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-danger-600 focus:ring-danger-500 cursor-default"
                                />
                                <span className={a._count.stats > 0 ? "text-danger-700" : "text-gray-400"}>
                                  Nível {a.level}
                                </span>
                                {a._count.stats > 0 && (
                                  <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide">
                                    ATIVAR
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                          {/* Placeholder for empty levels */}
                          {Array.from({ length: 3 - levelCount }).map((_, i) => (
                            <th key={`empty-${i}`} className="px-3 py-3 text-center text-xs font-semibold text-gray-300 min-w-[80px]">
                              <div className="flex items-center justify-center gap-1.5">
                                <input type="checkbox" readOnly checked={false} className="w-3.5 h-3.5 rounded border-gray-300 cursor-default" />
                                <span>Nível {levelCount + i + 1}</span>
                              </div>
                            </th>
                          ))}
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Alertas</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 w-12">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row) => {
                          const anyViolation = row.violations.some((v) => v && v.length > 0);
                          const isEditing = editRunIdx === row.no - 1;
                          return (
                            <tr
                              key={row.no}
                              className={`border-t border-gray-100 dark:border-[#1a1a1a] transition-colors ${
                                anyViolation ? "bg-danger-50/30 dark:bg-danger-900/10" : "hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                              }`}
                            >
                              <td className="px-3 py-2.5 text-xs font-semibold text-gray-400">{row.no}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => {
                                      setEditRunIdx(row.no - 1);
                                      setEditValues(row.values.map((v) => (v !== null ? String(v) : "")));
                                    }}
                                    className="w-6 h-6 rounded text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all flex items-center justify-center"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">edit</span>
                                  </button>
                                  <button className="w-6 h-6 rounded text-gray-400 hover:text-danger-500 hover:bg-danger-50 transition-all flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                  </button>
                                </div>
                              </td>
                              {analytes.map((a, i) => (
                                <td key={a.id} className={`px-3 py-2.5 text-center font-semibold ${LEVEL_COLORS[i]}`}>
                                  {row.values[i] !== null
                                    ? Number(row.values[i]).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                                    : <span className="text-gray-300 font-normal">—</span>}
                                </td>
                              ))}
                              {Array.from({ length: 3 - levelCount }).map((_, i) => (
                                <td key={`empty-${i}`} className="px-3 py-2.5 text-center text-gray-300">—</td>
                              ))}
                              <td className="px-3 py-2.5 text-xs">
                                {anyViolation && row.violations.map((v, i) =>
                                  v && v.length > 0 ? (
                                    <div key={i} className="flex flex-wrap gap-0.5">
                                      {v.map((rule) => (
                                        <span key={rule} className="bg-danger-100 text-danger-700 text-[10px] font-bold px-1 py-0.5 rounded">
                                          {rule}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button className="w-6 h-6 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all flex items-center justify-center mx-auto">
                                  <span className="material-symbols-outlined text-[14px]">chat</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* New run entry row */}
                        <tr className="border-t-2 border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10">
                          <td className="px-3 py-2.5 text-xs font-semibold text-gray-400">{rows.length + 1}</td>
                          <td />
                          {analytes.map((a, i) => (
                            <td key={a.id} className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={newValues[i] ?? ""}
                                onChange={(e) => {
                                  const v = [...newValues];
                                  v[i] = e.target.value;
                                  setNewValues(v);
                                  setSaveError(null);
                                }}
                                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                                placeholder="0,000"
                                className="w-full px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-[#141414] text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                              />
                            </td>
                          ))}
                          {Array.from({ length: 3 - levelCount }).map((_, i) => (
                            <td key={`empty-${i}`} />
                          ))}
                          <td className="px-3 py-2" colSpan={2}>
                            <button
                              onClick={handleSave}
                              disabled={saving || newValues.every((v) => !v?.trim())}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-danger-600 hover:bg-danger-700 disabled:opacity-50 transition-all"
                            >
                              {saving ? (
                                <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                              ) : (
                                <span className="material-symbols-outlined text-[14px]">save</span>
                              )}
                              SALVAR
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {saveError && (
                    <div className="px-5 pb-3 text-xs text-danger-600">{saveError}</div>
                  )}

                  {/* Pagination */}
                  <div className="px-5 py-3 border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between text-xs text-gray-500">
                    <span>{rows.length} corrida{rows.length !== 1 ? "s" : ""} no total</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={PAGE_SIZE}
                        onChange={() => {}}
                        className="px-2 py-1 rounded border border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0c0b0b] text-xs focus:outline-none"
                      >
                        <option>10</option>
                      </select>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 dark:hover:bg-[#1a1a1a] disabled:opacity-30 transition-all"
                      >
                        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                      </button>
                      <span className="font-medium text-black dark:text-white">{page} / {totalPages}</span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 dark:hover:bg-[#1a1a1a] disabled:opacity-30 transition-all"
                      >
                        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Levey-Jennings chart ─────────────────────────────────── */}
                <div className="xl:col-span-2 flex flex-col gap-5">
                  <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden flex-1">
                    <div className="bg-danger-600 px-5 py-3 flex items-center justify-between">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">monitoring</span>
                        Levey-Jennings
                      </h3>
                      <div className="flex items-center gap-2">
                        {/* Level selector buttons */}
                        {analytes.map((a, i) => (
                          <button
                            key={a.id}
                            onClick={() => setChartLevelIdx(i)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                              chartLevelIdx === i
                                ? "bg-white text-danger-600"
                                : "bg-white/20 text-white hover:bg-white/30"
                            }`}
                          >
                            N{a.level}
                          </button>
                        ))}
                        <button className="w-6 h-6 rounded flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all">
                          <span className="material-symbols-outlined text-[16px]">search</span>
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      {chartValues.length >= 2 ? (
                        <LeveyJenningsChart
                          mean={chartMean}
                          sd={chartSd}
                          values={chartValues}
                          height={240}
                        />
                      ) : (
                        <div className="h-60 flex flex-col items-center justify-center text-gray-400">
                          <span className="material-symbols-outlined text-4xl mb-2">monitoring</span>
                          <p className="text-xs text-center">Mínimo de 2 corridas para exibir o gráfico</p>
                          {isSetupPhase && (
                            <p className="text-xs text-center mt-1 text-warning-600">
                              {setupCount}/20 corridas na fase de preparo
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Dados dos controles ─────────────────────────────── */}
                  <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
                    <div className="bg-danger-600 px-5 py-3">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">analytics</span>
                        Dados dos controles
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-400 font-semibold w-16">#</th>
                            {analytes.map((a) => (
                              <th key={a.id} className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 font-semibold">
                                Nível {a.level}
                              </th>
                            ))}
                            {Array.from({ length: 3 - levelCount }).map((_, i) => (
                              <th key={`empty-h-${i}`} className="px-3 py-2 text-center text-gray-300 font-semibold">
                                Nível {levelCount + i + 1}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Uso group */}
                          <StatsGroupRow
                            group="Uso"
                            label="Média"
                            values={painelData.stats.map((s) => s.statPeriod?.mean ?? null)}
                            totalLevels={3}
                            highlight={false}
                            rowSpan={2}
                          />
                          <StatsDataRow
                            label="Desvio Padrão"
                            values={painelData.stats.map((s) => s.statPeriod?.sd ?? null)}
                            totalLevels={3}
                            highlight={false}
                          />

                          {/* Corrente group */}
                          <StatsGroupRow
                            group="Corrente"
                            label="Média"
                            values={painelData.stats.map((s) => s.currentStats?.mean ?? null)}
                            totalLevels={3}
                            highlight
                            rowSpan={4}
                          />
                          <StatsDataRow
                            label="Desvio Padrão"
                            values={painelData.stats.map((s) => s.currentStats?.sd ?? null)}
                            totalLevels={3}
                            highlight
                          />
                          <StatsDataRow
                            label="Coef. de Variação"
                            values={painelData.stats.map((s) => s.currentStats?.cv ?? null)}
                            totalLevels={3}
                            highlight
                            isCV
                          />
                          <StatsDataRow
                            label="Nº de corridas"
                            values={painelData.stats.map((s) => s.currentStats?.n ?? null)}
                            totalLevels={3}
                            highlight
                            isInt
                          />
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stats table helpers ──────────────────────────────────────────────────────

function StatsGroupRow({
  group,
  label,
  values,
  totalLevels,
  highlight,
  rowSpan,
}: {
  group: string;
  label: string;
  values: (number | null)[];
  totalLevels: number;
  highlight: boolean;
  rowSpan: number;
}) {
  return (
    <tr className={`border-t border-gray-100 dark:border-[#1a1a1a] ${highlight ? "bg-gray-50/50 dark:bg-[#1a1a1a]/30" : ""}`}>
      <td
        rowSpan={rowSpan}
        className="px-3 py-2 text-center border-r border-gray-100 dark:border-[#1a1a1a] align-middle"
        style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", fontSize: "10px", fontWeight: 700, color: "#888", letterSpacing: "0.1em", textTransform: "uppercase" }}
      >
        {group}
      </td>
      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{label}</td>
      {Array.from({ length: totalLevels }).map((_, i) => (
        <td key={i} className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">
          {values[i] !== null && values[i] !== undefined
            ? Number(values[i]).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
            : <span className="text-gray-300">—</span>}
        </td>
      ))}
    </tr>
  );
}

function StatsDataRow({
  label,
  values,
  totalLevels,
  highlight,
  isCV,
  isInt,
}: {
  label: string;
  values: (number | null)[];
  totalLevels: number;
  highlight: boolean;
  isCV?: boolean;
  isInt?: boolean;
}) {
  return (
    <tr className={`border-t border-gray-100 dark:border-[#1a1a1a] ${highlight ? "bg-gray-50/50 dark:bg-[#1a1a1a]/30" : ""}`}>
      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{label}</td>
      {Array.from({ length: totalLevels }).map((_, i) => {
        const v = values[i];
        if (v === null || v === undefined)
          return <td key={i} className="px-3 py-2 text-center text-gray-300">—</td>;

        if (isCV) {
          const bad = v > 5;
          return (
            <td key={i} className="px-3 py-2 text-center">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${bad ? "bg-danger-500 text-white" : "bg-success-500 text-white"}`}>
                {v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
            </td>
          );
        }

        return (
          <td key={i} className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">
            {isInt ? v : v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function PainelControle() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando…</div>}>
      <PainelControleInner />
    </Suspense>
  );
}
