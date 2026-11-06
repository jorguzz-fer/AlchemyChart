-- ============================================================================
-- Migration 0004: User.alertEmails (quem recebe os e-mails de alerta)
-- ============================================================================
-- Até aqui os alertas de controle iam para TODO usuário ativo com perfil
-- Supervisor/Admin/SuperAdmin — sem como tirar alguém da lista sem mexer no
-- perfil. Agora é uma marcação por usuário no cadastro.
--
-- Backfill: quem recebia antes (Supervisor/Admin/SuperAdmin ativos) continua
-- recebendo; ninguém perde o alerta na virada. Aditivo — nada é removido.
-- ============================================================================

ALTER TABLE "User"
  ADD COLUMN "alertEmails" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
   SET "alertEmails" = true
 WHERE "active" = true
   AND "role" IN ('SUPERVISOR', 'ADMIN', 'SUPERADMIN');
