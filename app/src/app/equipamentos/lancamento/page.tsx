"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface MaterialRef {
  id: string;
  name: string;
  lot?: string | null;
  active?: boolean;
}

interface AnalyteMaterialDTO {
  id: string;
  level: number;
  manufacturerMean: number | null;
  manufacturerSD: number | null;
  status: string;
  material: MaterialRef;
  equipment: { id: string; name: string };
}

interface Analyte {
  id: string;
  name: string;
  unit: string | null;
  level: number;
  equipmentId: string;
  active?: boolean;
  material: MaterialRef;
  _count: { stats: number };
  analyteMaterials: AnalyteMaterialDTO[];
}

// Vínculos aposentados não podem aparecer para digitação.
// Um lote antigo continuava na tela de lançamento mesmo depois de desativado
// em Materiais (ou marcado EXPIRADO/DESABILITADO), porque nada aqui filtrava —
// era esse o "outro lote" que aparecia sem constar na lista de materiais.
const RETIRED_AM_STATUS = new Set(["EXPIRADO", "DESABILITADO"]);

function isUsableAm(am: AnalyteMaterialDTO): boolean {
  if (RETIRED_AM_STATUS.has(am.status)) return false;
  if (am.material?.active === false) return false;
  return true;
}

interface Equipment {
  id: string;
  name: string;
}

type RunStatus = "idle" | "saving" | "ok" | "alert" | "reject" | "error";

interface LevelEntry {
  analyteId: string;
  analyteMaterialId: string | null; // null = nível sem AM, backend cria ao salvar
  level: number;
  value: string;
  status: RunStatus;
  violations: string[];
  // Bula (do AnalyteMaterial quando existe)
  materialName: string;
  materialLot: string | null;
  manufacturerMean: number | null;
  manufacturerSD: number | null;
}

// Uma linha da tela = um material de controle (lote) vinculado ao analito.
interface ConditionGroup {
  materialId: string; // id REAL do material — identifica a linha
  materialName: string;
  materialLot: string | null;
  isAtivo: boolean; // vínculo PRONTO ou já com estatísticas → rótulo "Ativo"
  hasStats: boolean; // tem StatPeriod → habilita o gráfico de CV mensal
  levels: [LevelEntry | null, LevelEntry | null, LevelEntry | null];
  note: string; // observação aplicada a todos os níveis lançados desta linha
}

interface AnalyteGroup {
  name: string;
  unit: string | null;
  conditions: ConditionGroup[]; // lotes em uso primeiro, depois os em preparo
}

const STATUS_META: Record<RunStatus, { label: string; cls: string }> = {
  idle:   { label: "",          cls: "" },
  saving: { label: "Salvando…", cls: "text-gray-400 animate-pulse" },
  ok:     { label: "OK",        cls: "text-success-600 font-bold" },
  alert:  { label: "ALERTA",    cls: "text-warning-600 font-bold" },
  reject: { label: "REJEITAR",  cls: "text-danger-600 font-bold" },
  error:  { label: "ERRO",      cls: "text-danger-500" },
};

function groupAnalytes(list: Analyte[]): AnalyteGroup[] {
  // Agrupa por nome do analito e, dentro dele, pelo MATERIAL (lote) realmente
  // vinculado. Cada lote vira uma linha própria: no dia a dia é uma linha por
  // analito e, na virada de lote, duas — o em uso e o em preparo — cada uma
  // identificada pelo lote.
  //
  // Antes a tela fabricava um par fixo "Ativo"/"Preparo" que apontava para o
  // MESMO controle (mesmo analyteId e analyteMaterialId): duas linhas gravando
  // no mesmo lugar, sem dizer de que lote eram. Era isso que gerava o "fica 1
  // ativo e outro em preparo, como ativo?" relatado pelas analistas.
  type LevelInfo = {
    analyteId: string; // qual Analyte legado usar para criar runs deste nível
    analyteMaterialId: string | null; // null = nível sem AM, backend cria ao salvar
    manufacturerMean: number | null;
    manufacturerSD: number | null;
    hasProntoAM: boolean;
    hasStats: boolean;
  };
  type MaterialBucket = {
    materialId: string;
    materialName: string;
    materialLot: string | null;
    hasAnyAm: boolean; // veio de vínculo real (não do material legado)
    hasPronto: boolean;
    hasStats: boolean;
    levels: Map<number, LevelInfo>;
  };
  type Item = {
    name: string;
    unit: string | null;
    materials: Map<string, MaterialBucket>;
  };

  const map = new Map<string, Item>();
  // Níveis realmente em uso neste equipamento (união dos níveis configurados).
  // Usado para padding e para decidir quais colunas exibir (níveis não usados
  // somem automaticamente — ex.: laboratório que só usa N1 e N2).
  const usedLevels = new Set<number>();

  function getItem(a: Analyte): Item {
    let item = map.get(a.name);
    if (!item) {
      item = { name: a.name, unit: a.unit, materials: new Map() };
      map.set(a.name, item);
    }
    if (!item.unit && a.unit) item.unit = a.unit;
    return item;
  }

  function getBucket(item: Item, m: MaterialRef): MaterialBucket {
    let bucket = item.materials.get(m.id);
    if (!bucket) {
      bucket = {
        materialId: m.id,
        materialName: m.name,
        materialLot: m.lot ?? null,
        hasAnyAm: false,
        hasPronto: false,
        hasStats: false,
        levels: new Map(),
      };
      item.materials.set(m.id, bucket);
    }
    return bucket;
  }

  // Guarda o nível preferindo sempre o vínculo PRONTO / com estatísticas.
  function setLevel(bucket: MaterialBucket, level: number, info: LevelInfo) {
    const existing = bucket.levels.get(level);
    const shouldUpdate =
      !existing ||
      (info.hasProntoAM && !existing.hasProntoAM) ||
      (info.hasStats && !existing.hasStats);
    if (shouldUpdate) {
      bucket.levels.set(level, {
        ...info,
        hasProntoAM: info.hasProntoAM || (existing?.hasProntoAM ?? false),
        hasStats: info.hasStats || (existing?.hasStats ?? false),
      });
    }
    usedLevels.add(level);
  }

  for (const a of list) {
    if (a.active === false) continue;

    // Descarta vínculos aposentados. Se o analito tinha vínculos e TODOS foram
    // aposentados, o controle saiu de uso — não cai no material legado, some da
    // tela. Sem vínculo nenhum, vale o material legado (se ainda estiver ativo).
    const allAms = a.analyteMaterials ?? [];
    const usableAms = allAms.filter(isUsableAm);
    if (allAms.length > 0 && usableAms.length === 0) continue;
    if (allAms.length === 0 && a.material?.active === false) continue;

    const hasStatsHere = a._count.stats > 0;
    const item = getItem(a);

    if (usableAms.length > 0) {
      for (const am of usableAms) {
        // Laboratório usa apenas N1 e N2 — nível 3 nunca é utilizado.
        if (am.level > 2) continue;
        const bucket = getBucket(item, am.material);
        const isPronto = am.status === "PRONTO";
        bucket.hasAnyAm = true;
        if (isPronto) bucket.hasPronto = true;
        if (hasStatsHere) bucket.hasStats = true;
        setLevel(bucket, am.level, {
          analyteId: a.id,
          analyteMaterialId: am.id,
          manufacturerMean: am.manufacturerMean,
          manufacturerSD: am.manufacturerSD,
          hasProntoAM: isPronto,
          hasStats: hasStatsHere,
        });
      }
    } else if (a.level <= 2) {
      // Analito legado sem nenhum vínculo: usa o material do próprio registro.
      const bucket = getBucket(item, a.material);
      if (hasStatsHere) bucket.hasStats = true;
      setLevel(bucket, a.level, {
        analyteId: a.id,
        analyteMaterialId: null,
        manufacturerMean: null,
        manufacturerSD: null,
        hasProntoAM: false,
        hasStats: hasStatsHere,
      });
    }
  }

  // Garante que cada lote tenha campo em TODOS os níveis em uso no equipamento.
  // O AnalyteMaterial faltante é criado pelo backend no primeiro lançamento.
  for (const item of map.values()) {
    for (const bucket of item.materials.values()) {
      const ref = Array.from(bucket.levels.values())[0];
      if (!ref) continue;
      for (const lvl of usedLevels) {
        if (bucket.levels.has(lvl)) continue;
        bucket.levels.set(lvl, {
          analyteId: ref.analyteId,
          analyteMaterialId: null, // sinaliza que será criado on-demand
          manufacturerMean: null,
          manufacturerSD: null,
          hasProntoAM: false,
          hasStats: false,
        });
      }
    }
  }

  const result: AnalyteGroup[] = [];

  for (const item of map.values()) {
    const conditions: ConditionGroup[] = Array.from(item.materials.values())
      .map((bucket) => {
        const levels = [1, 2, 3].map((lvl) => {
          const info = bucket.levels.get(lvl);
          if (!info) return null;
          return {
            analyteId: info.analyteId,
            analyteMaterialId: info.analyteMaterialId,
            level: lvl,
            value: "",
            status: "idle" as RunStatus,
            violations: [] as string[],
            materialName: bucket.materialName,
            materialLot: bucket.materialLot,
            manufacturerMean: info.manufacturerMean,
            manufacturerSD: info.manufacturerSD,
          };
        }) as [LevelEntry | null, LevelEntry | null, LevelEntry | null];

        return {
          materialId: bucket.materialId,
          materialName: bucket.materialName,
          materialLot: bucket.materialLot,
          // Com vínculo real, quem manda é o status do vínculo: um Analyte legado
          // pode ter estatísticas E apontar para o lote novo ao mesmo tempo (virada
          // de lote) — usar as estatísticas aqui marcaria o lote novo como "Ativo".
          isAtivo: bucket.hasAnyAm ? bucket.hasPronto : bucket.hasStats,
          hasStats: bucket.hasStats,
          levels,
          note: "",
        };
      })
      // Lote em uso primeiro, depois os em preparo; empate resolve pelo lote.
      .sort((x, y) => {
        if (x.isAtivo !== y.isAtivo) return x.isAtivo ? -1 : 1;
        return (x.materialLot ?? x.materialName).localeCompare(
          y.materialLot ?? y.materialName,
          "pt-BR"
        );
      });

    if (conditions.length === 0) continue;
    result.push({ name: item.name, unit: item.unit, conditions });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Tooltip com informações de bula da condição (todos os níveis)
function BulaTooltip({ cond, equipmentName }: { cond: ConditionGroup; equipmentName: string }) {
  const levelsWithData = cond.levels
    .map((l, i) => ({ entry: l, level: i + 1 }))
    .filter((x) => x.entry !== null) as Array<{ entry: LevelEntry; level: number }>;

  if (levelsWithData.length === 0) {
    return (
      <div className="text-xs text-white/70">
        Nenhum nível configurado para esta condição.
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="font-semibold text-white/90 border-b border-white/20 pb-1 mb-1">
        {equipmentName} — {cond.isAtivo ? "Ativo" : "Preparo"}
        <span className="block font-normal text-white/60">
          {cond.materialName}
          {cond.materialLot && ` · Lote ${cond.materialLot}`}
        </span>
      </div>
      {levelsWithData.map(({ entry, level }) => (
        <div key={level} className="space-y-0.5">
          <div className="font-semibold">
            Nível {level}: <span className="font-normal">{entry.materialName}</span>
          </div>
          {entry.materialLot && (
            <div className="text-white/70">Lote: {entry.materialLot}</div>
          )}
          {entry.manufacturerMean !== null && entry.manufacturerSD !== null && (
            <div className="text-white/80 font-mono">
              Xm: {entry.manufacturerMean.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
              {" — "}
              DP: {entry.manufacturerSD.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
            </div>
          )}
          {entry.manufacturerMean === null && entry.manufacturerSD === null && (
            <div className="text-white/50 italic">Sem valores de bula</div>
          )}
        </div>
      ))}
    </div>
  );
}

function LancamentoInner() {
  const searchParams = useSearchParams();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [selectedEquipId, setSelectedEquipId] = useState<string>("");
  const [groups, setGroups] = useState<AnalyteGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Tooltip popover state — qual condição está aberta (formato "gi-ci")
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/equipamentos")
      .then((r) => r.json())
      .then((list: Equipment[]) => {
        if (!Array.isArray(list)) return;
        setEquipments(list);
        const paramId = searchParams.get("equipment");
        const initial = paramId && list.find((e) => e.id === paramId) ? paramId : list[0]?.id ?? "";
        setSelectedEquipId(initial);
      })
      .catch(() => {});
  }, [searchParams]);

  const loadAnalytes = useCallback((equipId: string) => {
    if (!equipId) return;
    setSubmitted(false);
    fetch("/api/analitos")
      .then((r) => r.json())
      .then((list: Analyte[]) => {
        const filtered = list.filter((a) => a.equipmentId === equipId && a.active !== false);
        setGroups(groupAnalytes(filtered));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadAnalytes(selectedEquipId); }, [selectedEquipId, loadAnalytes]);

  // Fecha tooltip ao clicar fora
  useEffect(() => {
    if (!openTooltip) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-tooltip-anchor]")) setOpenTooltip(null);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [openTooltip]);

  const updateLevel = (gi: number, ci: number, li: number, value: string) => {
    setGroups((prev) =>
      prev.map((g, gIdx) => {
        if (gIdx !== gi) return g;
        return {
          ...g,
          conditions: g.conditions.map((c, cIdx) => {
            if (cIdx !== ci) return c;
            const levels = [...c.levels] as ConditionGroup["levels"];
            const entry = levels[li];
            if (!entry) return c;
            levels[li] = { ...entry, value, status: "idle", violations: [] };
            return { ...c, levels };
          }),
        };
      })
    );
  };

  const updateNote = (gi: number, ci: number, value: string) => {
    setGroups((prev) =>
      prev.map((g, gIdx) => {
        if (gIdx !== gi) return g;
        return {
          ...g,
          conditions: g.conditions.map((c, cIdx) =>
            cIdx !== ci ? c : { ...c, note: value }
          ),
        };
      })
    );
  };

  const handleSubmit = async () => {
    type SaveItem = { gi: number; ci: number; li: number; entry: LevelEntry; note: string };
    const toSave: SaveItem[] = [];
    groups.forEach((g, gi) =>
      g.conditions.forEach((c, ci) =>
        c.levels.forEach((e, li) => {
          if (e && e.value.trim() !== "") toSave.push({ gi, ci, li, entry: e, note: c.note });
        })
      )
    );
    if (toSave.length === 0) return;

    setSubmitting(true);

    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => ({
          ...c,
          levels: c.levels.map((e) =>
            e && e.value.trim() !== "" ? { ...e, status: "saving" as RunStatus } : e
          ) as ConditionGroup["levels"],
        })),
      }))
    );

    const results = await Promise.allSettled(
      toSave.map(({ entry, note }) =>
        fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analyteId: entry.analyteId,
            analyteMaterialId: entry.analyteMaterialId,
            level: entry.level,
            value: parseFloat(entry.value.replace(",", ".")),
            note: note.trim() || undefined,
          }),
        }).then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
          return body;
        })
      )
    );

    setGroups((prev) => {
      const next = prev.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => ({ ...c, levels: [...c.levels] as ConditionGroup["levels"] })),
      }));
      toSave.forEach(({ gi, ci, li }, i) => {
        const result = results[i];
        const entry = next[gi].conditions[ci].levels[li];
        if (!entry) return;
        if (result.status === "fulfilled") {
          const run = result.value;
          next[gi].conditions[ci].levels[li] = {
            ...entry,
            status: (run.status?.toLowerCase() as RunStatus) ?? "ok",
            violations: run.violations ?? [],
          };
        } else {
          next[gi].conditions[ci].levels[li] = { ...entry, status: "error", violations: [] };
        }
      });
      return next;
    });

    setSubmitting(false);
    setSubmitted(true);
  };

  const handleClear = () => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => ({
          ...c,
          note: "",
          levels: c.levels.map((e) => (e ? { ...e, value: "", status: "idle" as RunStatus, violations: [] } : e)) as ConditionGroup["levels"],
        })),
      }))
    );
    setSubmitted(false);
  };

  const hasValues = groups.some((g) =>
    g.conditions.some((c) => c.levels.some((e) => e && e.value.trim() !== ""))
  );
  const selectedEquip = equipments.find((e) => e.id === selectedEquipId);

  // Exibe apenas as colunas de nível realmente em uso. Um nível é "ativo" se
  // qualquer analito carregado tem entrada nele — níveis nunca configurados
  // (ex.: N3 num laboratório que só usa 2) somem automaticamente.
  const activeLevels: [boolean, boolean, boolean] = [0, 1, 2].map((i) =>
    groups.some((g) => g.conditions.some((c) => c.levels[i] != null))
  ) as [boolean, boolean, boolean];

  let inputCounter = 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white mb-1">
            Lançamento em Massa
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Lance corridas para todos os analitos de um equipamento de uma vez.
          </p>
        </div>
        <select
          value={selectedEquipId}
          onChange={(e) => setSelectedEquipId(e.target.value)}
          className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#141414] text-sm font-medium text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-w-[220px]"
        >
          {equipments.map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.name}</option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-gray-300 dark:text-gray-600 mb-3 block">inventory_2</span>
          <p className="text-gray-500">Nenhum analito encontrado para este equipamento.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-100 dark:border-[#1a1a1a] overflow-hidden">
          {/* Card header */}
          <div className="bg-danger-600 px-6 py-4 text-white flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-base mb-0">{selectedEquip?.name ?? "Equipamento"}</h3>
              <p className="text-white/70 text-xs mb-0">Lançamento de corridas</p>
            </div>
            <div className="flex items-center gap-2">
              {submitted && (
                <span className="text-xs bg-white/20 rounded-full px-3 py-1">Lançamento concluído</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 dark:bg-[#0c0b0b]">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">
                    Analitos
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Condição do controle
                  </th>
                  {([1, 2, 3] as const).map((n, i) =>
                    activeLevels[i] ? (
                      <th key={n} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[130px]">
                        Nível {n}
                      </th>
                    ) : null
                  )}
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">
                    Observação
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group, gi) =>
                  group.conditions.map((cond, ci) => {
                    const isFirstCond = ci === 0;
                    const isAtivo = cond.isAtivo;
                    const tooltipKey = `${gi}-${ci}`;
                    const isOpen = openTooltip === tooltipKey;
                    const equipName = selectedEquip?.name ?? "";
                    return (
                      <tr
                        key={`${group.name}||${cond.materialId}`}
                        className={`border-t border-gray-100 dark:border-[#1a1a1a] hover:bg-gray-50/50 dark:hover:bg-[#1a1a1a]/40 transition-colors ${
                          !isFirstCond ? "border-t border-dashed border-gray-100 dark:border-[#1a1a1a]" : ""
                        }`}
                      >
                        {/* Analito name — só na primeira linha (rowspan) */}
                        {isFirstCond && (
                          <td
                            rowSpan={group.conditions.length}
                            className="px-5 py-3 align-middle border-r border-gray-100 dark:border-[#1a1a1a]"
                          >
                            <span className="text-sm font-semibold text-black dark:text-white">{group.name}</span>
                            {group.unit && (
                              <span className="block text-xs text-gray-400 mt-0.5">{group.unit}</span>
                            )}
                          </td>
                        )}

                        {/* Condição do controle + ícones de ação */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {/* Identifica o LOTE da linha — sem isso o analista não
                                sabe em qual controle está digitando na virada de lote */}
                            <div className="min-w-0 flex-1">
                              <span
                                className={`inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                                  isAtivo
                                    ? "bg-success-50 text-success-700 dark:bg-success-900/20"
                                    : "bg-warning-50 text-warning-700 dark:bg-warning-900/20"
                                }`}
                              >
                                {isAtivo ? "Ativo" : "Preparo"}
                              </span>
                              <span
                                className="block text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5"
                                title={`${cond.materialName}${cond.materialLot ? ` · Lote ${cond.materialLot}` : ""}`}
                              >
                                {cond.materialName}
                                {cond.materialLot && (
                                  <span className="text-gray-400"> · {cond.materialLot}</span>
                                )}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* 📊 Gráfico evolutivo do CV mensal — só com estatísticas */}
                              {cond.hasStats ? (
                                <Link
                                  href={`/analitos/cv-mensal?name=${encodeURIComponent(group.name)}&eq=${selectedEquipId}`}
                                  title="Gráfico evolutivo do CV mensal"
                                  className="w-7 h-7 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all flex items-center justify-center"
                                >
                                  <span className="material-symbols-outlined text-[16px]">trending_up</span>
                                </Link>
                              ) : (
                                <span
                                  title="Disponível somente após estabelecer estatísticas"
                                  className="w-7 h-7 rounded-md text-gray-200 dark:text-gray-700 flex items-center justify-center cursor-not-allowed"
                                >
                                  <span className="material-symbols-outlined text-[16px]">trending_up</span>
                                </span>
                              )}

                              {/* 📋 Visualizar painel de controle */}
                              <Link
                                href={`/analitos/painel?name=${encodeURIComponent(group.name)}&eq=${selectedEquipId}`}
                                title="Visualizar painel de controle"
                                className="w-7 h-7 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all flex items-center justify-center"
                              >
                                <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                              </Link>

                              {/* ℹ️ Info — tooltip com bula */}
                              <div className="relative" data-tooltip-anchor>
                                <button
                                  onClick={() => setOpenTooltip(isOpen ? null : tooltipKey)}
                                  title="Informações do material"
                                  className={`w-7 h-7 rounded-md transition-all flex items-center justify-center ${
                                    isOpen
                                      ? "bg-gray-800 text-white"
                                      : "text-gray-400 hover:text-primary-500 hover:bg-primary-50"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[16px]">info</span>
                                </button>

                                {isOpen && (
                                  <div className="absolute left-0 top-full mt-2 z-30 w-80 max-w-[90vw] bg-gray-900 text-white rounded-lg shadow-2xl p-3 border border-gray-700">
                                    <BulaTooltip cond={cond} equipmentName={equipName} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Colunas de nível */}
                        {([0, 1, 2] as const).map((li) => {
                          if (!activeLevels[li]) return null;
                          const entry = cond.levels[li];

                          if (!entry) {
                            return (
                              <td key={li} className="px-3 py-3">
                                <div className="w-full h-9 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]" />
                              </td>
                            );
                          }

                          const st = STATUS_META[entry.status];
                          const myIdx = inputCounter++;
                          return (
                            <td key={li} className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={entry.value}
                                onChange={(e) => updateLevel(gi, ci, li, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const inputs = document.querySelectorAll<HTMLInputElement>("[data-value-input]");
                                    const next = inputs[myIdx + 1];
                                    if (next) next.focus();
                                  }
                                }}
                                data-value-input
                                className={`w-full px-3 py-1.5 rounded-lg border text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors ${
                                  entry.status === "ok"
                                    ? "border-success-300 bg-success-50/50 dark:bg-success-900/10"
                                    : entry.status === "alert"
                                    ? "border-warning-300 bg-warning-50/50 dark:bg-warning-900/10"
                                    : entry.status === "reject"
                                    ? "border-danger-300 bg-danger-50/50 dark:bg-danger-900/10"
                                    : "border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0b0b]"
                                }`}
                              />
                              {entry.status !== "idle" && (
                                <div className="mt-1 text-center">
                                  <span className={`text-[10px] ${st.cls}`}>{st.label}</span>
                                  {entry.violations.length > 0 && (
                                    <span className="text-[9px] text-gray-400 ml-1">{entry.violations.join(" ")}</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Observação — aplicada a todos os níveis lançados desta linha */}
                        <td className="px-3 py-3 align-top">
                          <input
                            type="text"
                            value={cond.note}
                            onChange={(e) => updateNote(gi, ci, e.target.value)}
                            placeholder="Intercorrência / observação"
                            title="Observação registrada em todas as corridas lançadas nesta linha"
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0c0b0b] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-[#0c0b0b] border-t border-gray-100 dark:border-[#1a1a1a] flex items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              Use{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#2a2a2a] text-[10px]">Enter</kbd>{" "}
              para avançar entre os campos.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClear}
                disabled={submitting || !hasValues}
                className="px-5 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-[#1a1a1a] rounded-lg hover:bg-gray-100 dark:hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">clear_all</span>
                LIMPAR
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !hasValues}
                className="bg-success-600 hover:bg-success-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    Salvando…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    SALVAR
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LancamentoEmMassaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando…</div>}>
      <LancamentoInner />
    </Suspense>
  );
}
