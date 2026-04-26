'use strict';
// Aplica todas as migrations Prisma pendentes (sem o CLI do Prisma).
// Mantém uma tabela "_app_migrations" como tracking idempotente.
// Roda antes do server.js no entrypoint.sh

const { PrismaClient } = require('@prisma/client');
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

// Splitter que respeita blocos DO $$ ... $$ (que contêm ; internos).
function splitSqlStatements(sql) {
  // Remove comentários de linha (-- até fim da linha)
  const cleaned = sql.replace(/--[^\n]*/g, '');

  const statements = [];
  let current = '';
  let inDollarBlock = false;

  let i = 0;
  while (i < cleaned.length) {
    // Detecta delimitador $$ (abre/fecha bloco)
    if (cleaned.substring(i, i + 2) === '$$') {
      inDollarBlock = !inDollarBlock;
      current += '$$';
      i += 2;
      continue;
    }

    const c = cleaned[i];
    if (c === ';' && !inDollarBlock) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
    } else {
      current += c;
    }
    i++;
  }

  const trimmedLast = current.trim();
  if (trimmedLast.length > 0) statements.push(trimmedLast);

  return statements;
}

async function applyMigrationFile(prisma, name) {
  const path = join(__dirname, 'prisma/migrations', name, 'migration.sql');
  const sql = readFileSync(path, 'utf8');
  const stmts = splitSqlStatements(sql);

  for (const stmt of stmts) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e) {
      // Tolera "already exists" / "duplicate" (idempotência caso restart no meio)
      const msg = (e && e.message) || '';
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate key value')
      ) {
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const prisma = new PrismaClient();

  try {
    // 1. Cria tabela de tracking própria (separada da _prisma_migrations
    //    para não conflitar com instâncias que usam o CLI do Prisma)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        "name"      TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Se a tabela "User" já existe (deploys anteriores aplicaram 0001_init
    //    sem usar tracking), marca 0001 como aplicada para não reaplicar.
    let userTableExists = false;
    try {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM "User" LIMIT 1`);
      userTableExists = true;
    } catch (_) {
      userTableExists = false;
    }
    if (userTableExists) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_app_migrations"("name") VALUES('0001_init') ON CONFLICT DO NOTHING`
      );
    }

    // 3. Lista migrations do diretório em ordem (alfabética = cronológica)
    const migrationsDir = join(__dirname, 'prisma/migrations');
    const allMigrations = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    console.log(`→ Encontradas ${allMigrations.length} migration(s)`);

    for (const name of allMigrations) {
      const applied = await prisma.$queryRawUnsafe(
        `SELECT 1 FROM "_app_migrations" WHERE "name" = $1 LIMIT 1`,
        name
      );
      if (Array.isArray(applied) && applied.length > 0) {
        console.log(`✓ ${name} (já aplicada)`);
        continue;
      }

      console.log(`→ Aplicando ${name}...`);
      await applyMigrationFile(prisma, name);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_app_migrations"("name") VALUES($1) ON CONFLICT DO NOTHING`,
        name
      );
      console.log(`✓ ${name} aplicada com sucesso`);
    }

    console.log('→ Todas as migrations estão em dia');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Migration falhou:', e.message);
  console.error(e.stack);
  process.exit(1);
});
