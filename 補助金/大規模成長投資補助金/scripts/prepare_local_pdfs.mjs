#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source-dir") result.sourceDir = argv[++i];
  }
  return result;
}

const { sourceDir } = parseArgs(process.argv.slice(2));
if (!sourceDir) {
  throw new Error("Usage: node scripts/prepare_local_pdfs.mjs --source-dir <growth-investment-1-4-analysis>");
}

const sourceFile = path.join(sourceDir, "all_review", "all_review_box_augmented.json");
const review = JSON.parse(await fs.readFile(sourceFile, "utf8"));
const pdfDir = path.join(projectDir, "local_assets", "pdfs");
await fs.mkdir(pdfDir, { recursive: true });

const rows = review.cases.map((item) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(item.case_id)) throw new Error(`Unsafe case_id: ${item.case_id}`);
  return {
    case_id: item.case_id,
    round: item.round,
    company: item.company,
    source: item.pdf_path,
    destination: path.join(pdfDir, `${item.case_id}.pdf`),
    local_path: `local_assets/pdfs/${item.case_id}.pdf`,
    source_filename: path.basename(item.pdf_path),
  };
});

let copied = 0;
let skipped = 0;
let cursor = 0;
const workers = Array.from({ length: 8 }, async () => {
  while (cursor < rows.length) {
    const row = rows[cursor++];
    const sourceStat = await fs.stat(row.source);
    let destinationStat;
    try {
      destinationStat = await fs.stat(row.destination);
    } catch {
      destinationStat = null;
    }
    if (destinationStat?.size === sourceStat.size) {
      skipped += 1;
    } else {
      await fs.copyFile(row.source, row.destination);
      copied += 1;
    }
    row.bytes = sourceStat.size;
  }
});
await Promise.all(workers);

const manifest = rows.map(({ source, destination, ...publicRow }) => publicRow);
await fs.writeFile(
  path.join(projectDir, "local_assets", "manifest.json"),
  `${JSON.stringify({ count: manifest.length, bytes: manifest.reduce((sum, row) => sum + row.bytes, 0), rows: manifest }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ pdfs: rows.length, copied, skipped, bytes: manifest.reduce((sum, row) => sum + row.bytes, 0) }, null, 2));
