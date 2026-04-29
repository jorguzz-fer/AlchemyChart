#!/usr/bin/env node
/**
 * parse-pdf-relatorios.js
 *
 * Extrai corridas de todos os PDFs em base/relatorio/ (formato "REVISÃO EM PREPARO").
 * Gera base/parsed-runs.json com estrutura pronta para o endpoint de importação.
 *
 * Requisito: pdftotext (poppler) — brew install poppler
 *
 * Uso:
 *   node scripts/parse-pdf-relatorios.js
 *   node scripts/parse-pdf-relatorios.js --dry-run   (imprime JSON, não salva)
 */

const { execSync } = require("child_process");
const { readdirSync, writeFileSync } = require("fs");
const { join, basename } = require("path");

const PDF_DIR = join(__dirname, "../base/relatorio");
// Primary output: inside the Next.js app so the API can read it
const OUTPUT = join(__dirname, "../app/prisma/seed-data/parsed-runs.json");
// Backup copy alongside the source PDFs
const OUTPUT_BACKUP = join(__dirname, "../base/parsed-runs.json");
const DRY_RUN = process.argv.includes("--dry-run");

// "287,870" → 287.87  |  "2959,520" → 2959.52  |  "37,000" → 37.0
function parseBrFloat(s) {
  if (!s) return null;
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// "02/04/2026" → "2026-04-02"
function parseBrDate(s) {
  const m = s && s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function extractText(pdfPath) {
  return execSync(`pdftotext -layout "${pdfPath}" -`, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

// --- Material table parser ---
function parseMaterialRows(lines, headerIdx) {
  const materials = [];
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 8, lines.length); i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\s*CA\s/.test(line) || trimmed.startsWith("CA ") || trimmed.includes("Material N1")) break;

    // Split on 2+ consecutive spaces (pdftotext -layout separates columns this way)
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length < 4) continue;

    const [materialName, lot, xmEmUso, dpEmUso] = parts;
    if (!lot || !lot.trim()) continue;

    materials.push({
      materialName: materialName.trim(),
      lot: lot.trim(),
      manufacturerMean: parseBrFloat(xmEmUso),
      manufacturerSD: parseBrFloat(dpEmUso),
    });
  }
  return materials;
}

// --- Column-position-aware corrida parser ---
// pdftotext -layout preserves column positions with spaces, so we use the character
// index of "N1", "N2", "N3" in the "Material N1 … Material N2 …" sub-header
// to determine which corrida column each numeric value belongs to.
function findColPositions(subHeader) {
  // Find "N1", "N2", "N3" — they appear as part of "Material N1", "Material N2", "Material N3"
  const n1 = subHeader.indexOf("N1");
  const n2 = subHeader.indexOf("N2");
  const n3 = subHeader.indexOf("N3");
  return { n1, n2, n3 };
}

// Extract first Brazilian number from line[start..end]
function extractNum(line, start, end) {
  const slice = line.substring(Math.max(0, start), end > 0 ? end : line.length);
  const m = slice.match(/[\d]+(?:,[\d]+)?/);
  return m ? parseBrFloat(m[0]) : null;
}

function parseRunRows(lines, caHeaderIdx) {
  // Locate the "Material N1 … Material N2 …" sub-header line
  let subHeader = null;
  let subHeaderIdx = -1;
  for (let i = caHeaderIdx; i < Math.min(caHeaderIdx + 5, lines.length); i++) {
    if (lines[i].includes("Material N1")) {
      subHeader = lines[i];
      subHeaderIdx = i;
      break;
    }
  }
  if (!subHeader) return [];

  const { n1, n2, n3 } = findColPositions(subHeader);

  // Column boundaries: midpoint between successive Nx centers, with a left buffer
  const col1Start = Math.max(0, n1 - 10);
  const col1End   = n2 > 0 ? Math.floor((n1 + n2) / 2) : n1 + 18;
  const col2End   = n3 > 0 ? Math.floor((n2 + n3) / 2) : n2 + 18;
  const col3End   = n3 > 0 ? n3 + 20 : -1;

  const runs = [];
  for (let i = subHeaderIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.includes("Página") || line.includes("©") || line.includes("GRÁFICOS")) break;

    // CA number can be 3–6 digits, followed by a date
    const caMatch = line.trimStart().match(/^(\d{3,6})\s+(\d{2}\/\d{2}\/\d{4})/);
    if (!caMatch) continue;

    const date = parseBrDate(caMatch[2]);
    if (!date) continue;

    const n1val = extractNum(line, col1Start, col1End);
    const n2val = n2 > 0 ? extractNum(line, col1End, col2End) : null;
    const n3val = n3 > 0 ? extractNum(line, col2End, col3End) : null;

    // Agent is the last token on the line after all numeric columns
    const afterCols = line.substring(col3End > 0 ? col3End : col2End).trim();
    const agentTokens = afterCols.split(/\s+/).filter(Boolean);
    const agent = agentTokens.length > 0 ? agentTokens[agentTokens.length - 1] : null;

    runs.push({
      ca: parseInt(caMatch[1], 10),
      date,
      n1: n1val,
      n2: n2val,
      n3: n3val,
      agent,
    });
  }
  return runs;
}

// --- Main PDF parser ---
function parsePdf(pdfPath) {
  const filename = basename(pdfPath, ".pdf");
  const underscoreIdx = filename.indexOf("_");
  if (underscoreIdx < 0) {
    console.warn(`  Skipping unexpected filename: ${filename}`);
    return null;
  }
  let analyteName = filename.slice(0, underscoreIdx).trim();
  let equipmentName = filename.slice(underscoreIdx + 1).trim();

  let text;
  try {
    text = extractText(pdfPath);
  } catch (e) {
    console.error(`  Error extracting text from ${filename}: ${e.message}`);
    return null;
  }

  const lines = text.split("\n");

  // Override names from "Sistema analítico: {name} - {equipment}"
  const sysLine = lines.find((l) => l.includes("Sistema anal"));
  if (sysLine) {
    const m = sysLine.match(/Sistema anal[íi]tico:\s*(.+?)\s*-\s*(.+?)\s*$/);
    if (m) {
      analyteName = m[1].trim();
      equipmentName = m[2].trim();
    }
  }

  // Material table header
  const matHeaderIdx = lines.findIndex(
    (l) => l.includes("XM em uso") && l.includes("DP em uso")
  );
  const materials =
    matHeaderIdx >= 0 ? parseMaterialRows(lines, matHeaderIdx) : [];

  if (materials.length === 0) {
    console.warn(`  No materials found in ${filename}`);
  }

  // Corridas table header ("CA   Data")
  const caHeaderIdx = lines.findIndex((l) => /^\s*CA\s+Data/.test(l));
  const runs = caHeaderIdx >= 0 ? parseRunRows(lines, caHeaderIdx) : [];

  return { analyteName, equipmentName, materials, runs };
}

// --- Entry point ---
function main() {
  let files;
  try {
    files = readdirSync(PDF_DIR)
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .sort();
  } catch (e) {
    console.error(`Cannot read PDF directory: ${PDF_DIR}\n${e.message}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} PDFs in ${PDF_DIR}\n`);

  const results = [];
  let totalRuns = 0;

  for (const file of files) {
    const pdfPath = join(PDF_DIR, file);
    process.stdout.write(`Parsing: ${file} ... `);
    const parsed = parsePdf(pdfPath);
    if (!parsed) {
      console.log("SKIPPED");
      continue;
    }
    const mats = parsed.materials.map((m) => `${m.lot}`).join(", ");
    console.log(`${parsed.materials.length} mat (${mats}), ${parsed.runs.length} corridas`);
    results.push(parsed);
    totalRuns += parsed.runs.length;
  }

  console.log(`\nTotal: ${results.length} analytes, ${totalRuns} corridas`);

  const output = {
    generatedAt: new Date().toISOString(),
    source: "base/relatorio PDFs — REVISÃO EM PREPARO",
    analytes: results,
  };

  if (DRY_RUN) {
    console.log("\n--- DRY RUN — JSON preview (first 2 analytes) ---");
    console.log(
      JSON.stringify({ ...output, analytes: output.analytes.slice(0, 2) }, null, 2)
    );
  } else {
    const json = JSON.stringify(output, null, 2);
    writeFileSync(OUTPUT, json, "utf8");
    writeFileSync(OUTPUT_BACKUP, json, "utf8");
    console.log(`\nSaved to:\n  ${OUTPUT}\n  ${OUTPUT_BACKUP}`);
  }
}

main();
