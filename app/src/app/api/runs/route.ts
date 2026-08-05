import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { checkWestgard } from "@/lib/westgard";
import { calculateStats } from "@/lib/stats";
import { NextResponse } from "next/server";
import { requireRole, ROLES_WRITE } from "@/lib/authz";
import { logAudit, getClientIp } from "@/lib/audit";
import { sendControlAlert } from "@/lib/email";
import { equipmentGroupKey } from "@/lib/equipment-group";

const SETUP_THRESHOLD = 20; // runs needed to establish StatPeriod

export async function POST(req: Request) {
  const { session, error } = await requireRole(ROLES_WRITE);
  if (error) return error;

  const body = await req.json();
  const { analyteId, value, note, level: rawLevel, analyteMaterialId: providedAmId } = body;

  if (!analyteId) return NextResponse.json({ error: "analyteId obrigatório" }, { status: 400 });
  const numValue = Number(value);
  if (isNaN(numValue)) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

  // Verify analyte belongs to this tenant — busca todos os AMs para auto-resolver
  const analyte = await prisma.analyte.findFirst({
    where: { id: analyteId, unitRel: { tenantId: session.user.tenantId } },
    include: {
      equipment: { select: { name: true } },
      analyteMaterials: { include: { material: { select: { id: true, name: true } } } },
    },
  });
  if (!analyte) return NextResponse.json({ error: "Analito não encontrado" }, { status: 404 });

  // Resolve qual AnalyteMaterial vincular à corrida.
  // Prioridade: 1) providedAmId  2) AM no nível solicitado  3) primeiro AM do analito
  // Se nada existe e level foi passado, cria um AM novo com PREPARO + material
  // herdado (preferindo o AM existente em qualquer nível, fallback para a.materialId).
  const targetLevel = rawLevel != null ? Math.min(3, Math.max(1, Number(rawLevel) || 0)) : null;

  // Nível efetivo da corrida (calculado antes de resolver o Analyte legado do
  // nível certo, abaixo — não depende do AM final).
  const runLevel =
    targetLevel ??
    (providedAmId
      ? analyte.analyteMaterials.find((am) => am.id === providedAmId)?.level
      : undefined) ??
    analyte.level;

  // O Analyte legado guarda 1 nível por registro (Analyte.level). Se o
  // analito informado no request não é do nível desta corrida — comum
  // quando o AM do outro nível foi criado/anexado sob o Analyte errado —
  // busca (ou cria) o Analyte do nível correto e usa o id dele daqui pra
  // frente. Sem isso, corridas de níveis diferentes acabam compartilhando
  // o mesmo histórico/estatística (mesmo bug já corrigido na importação do
  // QualiChart via getAnalyteForLevel).
  let effectiveAnalyteId = analyte.id;
  let effectiveWestgardRules = analyte.westgardRules;
  if (analyte.level !== runLevel) {
    let levelAnalyte = await prisma.analyte.findFirst({
      where: {
        name: analyte.name,
        equipmentId: analyte.equipmentId,
        level: runLevel,
        unitRel: { tenantId: session.user.tenantId },
      },
      select: { id: true, westgardRules: true },
    });
    if (!levelAnalyte) {
      levelAnalyte = await prisma.analyte.create({
        data: {
          unitId: analyte.unitId,
          equipmentId: analyte.equipmentId,
          materialId: analyte.materialId,
          name: analyte.name,
          unit: analyte.unit,
          level: runLevel,
          decimalPlaces: analyte.decimalPlaces,
          maxImprecision: analyte.maxImprecision,
          imprecisionSource: analyte.imprecisionSource,
          westgardRules: analyte.westgardRules ?? Prisma.JsonNull,
        },
        select: { id: true, westgardRules: true },
      });
    }
    effectiveAnalyteId = levelAnalyte.id;
    effectiveWestgardRules = levelAnalyte.westgardRules;
  }

  let analyteMaterialId: string | null = null;

  if (providedAmId && analyte.analyteMaterials.some((am) => am.id === providedAmId)) {
    analyteMaterialId = providedAmId;
  } else if (targetLevel) {
    const existing = analyte.analyteMaterials.find((am) => am.level === targetLevel);
    if (existing) {
      analyteMaterialId = existing.id;
    } else {
      // Auto-cria AM no nível solicitado, herdando material de outro AM ou do legado
      const refAm = analyte.analyteMaterials[0];
      const materialId = refAm?.material.id ?? analyte.materialId;
      const created = await prisma.analyteMaterial.create({
        data: {
          analyteId: effectiveAnalyteId,
          equipmentId: analyte.equipmentId,
          materialId,
          level: targetLevel,
          status: "PREPARO",
        },
        select: { id: true },
      });
      analyteMaterialId = created.id;
    }
  } else {
    analyteMaterialId = analyte.analyteMaterials[0]?.id ?? null;
  }

  // Self-heal: garante que o AM desta corrida aponte para o Analyte do
  // nível correto (corrige on-the-fly um AM que tenha ficado preso no
  // Analyte de outro nível em uma corrida anterior).
  if (analyteMaterialId) {
    try {
      await prisma.analyteMaterial.updateMany({
        where: { id: analyteMaterialId, analyteId: { not: effectiveAnalyteId } },
        data: { analyteId: effectiveAnalyteId },
      });
    } catch {
      // Colisão rara com a constraint única (analyteId+equipmentId+materialId+level);
      // a corrida ainda é salva corretamente no Analyte do nível certo — a
      // ferramenta /admin/repair-run-levels resolve o AM remanescente depois.
    }
  }

  // Get existing runs for this analyte (chronological)
  const existingRuns = await prisma.run.findMany({
    where: { analyteId: effectiveAnalyteId },
    orderBy: { runAt: "asc" },
    select: { value: true },
  });

  const history = existingRuns.map((r) => r.value);

  // Get active StatPeriod for Westgard check
  const statPeriod = await prisma.statPeriod.findFirst({
    where: { analyteId: effectiveAnalyteId },
    orderBy: { createdAt: "desc" },
  });

  // Alvo manual do grupo (ControlTarget) — média/DP fixada que vale para os
  // equipamentos do par. Tem prioridade sobre a StatPeriod "USO" calculada.
  const groupKey = equipmentGroupKey(analyte.equipment?.name ?? "");
  const manualTarget = await prisma.controlTarget.findUnique({
    where: {
      tenantId_groupKey_analyteName_level: {
        tenantId: session.user.tenantId,
        groupKey,
        analyteName: analyte.name,
        level: runLevel,
      },
    },
  });

  // Centro/referência para Westgard: manual vale na hora; senão a "USO" após 20 corridas
  let centerMean: number | null = null;
  let centerSd: number | null = null;
  if (manualTarget) {
    centerMean = manualTarget.mean;
    centerSd = manualTarget.sd;
  } else if (statPeriod && statPeriod.n >= SETUP_THRESHOLD) {
    centerMean = statPeriod.mean;
    centerSd = statPeriod.sd;
  }

  let status: "OK" | "ALERT" | "REJECT" = "OK";
  let violations: string[] = [];

  if (centerMean != null && centerSd != null) {
    // Passa westgardRules do analito do nível efetivo — se null, checkWestgard usa DEFAULT_WESTGARD_RULES
    const result = checkWestgard(numValue, centerMean, centerSd, history, effectiveWestgardRules);
    status = result.status;
    violations = result.violations;
  }

  // Save the run (popula tanto analyteId legado — do nível correto — quanto analyteMaterialId novo)
  const run = await prisma.run.create({
    data: {
      analyteId: effectiveAnalyteId,
      analyteMaterialId,
      equipmentId: analyte.equipmentId,
      userId: session.user.id,
      value: numValue,
      status,
      violations,
      note: note?.trim() || null,
    },
    include: {
      user: { select: { name: true } },
    },
  });

  // Auto-create StatPeriod after SETUP_THRESHOLD runs if none exists.
  // Usa só a janela de preparo (primeiras SETUP_THRESHOLD corridas) para que o
  // alvo de "USO" nasça congelado — mesma regra do recompute em [id]/route.ts.
  const totalRuns = history.length + 1;
  if (!statPeriod && totalRuns >= SETUP_THRESHOLD) {
    const allValues = [...history, numValue].slice(0, SETUP_THRESHOLD);
    const s = calculateStats(allValues);
    if (s) {
      await prisma.statPeriod.create({
        data: {
          analyteId: effectiveAnalyteId,
          period: "USO",
          mean: s.mean,
          sd: s.sd,
          cv: s.cv,
          n: s.n,
        },
      });
    }
  }

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "run.create",
    entity: "Run",
    entityId: run.id,
    meta: {
      analyteId,
      analyteName: analyte.name,
      value: numValue,
      status,
      violations,
    },
    ip: getClientIp(req),
  });

  // Notifica supervisores + admins por e-mail quando o lançamento viola Westgard.
  // Fire-and-forget: NÃO bloqueia o salvamento. A corrida já está gravada e a
  // resposta retorna na hora; o e-mail sai em background (servidor Node
  // persistente completa a promise). Assim REJEITAR/ALERTA nunca deixa o
  // "Salvar" travando por lentidão do provedor de e-mail.
  if (status === "ALERT" || status === "REJECT") {
    const alert = {
      analyteName: analyte.name,
      unit: analyte.unit,
      level: runLevel,
      equipmentName: analyte.equipment?.name ?? "—",
      value: numValue,
      status,
      violations,
      analystName: run.user?.name ?? null,
      runAt: run.runAt,
      mean: centerMean,
      sd: centerSd,
    };
    const tenantId = session.user.tenantId;
    void (async () => {
      try {
        const recipients = await prisma.user.findMany({
          where: { tenantId, active: true, role: { in: ["SUPERVISOR", "ADMIN", "SUPERADMIN"] } },
          select: { email: true },
        });
        const to = recipients.map((r) => r.email).filter((e): e is string => !!e);
        if (to.length > 0) await sendControlAlert({ to, ...alert });
      } catch (e) {
        console.error("[runs] Falha ao notificar supervisores:", e);
      }
    })();
  }

  return NextResponse.json(run, { status: 201 });
}
