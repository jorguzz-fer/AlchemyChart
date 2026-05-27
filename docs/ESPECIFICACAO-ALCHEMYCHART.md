# Especificação — AlchemyChart (Controle de Qualidade Interno Laboratorial)

> **Propósito deste documento:** servir de base para a elaboração de uma proposta
> comercial/técnica ao cliente. Descreve o que é o produto, o escopo funcional, a
> arquitetura, o estado atual de desenvolvimento e o que ainda está pendente.
> Status do projeto: **em desenvolvimento** (não finalizado).
>
> Última atualização: 2026-05-27.

---

## 1. Visão geral

**AlchemyChart** (nome interno do repositório: *Alchemy Control Chart*) é um sistema
web **SaaS multi-tenant** de **Controle de Qualidade Interno (CQI)** para
laboratórios, com foco em **laboratórios veterinários**. Substitui o controle manual
em planilhas (cartas de Levey-Jennings, aplicação das regras de Westgard, gestão de
materiais de controle e rastreabilidade) por uma plataforma centralizada,
auditável e multiusuário.

O sistema permite que cada laboratório (tenant) gerencie suas unidades,
equipamentos, materiais de controle, analitos e o lançamento diário de corridas de
controle, aplicando automaticamente as regras estatísticas que classificam cada
resultado como **OK / Alerta / Rejeição**, além de gerar relatórios gerenciais e
de não conformidades.

### Problema que resolve
- Elimina o controle de qualidade feito em planilhas avulsas, propenso a erro.
- Automatiza a avaliação multirregra de Westgard a cada lançamento.
- Centraliza a rastreabilidade (quem lançou, quando, com qual material/lote).
- Gera relatórios e evidências para acreditação/auditoria.
- Gerencia validade e status dos materiais de controle.

---

## 2. Perfis de usuário (RBAC)

Cinco papéis, com escopo crescente de permissão:

| Papel | Descrição |
|---|---|
| `SUPERADMIN` | Equipe Alchemy (administração da plataforma). |
| `ADMIN` | Gestor do laboratório (tenant). |
| `SUPERVISOR` | Supervisor da unidade. |
| `ANALYST` | Analista — lança corridas de controle. |
| `VIEWER` | Somente visualização. |

Controle de acesso aplicado por *tenant* e por unidade. Toda ação relevante é
registrada em log de auditoria.

---

## 3. Modelo SaaS / Multi-tenancy

Hierarquia: **Tenant (laboratório) → Unit (unidade) → User (usuário)**.

- Isolamento de dados por tenant em todas as consultas.
- Planos comerciais previstos no modelo de dados: `FREE`, `BASIC`, `PRO`,
  `ENTERPRISE` (a política de limites por plano e a precificação ainda devem ser
  definidas — ver §10).
- Cadastro self-service (signup) e fluxo de recuperação de senha por e-mail.

---

## 4. Escopo funcional

### 4.1 Autenticação e conta
- Login com e-mail/senha (Auth.js v5, hash bcrypt).
- Cadastro (signup) com criação de tenant.
- Recuperação de senha por e-mail (solicitação + confirmação por token).
- Páginas legais: Termos de Uso e Política de Privacidade.

### 4.2 Cadastros base
- **Equipamentos:** nome, modelo, número de série, status ativo/inativo, controle
  de manutenção (última/próxima manutenção).
- **Materiais de controle:** nome, lote, geração, fabricante, validade
  (`expiresAt`), alerta de vencimento configurável (ativar/desativar e nº de dias
  de antecedência), flag "não ensaiado", status ativo/inativo.
  - **Exclusão de material** com proteção: bloqueada quando há corridas associadas
    (preserva o histórico); materiais inativos ficam ocultos da lista por padrão,
    com opção "Mostrar inativos".
- **Analitos:** nome, unidade de medida, casas decimais, nível (1=normal,
  2=patológico, 3=intermediário), imprecisão máxima permitida e fonte da
  imprecisão, configuração de regras de Westgard **por analito** (JSON).
- **Associação Analito × Equipamento × Material × Nível** (`AnalyteMaterial`):
  guarda os **valores de bula** do fabricante (média Xm e desvio-padrão DP) e o
  **status do material** (`PRONTO` / `PREPARO` / `EXPIRADO` / `DESABILITADO`).
  - Edição **inline** dos valores de bula (Xm/DP) diretamente na tela do material.

### 4.3 Lançamento de corridas (controle diário)
- **Lançamento em massa** por equipamento: grade com analitos × níveis (até 3
  níveis) e condições do controle (Ativo / Preparo).
- A cada valor lançado, o sistema calcula o escore-z e aplica as regras de
  Westgard, classificando como **OK**, **Alerta** (±2s) ou **Rejeição** (±3s/regra
  de rejeição), exibindo as violações detectadas.
- **Campo de observação por linha**, gravado em todas as corridas lançadas naquela
  linha (registro de intercorrências).
- Edição e exclusão de corridas individuais.

### 4.4 Engine estatística (Westgard)
Implementação configurável das **8 regras de Westgard**, com estado por regra
(`OFF` / `ALERT` / `REJECT`) definido por analito:

| Regra | Significado |
|---|---|
| `1:2s` | 1 corrida fora de ±2s (alerta/warning). |
| `1:3s` | 1 corrida fora de ±3s (rejeição grave). |
| `2:2s` | 2 consecutivas fora de ±2s do mesmo lado. |
| `R:4s` | Atual e anterior em lados opostos, amplitude > 4s. |
| `4:1s` | 4 consecutivas fora de ±1s do mesmo lado. |
| `7T` | 7 consecutivas em tendência (crescente ou decrescente). |
| `7Xm` | 7 consecutivas do mesmo lado da média. |
| `10Xm` | 10 consecutivas do mesmo lado da média. |

- "Rejeição" prevalece sobre "Alerta".
- Estatísticas por período (`StatPeriod`): média, DP, CV e N de corridas.

### 4.5 Visualização e análise
- **Dashboard** com indicadores gerais.
- **Painel de analitos** com cartas de controle (Levey-Jennings) renderizadas em
  gráficos (ApexCharts).
- **CV mensal** por analito.
- Detalhe do analito com histórico de corridas.

### 4.6 Relatórios
- Controles ativos.
- Equipamentos × analitos.
- Incertezas (imprecisão/CV).
- Intervenções.
- Não conformidades.
- Revisão por data.
- Revisão por material.

### 4.7 Não conformidades
- Registro de não conformidade vinculado a uma corrida, com descrição, ação
  corretiva e data de resolução.

### 4.8 Auditoria
- Log de auditoria por tenant: ação, entidade, ID, metadados, IP, usuário e data.
- Tela de consulta de auditoria.

### 4.9 Administração e importação de dados
- Gestão de usuários (admin).
- Importação de analitos a partir de planilha (formato QualiChart, `.xlsx`).
- Importação de corridas (de planilha QualiChart e de PDF).

---

## 5. Arquitetura e stack técnica

| Camada | Tecnologia |
|---|---|
| Framework web | **Next.js 15** (App Router, Turbopack), **React 19** |
| Linguagem | **TypeScript** |
| ORM / Banco | **Prisma** + **PostgreSQL** |
| Autenticação | **Auth.js v5** (NextAuth) + adapter Prisma, bcrypt |
| Validação | **Zod** + react-hook-form |
| UI | **Tailwind CSS**, Headless UI, Material Symbols, Remix Icon |
| Gráficos | **ApexCharts** (react-apexcharts) |
| E-mail | **Resend** |
| Cache/fila | **Redis** |
| Armazenamento de objetos | **MinIO** (compatível S3) |
| Importação de planilhas | **xlsx** (SheetJS) |
| Deploy | **Docker** / **Coolify** (VPS) |

### Modelo de dados (entidades principais)
`Tenant`, `Unit`, `User`, `Equipment`, `Material`, `Analyte`,
`AnalyteMaterial` (junção com valores de bula e status), `StatPeriod`,
`Run` (corrida), `NonConformity`, `AuditLog`, além das tabelas de sessão/conta do
Auth.js. Enums: `Plan`, `Role`, `RunStatus`.

---

## 6. Requisitos não funcionais

- **Segurança:** autenticação por sessão, hash de senha (bcrypt), rate limiting,
  isolamento multi-tenant, política de segurança documentada (`SECURITY.md`).
- **Privacidade/LGPD:** páginas de Termos e Privacidade; log de auditoria com IP e
  rastreabilidade de ações.
- **Rastreabilidade:** toda corrida registra usuário, data/hora, equipamento e
  material/lote utilizados.
- **Internacionalização:** interface em **português (Brasil)**; tratamento de
  fuso horário.
- **Responsividade:** layout adaptado para uso em desktop.

---

## 7. Infraestrutura e implantação

- Stack em **Docker Compose** (app + PostgreSQL + Redis + MinIO).
- Implantação via **Coolify** em VPS, com domínio dedicado.
- Variáveis de ambiente para banco, Auth.js, Redis, MinIO e Resend.
- Migrações de banco via Prisma (`prisma migrate deploy`).
- Criação do primeiro usuário admin via script de seed.

---

## 8. Estado atual do desenvolvimento

**Funcionalidades implementadas** (núcleo operacional):
- Autenticação completa (login, signup, recuperação de senha).
- Cadastros de equipamentos, materiais e analitos.
- Associação analito×equipamento×material×nível com valores de bula.
- Lançamento em massa de corridas com avaliação Westgard em tempo real.
- Dashboard, painel de cartas de controle, CV mensal.
- Conjunto de relatórios gerenciais.
- Não conformidades e auditoria.
- Importação de analitos e corridas (QualiChart/PDF).

**Ajustes recentes** (em revisão na branch de desenvolvimento):
- Exclusão de material com proteção de histórico + ocultar inativos.
- Edição inline dos valores de bula (Xm/DP).
- Campo de observação por linha no lançamento em massa.

---

## 9. Pendências e roadmap técnico

- **Consolidação do modelo de associações:** o `Analyte` legado carrega hoje
  `equipmentId`/`materialId` e o vínculo canônico está migrando para
  `AnalyteMaterial`. Próximas fases: tornar `Run.analyteMaterialId` obrigatório e
  remover o `Run.analyteId` legado após a deduplicação.
- Definição da política de limites e recursos por plano (`FREE`/`BASIC`/`PRO`/
  `ENTERPRISE`).
- Validação funcional ponta a ponta (testes de UI/integração) dos fluxos recentes.

---

## 10. Pontos a definir para a proposta comercial

Estes itens **não estão definidos no produto** e precisam ser decididos para
compor a proposta ao cliente:

1. **Modelo de cobrança:** por tenant, por unidade, por usuário, por volume de
   corridas, ou licença fixa? Quais limites por plano?
2. **Escopo da contratação:** SaaS hospedado pela Alchemy x implantação dedicada
   no ambiente do cliente.
3. **Nível de suporte / SLA:** horário de atendimento, tempo de resposta,
   manutenção e atualizações.
4. **Onboarding e migração de dados:** importação inicial (planilhas QualiChart,
   PDFs), treinamento de usuários.
5. **Customizações específicas do cliente:** relatórios adicionais, integrações
   com LIS/equipamentos, marca/identidade visual.
6. **Conformidade/acreditação:** requisitos específicos (ex.: ISO 15189, PALC,
   RDC) que demandem evidências ou trilhas adicionais.
7. **Prazos e marcos de entrega** das pendências do roadmap (§9).

---

## 11. Glossário

- **CQI:** Controle de Qualidade Interno.
- **Corrida (Run):** medição de um material de controle em um analito/nível.
- **Analito:** parâmetro mensurável (ex.: glicose, ureia).
- **Material de controle:** soro/material com valores-alvo (bula) usado para
  monitorar o desempenho analítico.
- **Xm / DP:** média e desvio-padrão de bula (fabricante).
- **Levey-Jennings:** carta de controle que plota resultados contra média ± SD.
- **Regras de Westgard:** conjunto de regras estatísticas multirregra para
  detectar erros sistemáticos e aleatórios.
- **Tenant:** laboratório cliente (unidade de isolamento do SaaS).
