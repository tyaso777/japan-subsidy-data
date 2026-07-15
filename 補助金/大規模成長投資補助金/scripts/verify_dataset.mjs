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
  "metrics.csv": 1548,
  "sales_targets.csv": 381,
  "sales_annual.csv": 445,
  "sales_series.csv": 508,
  "sales_series_annual.csv": 445,
  "boxes.csv": 1995,
  "validations.csv": 1548,
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
assert(cases.every((row) => row.manual_audit_pages?.length > 0), "all cases must have visual-audit pages");
assert(cases.every((row) => ["high", "medium", "low"].includes(row.manual_audit_confidence)), "all cases must have audit confidence");
assert(cases.reduce((sum, row) => sum + row.sales_series.length, 0) === 508, "sales series count mismatch");
assert(cases.filter((row) => row.officer_pay_status === "rate_only").length === 216, "officer rate-only count mismatch");

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
assert(qaHtml.includes("売上系列（"), "QA HTML must display normalized sales series");
assert(qaHtml.includes("申請企業自身の代表系列"), "QA HTML must separate applicant representative series");
assert(qaHtml.includes("PDF上の主系列"), "QA HTML must separate reported primary series");
assert(qaHtml.includes('"sales_series":['), "QA HTML must embed sales series data");
assert(qaHtml.includes("21/3期") && qaHtml.includes("30/3期"), "QA HTML must retain two-digit fiscal period labels");
for (const [name, document] of [["index.html", html], ["qa.html", qaHtml]]) {
  const scripts = [...document.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert(scripts.length > 0, `${name}: script is missing`);
  for (const script of scripts) new vm.Script(script, { filename: name });
}

const caseCsv = await fs.readFile(path.join(projectDir, "data", "processed", "cases.csv"), "utf8");
assert(caseCsv.includes("sales_representative_series_id"), "cases.csv must identify the applicant representative series");
assert(caseCsv.includes("sales_reported_primary_series_id"), "cases.csv must retain the PDF-reported primary series");
assert(caseCsv.includes("AI画像目視で申請企業系列と確認"), "cases.csv must document representative selection reasons");
assert(caseCsv.includes("manual_audit_confidence"), "cases.csv must include manual audit metadata");

const textFiles = [
  "README.md", "dataset_stats.json", "docs/methodology.md", "docs/data_dictionary.md",
  "docs/validation.md", "html/index.html", "html/qa.html", "html/data/cases.json", "scripts/build_dataset.mjs",
  "scripts/sales_series.mjs", "data/processed/cases.csv", "data/processed/pdf_manifest.csv",
  "data/processed/sales_series.csv", "data/processed/sales_series_annual.csv",
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

console.log(JSON.stringify({ status: "ok", ...expected, json_cases: cases.length, pages_jsonl: 887, narratives_jsonl: 2999, manual_audit_cases: 381, officer_rate_only: 216 }, null, 2));
