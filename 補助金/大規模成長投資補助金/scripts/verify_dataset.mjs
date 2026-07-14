#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countCsvRecords(text) {
  let records = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (text[i] === "\n" && !quoted) records += 1;
  }
  return records - 1;
}

const expected = {
  "cases.csv": 381,
  "metrics.csv": 1524,
  "sales_targets.csv": 381,
  "sales_annual.csv": 232,
  "boxes.csv": 1995,
  "validations.csv": 1524,
  "cost_validations.csv": 381,
  "pdf_manifest.csv": 381,
};

for (const [name, count] of Object.entries(expected)) {
  const text = await fs.readFile(path.join(projectDir, "data", "processed", name), "utf8");
  assert(countCsvRecords(text) === count, `${name}: row count mismatch`);
}

const cases = JSON.parse(await fs.readFile(path.join(projectDir, "html", "data", "cases.json"), "utf8"));
assert(cases.length === 381, "cases.json: expected 381 cases");
assert(new Set(cases.map((row) => row.case_id)).size === 381, "case_id must be unique");
assert(cases.every((row) => /^https:\/\//.test(row.pdf_url)), "all PDF URLs must be HTTPS links");

for (const [name, count] of [["pages.jsonl", 887], ["narratives.jsonl", 2999]]) {
  const lines = (await fs.readFile(path.join(projectDir, "data", "text", name), "utf8")).trim().split("\n");
  assert(lines.length === count, `${name}: row count mismatch`);
  for (const line of lines) JSON.parse(line);
}

const html = await fs.readFile(path.join(projectDir, "html", "index.html"), "utf8");
assert(html.includes("const DATA=["), "HTML must contain embedded case data");
assert(html.includes("data/processed/cases.csv"), "HTML must link to cases.csv");
const qaHtml = await fs.readFile(path.join(projectDir, "html", "qa.html"), "utf8");
assert(qaHtml.includes("抽出データ照合ワークベンチ"), "QA HTML title is missing");
assert(qaHtml.includes("const DATA=["), "QA HTML must contain embedded case data");
assert(qaHtml.includes("localStorage"), "QA HTML must persist review state");
assert(qaHtml.includes("review_results.csv"), "QA HTML must export review results");
assert(qaHtml.includes("../local_assets/pdfs/"), "QA HTML must use relative local PDF paths");
assert(qaHtml.includes("pdfOfficial"), "QA HTML must retain official PDF links");
for (const [name, document] of [["index.html", html], ["qa.html", qaHtml]]) {
  const scripts = [...document.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert(scripts.length > 0, `${name}: script is missing`);
  for (const script of scripts) new vm.Script(script, { filename: name });
}

const textFiles = [
  "README.md", "dataset_stats.json", "docs/methodology.md", "docs/data_dictionary.md",
  "docs/validation.md", "html/index.html", "html/qa.html", "html/data/cases.json", "scripts/build_dataset.mjs",
  "data/processed/cases.csv", "data/processed/pdf_manifest.csv",
];
for (const relative of textFiles) {
  const text = await fs.readFile(path.join(projectDir, relative), "utf8");
  assert(!/AtsushiSuzuki|C:\\Users\\|file:\/\//i.test(text), `${relative}: personal/absolute path found`);
}

const workbook = await fs.readFile(path.join(projectDir, "excel", "大規模成長投資補助金_1次～4次_統合データ.xlsx"));
assert(workbook.length > 1_000_000, "workbook is unexpectedly small");
assert(workbook[0] === 0x50 && workbook[1] === 0x4b, "workbook is not an Open XML ZIP file");

const localPdfDir = path.join(projectDir, "local_assets", "pdfs");
try {
  const localPdfs = (await fs.readdir(localPdfDir)).filter((name) => name.endsWith(".pdf"));
  assert(localPdfs.length === 381, `local PDF count mismatch: ${localPdfs.length}`);
  for (const name of localPdfs) {
    const handle = await fs.open(path.join(localPdfDir, name), "r");
    const signature = Buffer.alloc(5);
    await handle.read(signature, 0, 5, 0);
    await handle.close();
    assert(signature.toString("ascii") === "%PDF-", `${name}: invalid PDF signature`);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(JSON.stringify({ status: "ok", ...expected, json_cases: cases.length, pages_jsonl: 887, narratives_jsonl: 2999 }, null, 2));
