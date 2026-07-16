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
  "metrics.csv": 1556,
  "sales_targets.csv": 381,
  "sales_annual.csv": 466,
  "sales_series.csv": 508,
  "sales_series_annual.csv": 466,
  "boxes.csv": 3055,
  "validations.csv": 1548,
  "cost_validations.csv": 381,
  "unit_normalization_changes.csv": 35,
  "unit_revalidation_changes.csv": 36,
  "pdf_manifest.csv": 381,
  "investment_components.csv": 543,
  "case_entities.csv": 952,
  "cost_amount_candidates.csv": 1042,
  "quality_flags.csv": 737,
};

for (const [name, count] of Object.entries(expected)) {
  const text = await fs.readFile(path.join(projectDir, "data", "processed", name), "utf8");
  assert(countCsvRecords(text) === count, `${name}: row count mismatch`);
}

const cases = JSON.parse(await fs.readFile(path.join(projectDir, "html", "data", "cases.json"), "utf8"));
assert(cases.length === 381, "cases.json: expected 381 cases");
assert(new Set(cases.map((row) => row.case_id)).size === 381, "case_id must be unique");
assert(cases.every((row) => /^https:\/\//.test(row.pdf_url)), "all PDF URLs must be HTTPS links");
const fullAuditLines = (await fs.readFile(path.join(projectDir, "data", "manual_audit", "full_manual_visual_audit.jsonl"), "utf8")).trim().split("\n");
assert(fullAuditLines.length === 381, "full visual audit must cover 381 cases");
const fullAudit = fullAuditLines.map((line) => JSON.parse(line));
assert(new Set(fullAudit.map((row) => row.case_id)).size === 381, "full visual audit case_id must be unique");
assert(fullAudit.every((row) => row.status), "all full visual audit rows must have status");
assert(cases.every((row) => ["high", "medium", "low"].includes(row.manual_audit_confidence)), "all cases must have audit confidence");
assert(cases.reduce((sum, row) => sum + row.sales_series.length, 0) === 508, "sales series count mismatch");
assert(cases.filter((row) => row.officer_pay_status === "rate_only").length === 216, "officer rate-only count mismatch");
assert(cases.every((row) => row.project_cost_unit_raw && row.subsidy_unit_raw), "all cases must retain raw cost units");
assert(cases.every((row) => row.cost_unit_validation?.includes("raw_unit_confirmed") || row.cost_unit_validation === "participant_boxes_confirmed_and_summed"), "all cases must have confirmed cost units");
assert(cases.every((row) => row.metrics?.every((metric) => "unit_raw" in metric && "unit_validation" in metric)), "all metrics must expose raw-unit audit fields");

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
assert(qaHtml.includes("枠テーマ：") && qaHtml.includes("枠内容："), "QA HTML must separate box theme and content");
assert(qaHtml.includes('"sales_series":['), "QA HTML must embed sales series data");
assert(qaHtml.includes("原単位") && qaHtml.includes("万円換算値"), "QA HTML must display raw and normalized metric values");
assert(qaHtml.includes("増加額（原表記）") && qaHtml.includes("増加額（億円換算）"), "QA HTML must display raw and normalized sales increases");
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
for (const column of [
  "project_cost_value_raw", "project_cost_unit_raw", "project_cost_million_yen_normalized",
  "sales_increase_value_raw", "sales_increase_unit_raw", "sales_increase_oku_yen_normalized",
  "labor_base_value_raw", "labor_base_value_man_yen_per_person", "labor_unit_validation",
  "officer_pay_base_value_raw", "officer_pay_base_value_man_yen_per_person", "officer_pay_unit_validation",
]) assert(caseCsv.includes(column), `cases.csv must include ${column}`);
for (const column of [
  "has_multiple_investments", "cost_text_numeric_mismatch", "has_consortium",
  "has_multiple_sales_series", "has_ambiguous_rate_any", "analysis_exclusion_recommended",
  "analysis_exclusion_reasons",
]) assert(caseCsv.includes(column), `cases.csv must include analysis flag ${column}`);

const metricsCsv = await fs.readFile(path.join(projectDir, "data", "processed", "metrics.csv"), "utf8");
for (const column of [
  "base_value_raw", "target_value_raw", "unit_raw", "base_value_man_yen_per_person",
  "target_value_man_yen_per_person", "unit_conversion_factor", "unit_evidence_source",
  "unit_validation", "source_box_label", "entity_match_status",
]) assert(metricsCsv.includes(column), `metrics.csv must include ${column}`);
for (const column of ["rate_definition", "rate_interpretation_status", "rate_reconciliation_status", "rate_ambiguous"])
  assert(metricsCsv.includes(column), `metrics.csv must include ${column}`);

const salesSeriesCsv = await fs.readFile(path.join(projectDir, "data", "processed", "sales_series.csv"), "utf8");
for (const column of ["rate_interpretation_status", "rate_ambiguous", "rate_interpretation_note"])
  assert(salesSeriesCsv.includes(column), `sales_series.csv must include ${column}`);

const qualityFlagsCsv = await fs.readFile(path.join(projectDir, "data", "processed", "quality_flags.csv"), "utf8");
for (const column of ["flag_code", "severity", "status", "alternative_value", "evidence", "resolution_note"])
  assert(qualityFlagsCsv.includes(column), `quality_flags.csv must include ${column}`);

const unitSummary = JSON.parse(await fs.readFile(path.join(projectDir, "data", "processed", "unit_normalization_summary.json"), "utf8"));
assert(unitSummary.cases === 381, "unit normalization case count mismatch");
assert(unitSummary.metric_unit_changes === 35, "unit normalization change count mismatch");
assert(unitSummary.changed_companies === 31, "unit normalization company count mismatch");
assert(unitSummary.revalidation_changes === 36, "unit revalidation change count mismatch");
assert(unitSummary.revalidation_changed_companies === 32, "unit revalidation company count mismatch");

const boxCsv = await fs.readFile(path.join(projectDir, "data", "processed", "boxes.csv"), "utf8");
assert(boxCsv.includes("box_theme") && boxCsv.includes("box_content"), "boxes.csv must include theme/content columns");
assert(boxCsv.includes("補助事業の背景・目的"), "boxes.csv must include project background-purpose sections");

const textFiles = [
  "README.md", "dataset_stats.json", "docs/methodology.md", "docs/data_dictionary.md",
  "docs/validation.md", "docs/analysis_quality_flags.md", "html/index.html", "html/qa.html", "html/data/cases.json", "scripts/build_dataset.mjs",
  "scripts/build_analysis_flags.py", "scripts/validate_analysis_flags.py",
  "scripts/sales_series.mjs", "data/processed/cases.csv", "data/processed/pdf_manifest.csv",
  "data/processed/sales_series.csv", "data/processed/sales_series_annual.csv",
  "data/processed/quality_flags.csv", "data/processed/case_entities.csv", "data/processed/investment_components.csv",
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

console.log(JSON.stringify({ status: "ok", ...expected, json_cases: cases.length, pages_jsonl: 887, narratives_jsonl: 2999, manual_audit_cases: 381, officer_rate_only: cases.filter((row) => row.officer_pay_status === "rate_only").length }, null, 2));
