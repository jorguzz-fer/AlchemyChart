'use strict';
/**
 * Seed de produção — Alchemypet Medicina Diagnóstica
 * Idempotente: verifica existência antes de criar.
 * Uso: node /app/prisma/seed.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const TENANT_SLUG = 'alchemypet';
const TENANT_NAME = 'Alchemypet Medicina Diagnóstica';
const UNIT_NAME   = 'Matriz';
const ADMIN_EMAIL = 'adilson@alchemypet.com.br';
const ADMIN_NAME  = 'Adilson Kleber Ferreira';
const ADMIN_PASS  = 'alchemy@2026';

const EQUIPAMENTOS = [
  { key: 'au480-1',  name: 'AU 480 (1)',    model: 'AU 480' },
  { key: 'au480-2',  name: 'AU 480 (2)',    model: 'AU 480' },
  { key: 'hemato-1', name: 'HEMATO 01',     model: 'ADVIA 2120' },
  { key: 'hemato-2', name: 'HEMATO 02',     model: 'ADVIA 2120' },
  { key: 'immulite', name: 'Immulite 2000', model: 'Immulite 2000' },
];

const MATERIAIS = [
  { key: 'bio-n2',   name: 'Controle Bioquímica N2',   generation: 'Nível 2' },
  { key: 'hemo-n2',  name: 'Controle Hematologia N2',  generation: 'Nível 2' },
  { key: 'imuno-n1', name: 'Controle Imunologia N1',   generation: 'Nível 1' },
];

const ANALITOS_BIO = [
  ['Ácido úrico','mg/dL',2,'bio-n2'],['Albumina','g/dL',2,'bio-n2'],
  ['ALT','U/L',2,'bio-n2'],['Amilase','U/L',2,'bio-n2'],
  ['AST','U/L',2,'bio-n2'],['Bilirrubina direta','mg/dL',2,'bio-n2'],
  ['Bilirrubina total','mg/dL',2,'bio-n2'],['Cálcio','mg/dL',2,'bio-n2'],
  ['CK-MB','U/L',2,'bio-n2'],['Cloreto','mEq/L',2,'bio-n2'],
  ['Colesterol total','mg/dL',2,'bio-n2'],['CPK','U/L',2,'bio-n2'],
  ['Creatinina','mg/dL',2,'bio-n2'],['Ferro','µg/dL',2,'bio-n2'],
  ['Fosfatase alcalina','U/L',2,'bio-n2'],['Fósforo','mg/dL',2,'bio-n2'],
  ['Frutosamina','µmol/L',2,'bio-n2'],['GGT','U/L',2,'bio-n2'],
  ['Glicose','mg/dL',2,'bio-n2'],['HDL','mg/dL',2,'bio-n2'],
  ['LDH','U/L',2,'bio-n2'],['Lipase','U/L',2,'bio-n2'],
  ['Magnésio','mg/dL',2,'bio-n2'],['Potássio','mEq/L',2,'bio-n2'],
  ['Proteína total','g/dL',2,'bio-n2'],['Sódio','mEq/L',2,'bio-n2'],
  ['Triglicérides','mg/dL',2,'bio-n2'],['Ureia','mg/dL',2,'bio-n2'],
];

const ANALITOS_HEMO = [
  ['01. Leucócitos','10³/µL',2,'hemo-n2'],['02. Hemácias (RBC)','10⁶/µL',2,'hemo-n2'],
  ['03. Hemoglobina','g/dL',2,'hemo-n2'],['04. Hematócrito','%',2,'hemo-n2'],
  ['05. VCM','fL',2,'hemo-n2'],['06. HCM','pg',2,'hemo-n2'],
  ['07. CHCM','g/dL',2,'hemo-n2'],['08. RDW-CV','%',2,'hemo-n2'],
  ['09. Plaquetas','10³/µL',2,'hemo-n2'],['10. VPM','fL',2,'hemo-n2'],
];

const ANALITOS_IMUNO = [
  ['cortisol','µg/dL',1,'imuno-n1'],['insulina','µUI/mL',1,'imuno-n1'],
  ['progesterona','ng/mL',1,'imuno-n1'],['T3 total','ng/dL',1,'imuno-n1'],
  ['T4 livre','ng/dL',1,'imuno-n1'],['T4 total','µg/dL',1,'imuno-n1'],
  ['tsh','µUI/mL',1,'imuno-n1'],
];

async function upsertAnalitos(list, eqId, matMap, unitId) {
  for (const [name, unit, level, matKey] of list) {
    const exists = await prisma.analyte.findFirst({
      where: { unitId, equipmentId: eqId, name, level },
    });
    if (!exists) {
      await prisma.analyte.create({
        data: { unitId, equipmentId: eqId, materialId: matMap[matKey].id, name, unit, level, active: true },
      });
    }
  }
}

async function main() {
  console.log('→ Seed de produção iniciado...\n');

  // Tenant
  let tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: TENANT_NAME, slug: TENANT_SLUG, plan: 'PRO', active: true } });
    console.log(`✓ Tenant: ${tenant.name}`);
  } else { console.log(`  Tenant: ${tenant.name} (existente)`); }

  // Unit
  let unit = await prisma.unit.findFirst({ where: { tenantId: tenant.id, name: UNIT_NAME } });
  if (!unit) {
    unit = await prisma.unit.create({ data: { tenantId: tenant.id, name: UNIT_NAME, active: true } });
    console.log(`✓ Unidade: ${unit.name}`);
  } else { console.log(`  Unidade: ${unit.name} (existente)`); }

  // Admin
  let user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!user) {
    const hash = await bcrypt.hash(ADMIN_PASS, 10);
    user = await prisma.user.create({
      data: { tenantId: tenant.id, unitId: unit.id, name: ADMIN_NAME, email: ADMIN_EMAIL, passwordHash: hash, role: 'ADMIN', active: true },
    });
    console.log(`✓ Admin: ${ADMIN_EMAIL} / ${ADMIN_PASS}`);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { tenantId: tenant.id, unitId: unit.id } });
    console.log(`  Admin: ${ADMIN_EMAIL} (existente — tenant/unit atualizado)`);
  }

  // Equipamentos
  const eqMap = {};
  for (const eq of EQUIPAMENTOS) {
    let e = await prisma.equipment.findFirst({ where: { unitId: unit.id, name: eq.name } });
    if (!e) { e = await prisma.equipment.create({ data: { unitId: unit.id, name: eq.name, model: eq.model, active: true } }); console.log(`✓ Equipamento: ${e.name}`); }
    eqMap[eq.key] = e;
  }

  // Materiais
  const matMap = {};
  for (const mat of MATERIAIS) {
    let m = await prisma.material.findFirst({ where: { unitId: unit.id, name: mat.name } });
    if (!m) { m = await prisma.material.create({ data: { unitId: unit.id, name: mat.name, generation: mat.generation, active: true } }); console.log(`✓ Material: ${m.name}`); }
    matMap[mat.key] = m;
  }

  // Analitos
  for (const eqKey of ['au480-1', 'au480-2']) {
    await upsertAnalitos(ANALITOS_BIO, eqMap[eqKey].id, matMap, unit.id);
    console.log(`✓ Bioquímica (${ANALITOS_BIO.length}) → ${eqMap[eqKey].name}`);
  }
  for (const eqKey of ['hemato-1', 'hemato-2']) {
    await upsertAnalitos(ANALITOS_HEMO, eqMap[eqKey].id, matMap, unit.id);
    console.log(`✓ Hematologia (${ANALITOS_HEMO.length}) → ${eqMap[eqKey].name}`);
  }
  await upsertAnalitos(ANALITOS_IMUNO, eqMap['immulite'].id, matMap, unit.id);
  console.log(`✓ Imunologia (${ANALITOS_IMUNO.length}) → ${eqMap['immulite'].name}`);

  const total = await prisma.analyte.count({ where: { unitId: unit.id } });
  console.log(`\n✅ Seed concluído! ${total} analitos cadastrados.`);
  console.log(`   Login: ${ADMIN_EMAIL}  |  Senha: ${ADMIN_PASS}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
