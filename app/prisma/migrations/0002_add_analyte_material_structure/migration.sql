-- ============================================================================
-- Migration 0002: AnalyteMaterial structure (Phase 1 - additive only)
-- ============================================================================
-- Adiciona junction AnalyteMaterial e novos campos em Analyte/Material/Run.
-- Backfill preserva dados existentes: cria 1 AnalyteMaterial por Analyte
-- legado e re-aponta cada Run para sua AnalyteMaterial correspondente.
-- Nada é removido — colunas legadas (Analyte.equipmentId/materialId/level,
-- Run.analyteId) ficam para uma fase de cleanup futura.
-- ============================================================================

-- ─── 1. Novos campos em Analyte ─────────────────────────────────────────────
ALTER TABLE "Analyte"
  ADD COLUMN "decimalPlaces"     INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "maxImprecision"    DOUBLE PRECISION,
  ADD COLUMN "imprecisionSource" TEXT,
  ADD COLUMN "westgardRules"     JSONB;

-- ─── 2. Novos campos em Material ────────────────────────────────────────────
ALTER TABLE "Material"
  ADD COLUMN "fabricante"   TEXT,
  ADD COLUMN "alertEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "alertDays"    INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "naoEnsaiado"  BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. Tabela AnalyteMaterial ───────────────────────────────────────────────
CREATE TABLE "AnalyteMaterial" (
  "id"               TEXT NOT NULL,
  "analyteId"        TEXT NOT NULL,
  "equipmentId"      TEXT NOT NULL,
  "materialId"       TEXT NOT NULL,
  "level"            INTEGER NOT NULL,
  "manufacturerMean" DOUBLE PRECISION,
  "manufacturerSD"   DOUBLE PRECISION,
  "status"           TEXT NOT NULL DEFAULT 'PREPARO',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyteMaterial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyteMaterial_analyteId_equipmentId_materialId_level_key"
  ON "AnalyteMaterial"("analyteId", "equipmentId", "materialId", "level");

CREATE INDEX "AnalyteMaterial_equipmentId_idx" ON "AnalyteMaterial"("equipmentId");
CREATE INDEX "AnalyteMaterial_materialId_idx"  ON "AnalyteMaterial"("materialId");

ALTER TABLE "AnalyteMaterial"
  ADD CONSTRAINT "AnalyteMaterial_analyteId_fkey"
    FOREIGN KEY ("analyteId") REFERENCES "Analyte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyteMaterial"
  ADD CONSTRAINT "AnalyteMaterial_equipmentId_fkey"
    FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnalyteMaterial"
  ADD CONSTRAINT "AnalyteMaterial_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 4. analyteMaterialId em Run ────────────────────────────────────────────
ALTER TABLE "Run" ADD COLUMN "analyteMaterialId" TEXT;

CREATE INDEX "Run_analyteMaterialId_idx" ON "Run"("analyteMaterialId");

ALTER TABLE "Run"
  ADD CONSTRAINT "Run_analyteMaterialId_fkey"
    FOREIGN KEY ("analyteMaterialId") REFERENCES "AnalyteMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5. BACKFILL ────────────────────────────────────────────────────────────
-- 5a. Cria 1 AnalyteMaterial para cada Analyte legado.
--     status = PRONTO se já tem StatPeriod (conjunto de stats estabelecido),
--              caso contrário PREPARO (em fase de setup, < 20 corridas).
INSERT INTO "AnalyteMaterial" (
  "id", "analyteId", "equipmentId", "materialId", "level",
  "status", "createdAt", "updatedAt"
)
SELECT
  'cm' || substr(md5(random()::text || clock_timestamp()::text || a."id"), 1, 24),
  a."id",
  a."equipmentId",
  a."materialId",
  a."level",
  CASE
    WHEN EXISTS (SELECT 1 FROM "StatPeriod" sp WHERE sp."analyteId" = a."id") THEN 'PRONTO'
    ELSE 'PREPARO'
  END,
  NOW(),
  NOW()
FROM "Analyte" a
ON CONFLICT ("analyteId", "equipmentId", "materialId", "level") DO NOTHING;

-- 5b. Re-aponta cada Run para sua AnalyteMaterial recém-criada.
UPDATE "Run" r
SET "analyteMaterialId" = am."id",
    "updatedAt" = NOW()
FROM "AnalyteMaterial" am
WHERE am."analyteId" = r."analyteId"
  AND r."analyteMaterialId" IS NULL;

-- ─── 6. Verificação (lança exceção se contagens divergirem) ─────────────────
-- Total de Analytes deve igualar total de AnalyteMaterials criadas no backfill.
-- Cada Run com analyteId existente deve ter analyteMaterialId preenchido.
DO $$
DECLARE
  v_analytes      INTEGER;
  v_am            INTEGER;
  v_runs          INTEGER;
  v_runs_with_am  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_analytes FROM "Analyte";
  SELECT COUNT(*) INTO v_am       FROM "AnalyteMaterial";
  SELECT COUNT(*) INTO v_runs     FROM "Run";
  SELECT COUNT(*) INTO v_runs_with_am FROM "Run" WHERE "analyteMaterialId" IS NOT NULL;

  RAISE NOTICE 'Migration 0002 backfill: % analytes -> % AnalyteMaterials, % runs -> % com analyteMaterialId',
    v_analytes, v_am, v_runs, v_runs_with_am;

  IF v_am < v_analytes THEN
    RAISE EXCEPTION 'Backfill falhou: AnalyteMaterials (%) < Analytes (%)', v_am, v_analytes;
  END IF;

  IF v_runs_with_am < v_runs THEN
    RAISE EXCEPTION 'Backfill falhou: Runs com AM (%) < total Runs (%)', v_runs_with_am, v_runs;
  END IF;
END $$;
