# Alchemy Control Chart

Sistema de Controle de Qualidade Interno (CQI) para laboratórios veterinários.  
Stack: Next.js 15 · Prisma · PostgreSQL · Auth.js v5 · Redis · MinIO · Coolify

---

## Deploy no Coolify

### 1. Pré-requisitos

- Coolify instalado no VPS
- Domínio `qualicontrol.tudomudou.com.br` apontando para o VPS
- Repo clonado / conectado ao Coolify

### 2. Criar o Stack no Coolify

1. **New Resource → Docker Compose**
2. Cole o conteúdo de `docker-compose.yml`
3. Em **Environment Variables**, adicione todas as variáveis de `.env.example` com os valores reais

### 3. Variáveis de ambiente obrigatórias

| Variável | Descrição | Como gerar |
|---|---|---|
| `AUTH_SECRET` | Chave secreta do Auth.js | `openssl rand -base64 32` |
| `AUTH_URL` | URL pública sem barra final | `https://qualicontrol.tudomudou.com.br` |
| `DATABASE_URL` | Connection string PostgreSQL | Ver abaixo |
| `POSTGRES_PASSWORD` | Senha do banco | Senha forte aleatória |
| `REDIS_PASSWORD` | Senha do Redis | Senha forte aleatória |
| `MINIO_ROOT_PASSWORD` | Senha do MinIO | Senha forte aleatória |
| `RESEND_API_KEY` | API Key do Resend | resend.com → API Keys |
| `RESEND_FROM` | E-mail remetente | Domínio verificado no Resend |

**DATABASE_URL** (dentro da rede Docker):
```
postgresql://alchemy:POSTGRES_PASSWORD@postgres:5432/alchemy
```

### 4. Primeiro deploy

Após subir o stack, rode as migrations:

```bash
# No terminal do container `app` via Coolify
npx prisma migrate deploy
```

Ou adicione ao `CMD` do Dockerfile se preferir auto-migrate (não recomendado em produção).

### 5. Criar primeiro usuário admin

```bash
# No container `app`
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  const tenant = await prisma.tenant.create({
    data: { name: 'Alchemypet Medicina Diagnóstica', slug: 'alchemypet', plan: 'PRO' }
  });
  const unit = await prisma.unit.create({
    data: { tenantId: tenant.id, name: 'Matriz' }
  });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      unitId: unit.id,
      name: 'Admin',
      email: 'admin@alchemypet.com.br',
      passwordHash: await bcrypt.hash('TroqueEssaSenha123!', 12),
      role: 'ADMIN',
    }
  });
  console.log('Seed OK');
  process.exit(0);
}
seed().catch(console.error);
"
```

### 6. Acesso ao MinIO Console

`http://SEU_IP:9001` — login com `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`

Crie o bucket `alchemy-uploads` com política pública de leitura para arquivos de laudos.

---

## Desenvolvimento local

```bash
# Instalar deps
cd app && npm install

# Subir banco local (requer Docker)
docker run -d --name alchemy-pg \
  -e POSTGRES_DB=alchemy \
  -e POSTGRES_USER=alchemy \
  -e POSTGRES_PASSWORD=dev123 \
  -p 5432:5432 postgres:16-alpine

# Copiar e preencher .env
cp ../.env.example .env.local
# Edite DATABASE_URL para: postgresql://alchemy:dev123@localhost:5432/alchemy

# Rodar migrations e gerar client
npx prisma migrate dev

# Iniciar dev server
npm run dev
```

Acesse: http://localhost:3000

---

## Estrutura do projeto

```
Alchemy-Control-Chart/
├── app/                          # Next.js app
│   ├── prisma/schema.prisma      # Schema do banco
│   ├── src/
│   │   ├── app/                  # App Router (páginas)
│   │   │   ├── api/auth/         # Auth.js handlers
│   │   │   ├── dashboard/
│   │   │   ├── analitos/
│   │   │   └── login/
│   │   ├── components/           # Componentes reutilizáveis
│   │   │   └── Layout/           # Header, Sidebar
│   │   ├── lib/                  # db.ts, auth.ts
│   │   └── providers/            # LayoutProvider
│   ├── next.config.ts
│   └── package.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Regras Westgard implementadas

| Regra | Tipo | Descrição |
|---|---|---|
| 1:2s | Alerta | 1 ponto além de ±2s |
| 1:3s | Rejeição | 1 ponto além de ±3s |
| 2:2s | Rejeição | 2 pontos consecutivos além de ±2s no mesmo lado |
| R:4s | Rejeição | 1 ponto +2s e 1 ponto -2s no mesmo lote |
| 4:1s | Rejeição | 4 consecutivos além de ±1s no mesmo lado |
| 7T | Rejeição | 7 consecutivos em tendência ascendente/descendente |
| 7Xm | Rejeição | 7 consecutivos no mesmo lado da média |
| 10Xm | Rejeição | 10 consecutivos no mesmo lado da média |
