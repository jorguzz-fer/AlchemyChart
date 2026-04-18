'use strict';
// Aplica o schema inicial usando @prisma/client (sem o CLI do Prisma)
// Roda antes do server.js no entrypoint.sh

const { PrismaClient } = require('@prisma/client');
const { readFileSync } = require('fs');
const { join } = require('path');

async function main() {
  const prisma = new PrismaClient();

  // Verifica se o schema já existe
  try {
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
    console.log('✓ Schema já existe — pulando migration');
    await prisma.$disconnect();
    return;
  } catch (_) {}

  console.log('→ Aplicando schema inicial...');
  const sql = readFileSync(join(__dirname, 'prisma/migrations/0001_init/migration.sql'), 'utf8');

  const statements = sql
    .replace(/--[^\n]*/g, '')   // remove comentários
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 4);

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
  }

  console.log('✓ Schema aplicado com sucesso');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Migration falhou:', e.message);
  process.exit(1);
});
