# Plano de Segurança — Alchemy Control Chart

Projeto multi-tenant que armazena dados de CQI laboratorial. Cliente-alvo: laboratórios
de medicina diagnóstica (Alchemypet, etc.) — **escopo LGPD aplicável** (dados relacionados
a operação sanitária, potenciais dados pessoais de analistas e pacientes em futuro ERP).

Status: MVP pré-entrega. Este plano lista o que falta para ir a produção com um cliente real.

---

## FASE 1 — Crítico (bloqueia entrega ao cliente)

### 1.1 Hardening de headers HTTP
**Risco:** XSS, clickjacking, MITM downgrade, mixed content.
**Estado atual:** `next.config.ts` não define nenhum header.
**Ação:** adicionar `headers()` ao `next.config.ts`:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY` (bloqueia iframe)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` — começar com policy restritiva, permitir só `'self'`
  + Google Fonts + inline do Next.js (via nonce) + Material Symbols.

### 1.2 Restringir `images.remotePatterns`
**Risco:** SSRF via `_next/image` (qualquer URL HTTPS no mundo é proxy).
**Estado atual:** `{ protocol: "https", hostname: "**" }` — permite tudo.
**Ação:** trocar para `hostname: "static.wixstatic.com"` (Alchemypet) ou remover o pattern se
não estivermos mais usando imagens externas.

### 1.3 Rate limiting no login e em APIs sensíveis
**Risco:** brute-force de senha, credential stuffing, enumeração de e-mail.
**Estado atual:** `/api/auth/callback/credentials` aceita tentativas ilimitadas.
**Ação:**
- Instalar `@upstash/ratelimit` + Redis (Upstash free tier) ou implementar tabela
  `LoginAttempt` no Postgres com sliding window.
- Limites sugeridos:
  - Login: 5 tentativas / 15min por IP + 10 / hora por e-mail
  - `/api/usuarios` POST: 20 / hora por user
  - Outros POST/PATCH: 60 / min por user
- Bloqueio temporário com backoff exponencial após 3 falhas consecutivas.

### 1.4 Secrets fora de ARG do Dockerfile
**Risco:** `AUTH_SECRET`, `POSTGRES_PASSWORD`, `RESEND_API_KEY` vazam em layers do image.
**Estado atual:** Coolify logou 15 warnings `SecretsUsedInArgOrEnv`.
**Ação:**
- Remover `ARG AUTH_SECRET` etc. do Dockerfile.
- Usar Docker BuildKit secrets (`--mount=type=secret`) ou passar só em runtime via
  Coolify env vars (já suportado).
- Trocar valores atuais por novos — os vazados devem ser considerados comprometidos.

### 1.5 Política de senha + validação server-side
**Risco:** senhas fracas, reuso de credenciais comprometidas.
**Estado atual:** `z.string().min(8)` apenas.
**Ação:**
- Mínimo 10 chars, obrigar 3 de 4 (maiúscula, minúscula, número, símbolo).
- Integração com HaveIBeenPwned k-Anonymity API (consulta prefixo SHA-1 sem expor senha).
- Forçar troca de senha no primeiro login de usuário criado por admin.
- Feedback de força no client (zxcvbn) + validação server-side.

### 1.6 Session timeout agressivo
**Risco:** sessão roubada fica válida por 30 dias (default NextAuth JWT).
**Estado atual:** `session: { strategy: "jwt" }` sem `maxAge`.
**Ação:** `session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 }` — 8h
de duração, renovada a cada hora de atividade. Para lab crítico: 4h.

### 1.7 AuditLog efetivamente usado
**Risco:** nenhum registro de quem fez o quê — cliente não consegue investigar incidentes.
**Estado atual:** tabela `AuditLog` existe no schema mas é **nunca escrita**.
**Ação:** criar helper `logAudit(tenantId, userId, action, entity, entityId, meta, ip)` e
chamar em:
- Login bem-sucedido + falha
- Criação/edição/desativação de usuário
- Criação/edição/exclusão de equipamento, material, analito
- Lançamento de corrida
- Alteração de configuração Westgard
- Resolução de não conformidade
- Export de relatório

Página `/admin/auditoria` para listar (admin only) com filtros por user/ação/data.

### 1.8 Remover link `/forgot-password` quebrado
**Risco:** usuário clica, vai pra 404/login, percebe que não tem recuperação → tickets.
Também deixa abertura pra phishing: atacante diz "clique no link do sistema".
**Ação rápida:** esconder o link até implementar. **Ação completa:** implementar fluxo
com token temporário via Resend (já temos chave).

---

## FASE 2 — Importante (primeira semana de produção)

### 2.1 Auditoria do isolamento multi-tenant
**Risco:** uma API que esquece `where: { tenantId }` vaza dados entre laboratórios.
**Ação:** checklist manual por rota API + adicionar teste E2E que cria 2 tenants e
tenta cross-access. Rotas a revisar:
- `/api/equipamentos`, `/api/materiais`, `/api/analitos`
- `/api/runs`, `/api/dashboard`
- `/api/relatorios/*`
- `/api/usuarios`, `/api/unidades`

Padrão: toda query Prisma que toque entidade do tenant precisa de
`where: { ... unit: { tenantId: session.user.tenantId } }` ou equivalente.

### 2.2 Autorização por role em cada rota
**Risco:** VIEWER conseguindo criar corridas, ANALYST editando usuários etc.
**Estado atual:** só `/api/usuarios` valida ADMIN/SUPERADMIN.
**Ação:** matriz de permissões documentada + guard reutilizável:
```
SUPERADMIN: tudo (suporte Alchemy)
ADMIN:      tudo no tenant
SUPERVISOR: CRUD exceto usuários/unidades
ANALYST:    criar runs, ver tudo, não edita cadastros
VIEWER:     só GET
```
Criar `requireRole(session, ["ADMIN"])` helper e aplicar em todos POST/PATCH/DELETE.

### 2.3 CSRF em rotas mutating
NextAuth v5 com JWT + cookies `SameSite=Lax` já mitiga o essencial, mas como as APIs
aceitam `Content-Type: application/json` sem checagem de Origin, vale adicionar:
- Middleware que rejeita POST/PATCH/DELETE sem `Origin` matching o host do app.
- Ou migrar para `SameSite=Strict` se não precisar de redirect OAuth.

### 2.4 Rotação de `AUTH_SECRET`
**Ação:** trocar o secret atual (considerá-lo comprometido dado o histórico de ARG no
Dockerfile). Documentar rotação trimestral.

### 2.5 Backup do Postgres
**Risco:** ransomware, dedo-duro, disaster recovery.
**Ação:**
- pgdump diário automatizado (Coolify ou cron externo) → S3/Backblaze com versionamento
  e retenção mínima 30 dias.
- Teste de restore trimestral (plano documentado).
- Criptografia em repouso no storage do backup.

### 2.6 HTTPS obrigatório + certificado válido
**Ação:**
- Verificar que Coolify está com Let's Encrypt ativo e renovação automática.
- Redirect 301 de HTTP → HTTPS (já deve estar no proxy do Coolify, confirmar).
- HSTS (item 1.1) só ativa após confirmar que HTTPS nunca falha.

### 2.7 Dependency scanning
**Ação:**
- Adicionar `npm audit --omit=dev` no CI (GitHub Actions).
- Dependabot/Renovate para PRs automáticos de atualização.
- Rodar `npm audit` hoje e corrigir CVEs high/critical.

### 2.8 Error handling que não vaza stack traces
**Risco:** `console.error(e.message)` em rotas API pode retornar detalhes do DB.
**Ação:**
- Verificar todos `catch` nas rotas API: retornar `{ error: "Erro interno" }` genérico.
- Log estruturado para server side (Pino/Winston), não pra response.

---

## FASE 3 — LGPD e compliance

### 3.1 Termo de uso + política de privacidade
**Estado atual:** links `/privacidade` e `/termos` apontam para 404.
**Ação:** criar páginas com:
- Finalidade do tratamento (operacional — CQI).
- Bases legais (art. 7º LGPD — legítimo interesse, execução de contrato).
- Dados coletados (nome, e-mail, senha hash, IP, logs de acesso).
- Retenção (seguindo Portaria MS 2031/2004 para lab — 5 anos).
- Direitos do titular (art. 18) + canal para exercê-los.
- DPO (pode ser o responsável técnico do lab ou terceirizado).

### 3.2 Consentimento de cookies
Atualmente só há cookie de sessão (essencial, não requer consent). Se adicionar analytics
(GA, Plausible), banner é obrigatório.

### 3.3 Direitos do titular implementados
- **Portabilidade/acesso:** página `/perfil/dados` que exporta JSON com tudo do usuário.
- **Correção:** já existe (editar perfil).
- **Eliminação:** soft delete com anonimização após período legal
  (`name → "Usuário removido"`, `email → "deleted-{id}@x.invalid"`, `passwordHash → null`).
- **Revogação de consentimento:** via solicitação ao DPO.

### 3.4 Data minimization
Revisar: estamos coletando só o necessário? Evitar adicionar CPF, telefone etc. sem
justificativa clara e base legal.

### 3.5 Contrato de operação (se Alchemy hospeda)
Se Alchemy (operador) hospeda dados do laboratório (controlador), precisa contrato
com cláusulas LGPD: escopo, segurança, sub-operadores (Coolify, DB host, Resend),
notificação de incidentes em até 72h.

---

## FASE 4 — Monitoramento e melhoria contínua

### 4.1 Observabilidade
- **Logs centralizados:** Coolify + Loki/Grafana ou Axiom/BetterStack.
- **Alertas:** 5xx spike, falhas de login acima do baseline, queries lentas.
- **Uptime:** Uptime Kuma (self-hosted) ou BetterStack — notifica em 1 min.

### 4.2 2FA (TOTP)
Implementar após basics estarem sólidos. Próximo nível — opcional no primeiro cliente,
obrigatório para ADMIN assim que possível. `next-auth` + `otpauth` lib.

### 4.3 Pentest / code review externo
Antes de escalar para múltiplos laboratórios, contratar pentest de app web
(OWASP Top 10 + específico multi-tenant). Budget ~R$ 5-12k para escopo compacto.

### 4.4 SBOM e supply chain
- `npm ci` em vez de `npm install` no Dockerfile (já fazemos).
- Lockfile commitado (já fazemos).
- Considerar `socket.dev` ou `snyk` para detectar pacotes maliciosos.

### 4.5 Plano de resposta a incidentes
Documento curto com:
- Quem liga pra quem (telefone do DPO e do time técnico).
- Passos: conter → investigar → notificar ANPD em 72h → comunicar titulares.
- Template de aviso.

---

## Priorização recomendada

| Prazo | Itens | Esforço |
|---|---|---|
| **Hoje** | 1.2, 1.4, 1.6, 1.8 | 2-3h |
| **Esta semana** | 1.1, 1.3, 1.5, 1.7, 2.1, 2.2 | 2-3 dias |
| **Antes do cliente** | 2.3-2.8, 3.1, 3.3 | 3-4 dias |
| **1º mês de produção** | 4.1, 4.2 | 1 semana |
| **1º trimestre** | 4.3, 4.5 | sob demanda |

## Verificação rápida (checklist pré-entrega)
- [ ] Cliente usa HTTPS com cert válido e HSTS ativo
- [ ] Secrets rotacionados após remoção dos ARG do Dockerfile
- [ ] Rate limit no login funcionando (testar com 6 tentativas)
- [ ] Nenhuma rota API retorna dados de outro tenant (testar com 2 contas)
- [ ] AuditLog escreve em login + CRUD de usuários
- [ ] Política de senha nova bloqueia "12345678"
- [ ] Backup do Postgres rodou com sucesso pelo menos 1x
- [ ] `npm audit` sem high/critical
- [ ] Links `/privacidade` e `/termos` apontam para páginas reais
