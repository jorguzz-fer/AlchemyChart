import { prisma } from "@/lib/db";
import { equipmentGroupKey } from "@/lib/equipment-group";

// Centro de referência (média/DP) do Levey-Jennings e do Westgard.
//
// Prioridade, do mais ao menos autoritativo:
//   1. "manual"    — alvo fixado pelo supervisor (ControlTarget), vale para o
//                    grupo de equipamentos (AU 480 (1) e (2) compartilham).
//   2. "bula"      — Xm/DP do fabricante, cadastrados em Materiais no vínculo
//                    do controle (AnalyteMaterial.manufacturerMean/SD).
//   3. "calculada" — média/DP das 20 primeiras corridas (StatPeriod "USO").
//
// A bula entrou na frente da média calculada a pedido do laboratório: eles
// usam controles ensaiados, então o alvo é o que vem no frasco. Calcular um
// DP próprio nas 20 corridas dava um limite mais apertado que o da bula e
// gerava rejeições falsas ("rejeitar amostra" em série).

export const SETUP_THRESHOLD = 20;
const RETIRED_STATUS = ["EXPIRADO", "DESABILITADO"];

export type CenterSource = "manual" | "bula" | "calculada";

export interface ControlCenter {
  mean: number;
  sd: number;
  source: CenterSource;
}

export interface CenterLookup {
  tenantId: string;
  analyteId: string;
  analyteName: string;
  equipmentId: string;
  equipmentName: string;
  level: number;
}

// Bula do controle em uso para este analito+equipamento+nível. Ignora
// vínculos aposentados e materiais desativados; prefere PRONTO e, em empate,
// o vínculo atualizado mais recentemente.
export async function findBula(
  args: Pick<CenterLookup, "tenantId" | "analyteName" | "equipmentId" | "level">
): Promise<{ mean: number; sd: number } | null> {
  const ams = await prisma.analyteMaterial.findMany({
    where: {
      level: args.level,
      analyte: { name: args.analyteName, equipmentId: args.equipmentId, unitRel: { tenantId: args.tenantId } },
      status: { notIn: RETIRED_STATUS },
      material: { active: true },
      manufacturerMean: { not: null },
      manufacturerSD: { not: null },
    },
    select: { manufacturerMean: true, manufacturerSD: true, status: true, updatedAt: true },
  });
  if (ams.length === 0) return null;

  ams.sort((a, b) => {
    const pa = a.status === "PRONTO" ? 0 : 1;
    const pb = b.status === "PRONTO" ? 0 : 1;
    return pa - pb || b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const am = ams[0];
  const mean = am.manufacturerMean as number;
  const sd = am.manufacturerSD as number;
  // DP zero/negativo não serve de limite — cai para a próxima fonte.
  if (!(sd > 0)) return null;
  return { mean, sd };
}

export async function resolveControlCenter(args: CenterLookup): Promise<ControlCenter | null> {
  const manual = await prisma.controlTarget.findUnique({
    where: {
      tenantId_groupKey_analyteName_level: {
        tenantId: args.tenantId,
        groupKey: equipmentGroupKey(args.equipmentName),
        analyteName: args.analyteName,
        level: args.level,
      },
    },
  });
  if (manual) return { mean: manual.mean, sd: manual.sd, source: "manual" };

  const bula = await findBula(args);
  if (bula) return { ...bula, source: "bula" };

  const stat = await prisma.statPeriod.findFirst({
    where: { analyteId: args.analyteId, period: "USO" },
    orderBy: { createdAt: "desc" },
  });
  if (stat && stat.n >= SETUP_THRESHOLD) return { mean: stat.mean, sd: stat.sd, source: "calculada" };

  return null;
}
