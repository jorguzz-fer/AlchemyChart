-- ============================================================================
-- Migration 0003: ControlTarget (média/DP-alvo manual por grupo de equipamentos)
-- ============================================================================
-- Permite definir manualmente uma média/DP-alvo compartilhada por um grupo de
-- equipamentos (nome-base normalizado, ex: "AU 480" cobre AU 480 (1) e (2)).
-- Quando existe, sobrepõe a StatPeriod "USO" calculada nas regras de Westgard
-- e no centro do gráfico. Aditivo — nada é removido.
-- ============================================================================

CREATE TABLE "ControlTarget" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "groupKey"    TEXT NOT NULL,
  "analyteName" TEXT NOT NULL,
  "level"       INTEGER NOT NULL,
  "mean"        DOUBLE PRECISION NOT NULL,
  "sd"          DOUBLE PRECISION NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ControlTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ControlTarget_tenantId_groupKey_analyteName_level_key"
  ON "ControlTarget"("tenantId", "groupKey", "analyteName", "level");

CREATE INDEX "ControlTarget_tenantId_idx" ON "ControlTarget"("tenantId");

ALTER TABLE "ControlTarget"
  ADD CONSTRAINT "ControlTarget_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
