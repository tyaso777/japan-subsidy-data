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
const nissho = cases.find((row) => row.case_id === "s2_outline_17");
const nax = cases.find((row) => row.case_id === "s1_outline_69");
assert(Number(nissho?.employee_pay_base_value_man_yen_per_person) === 427 && Number(nissho?.employee_pay_target_value_man_yen_per_person) === 495, "Nissho employee-pay unit correction is missing");
assert(Number(nissho?.employee_pay_total_increase_estimated_oku) === 7.288, "Nissho payroll-total proxy is incorrect");
assert(nissho?.employee_pay_total_unit_validation === "source_unit_conflict_cell_unit_preferred", "Nissho unit-conflict status is missing");
assert(Number(nax?.employee_pay_base_value_man_yen_per_person) === 689.2 && Number(nax?.employee_pay_target_value_man_yen_per_person) === 798, "NAX employee-pay unit correction is missing");
assert(Number(nax?.employee_pay_total_increase_estimated_oku) === 3.71032, "NAX payroll-total proxy is incorrect");
assert(nax?.employee_pay_total_unit_validation === "source_unit_conflict_assumed_thousand_yen", "NAX unit-conflict status is missing");

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
assert(!/\.\.\/local_assets\/pdfs\/[^\"'\s#]*__/.test(qaHtml), "QA HTML local PDF filenames must collapse repeated underscores");
assert(qaHtml.includes("pdfOfficial"), "QA HTML must retain official PDF links");
assert(qaHtml.includes("売上系列（"), "QA HTML must display normalized sales series");
assert(qaHtml.includes("申請企業自身の代表系列"), "QA HTML must separate applicant representative series");
assert(qaHtml.includes("PDF上の主系列"), "QA HTML must separate reported primary series");
assert(qaHtml.includes("枠テーマ：") && qaHtml.includes("枠内容："), "QA HTML must separate box theme and content");
assert(qaHtml.includes('"sales_series":['), "QA HTML must embed sales series data");
assert(qaHtml.includes("原単位") && qaHtml.includes("万円換算値"), "QA HTML must display raw and normalized metric values");
assert(qaHtml.includes("増加額（原表記）") && qaHtml.includes("増加額（億円換算）"), "QA HTML must display raw and normalized sales increases");
assert(qaHtml.includes("21/3期") && qaHtml.includes("30/3期"), "QA HTML must retain two-digit fiscal period labels");
const qaV01Html = await fs.readFile(path.join(projectDir, "html", "qa_v0.1.html"), "utf8");
assert(qaV01Html.includes("代表項目QA"), "QA v0.1 title is missing");
assert(qaV01Html.includes("const DATA=["), "QA v0.1 must contain embedded case data");
assert(qaV01Html.includes("先に見る箇所"), "QA v0.1 must present actionable attention items");
assert(qaV01Html.includes("cases.csv 全代表列・補助列"), "QA v0.1 must expose all scalar case fields");
assert(qaV01Html.includes("project_cost_analysis_status") && qaV01Html.includes("employees_rate_analysis_status"), "QA v0.1 must embed per-metric reliability flags");
assert(qaV01Html.includes("qa_v01_rail_closed"), "QA v0.1 must persist the collapsible company rail");
assert(qaV01Html.includes("../local_assets/pdfs/"), "QA v0.1 must use relative local PDF paths");
assert(!/\.\.\/local_assets\/pdfs\/[^\"'\s#]*__/.test(qaV01Html), "QA v0.1 local PDF filenames must collapse repeated underscores");
assert(qaV01Html.includes("const COMPARISON="), "QA v0.1 must embed external comparison results");
assert(qaV01Html.includes("差分検証を開始") && qaV01Html.includes("comparison-diff"), "QA v0.1 must provide opt-in difference highlighting");
assert(qaV01Html.includes("外部抽出データとの差分"), "QA v0.1 must render a per-case comparison table");
const dashboardHtml = await fs.readFile(path.join(projectDir, "html", "analysis_dashboard.html"), "utf8");
assert(dashboardHtml.includes("全体分析ダッシュボード"), "analysis dashboard title is missing");
assert(dashboardHtml.includes("const DATA=[") && dashboardHtml.includes("const BENCH=["), "analysis dashboard must embed cases and official benchmarks");
assert(dashboardHtml.includes("表示対象をCSV出力") && dashboardHtml.includes("公式統計に対する位置"), "analysis dashboard controls or position table are missing");
assert(dashboardHtml.includes("5次") && dashboardHtml.includes("applicant_value") && dashboardHtml.includes("accepted_value"), "analysis dashboard must include round 5 applicant/accepted benchmarks");
assert(dashboardHtml.includes("employee_pay_total_increase_estimated_oku") && dashboardHtml.includes("比較可能な7指標"), "analysis dashboard must expose the seven comparable metrics");
assert(dashboardHtml.includes("目標1人当たり給与") && dashboardHtml.includes("公開事業費÷公開基準売上高"), "analysis dashboard must document proxy formulas");
assert(dashboardHtml.includes("drawInteractiveScatter") && dashboardHtml.includes("addEventListener('wheel'") && dashboardHtml.includes("addEventListener('pointermove'"), "analysis dashboard must support wheel zoom and drag pan");
assert(dashboardHtml.includes("e.target.classList?.contains('pt')"), "scatter point clicks must not be captured by drag handling");
assert(dashboardHtml.includes("ダブルクリック：全体表示"), "analysis dashboard must explain viewport reset");
assert(dashboardHtml.includes('id="xlog" type="checkbox">') && dashboardHtml.includes("xlog.checked=false;ylog.checked=false"), "linear scales must be the default initially and after reset");
assert(dashboardHtml.includes('id="officialRounds"') && dashboardHtml.includes("officialRoundsSelected()"), "analysis dashboard must provide in-plot round checkboxes for official medians");
assert(dashboardHtml.includes("上の1〜4次をチェック") && dashboardHtml.includes("線をクリックすると公式資料"), "official median overlays must explain selection and source links");
assert((dashboardHtml.match(/data-check-all=/g) || []).length === 6, "round, exclusion, and official-median checkbox groups must each provide All ON/OFF controls");
assert(dashboardHtml.includes("細い点線＝申請者") && dashboardHtml.includes("太い破線＝採択者") && dashboardHtml.includes("['accepted_value','採','accepted_n','7 5',3]"), "accepted median lines must be thicker dashed lines than applicant medians");
assert(dashboardHtml.includes('id="trendX"') && dashboardHtml.includes('id="trendY"') && dashboardHtml.includes("drawTrend('trendX',xmetric.value,'横軸')") && dashboardHtml.includes("drawTrend('trendY',ymetric.value,'縦軸')"), "official benchmark trends must be shown separately for both selected axes");
assert(dashboardHtml.includes("'横軸':'縦軸')+'：'+AXES[field][0]+'の分布'") && dashboardHtml.includes("${axisName}：${AXES[f][0]}の公式統計推移"), "distribution and trend titles must identify their corresponding axis");
assert(dashboardHtml.includes('id="selectionPanel"') && dashboardHtml.includes("e.button===2") && dashboardHtml.includes("addEventListener('contextmenu'") && dashboardHtml.includes("右ドラッグ：範囲内企業を一覧"), "scatter plot must support right-drag range selection with a company list");
assert(dashboardHtml.includes('id="selectionList"') && dashboardHtml.includes("data-case-id") && dashboardHtml.includes("selected=d;render()"), "range-selected company list must switch the selected company and PDF");
assert(dashboardHtml.includes("ensureHistInteractions") && dashboardHtml.includes("selectHistogramBin") && dashboardHtml.includes("全体を保って階級幅を変更") && dashboardHtml.includes("クリックで企業一覧"), "both histograms must support wheel-controlled bin widths and bar-to-company-list selection");
assert(dashboardHtml.includes("histViews[id]={field:p.field,bins:12}") && dashboardHtml.includes("Math.min(60") && dashboardHtml.includes("addEventListener('dblclick'"), "histogram wheel interaction must preserve the full range and support reset to 12 bins");
assert((dashboardHtml.match(/class="section-box" data-section=/g) || []).length === 5, "all five dashboard content rows must use consistent collapsible section boxes");
assert(dashboardHtml.includes('data-section="distributions"><summary>指標の分布</summary>') && dashboardHtml.includes('data-section="trends"><summary>公式統計の推移</summary>') && dashboardHtml.includes('data-section="details" open><summary>選択企業の詳細</summary>'), "distribution and trend rows must default closed while company details default open");
assert(dashboardHtml.includes("setupCollapsibleSections") && dashboardHtml.includes("localStorage.setItem(key,box.open?'open':'closed')") && dashboardHtml.includes("requestAnimationFrame(redraw)"), "collapsible section state must persist and charts must redraw when reopened");
assert(!dashboardHtml.includes('class="benchmark-grid"'), "separate official benchmark bar panels must be removed");
assert(!/\.\.\/local_assets\/pdfs\/[^\"'\s#]*__/.test(dashboardHtml), "analysis dashboard local PDF filenames must collapse repeated underscores");
const benchmarkCsv = await fs.readFile(path.join(projectDir, "data", "reference", "official_round_benchmarks.csv"), "utf8");
assert(countCsvRecords(benchmarkCsv) === 71, "official benchmark row count mismatch");
assert(benchmarkCsv.includes("company_sales_cagr") && benchmarkCsv.includes("project_sales_share"), "official benchmark metrics are incomplete");
assert(benchmarkCsv.includes("employee_pay_total_increase_estimated_oku,proxy"), "employee payroll total proxy mapping is missing");
assert(benchmarkCsv.includes("3次,company_pay_schedule_rate,全社賃上げ予定率,経営力,median,2.4,2.4") &&
  benchmarkCsv.includes("4次,company_pay_schedule_rate,全社賃上げ予定率,経営力,median,2.5,2.4"),
"round 3/4 company pay schedule benchmarks are missing");
assert(benchmarkCsv.includes("https://seichotoushi-hojo.jp/assets/pdf/3ji_median.pdf") &&
  benchmarkCsv.includes("https://seichotoushi-hojo.jp/assets/pdf/4ji_median.pdf"),
"round 3/4 company pay schedule benchmark sources are missing");
const payrollRevalidationCsv = await fs.readFile(path.join(projectDir, "data", "processed", "payroll_unit_revalidation_changes.csv"), "utf8");
assert(countCsvRecords(payrollRevalidationCsv) === 4, "payroll unit revalidation must contain four metric corrections");
assert(payrollRevalidationCsv.includes("source_unit_conflict_cell_unit_preferred") && payrollRevalidationCsv.includes("source_unit_conflict_assumed_thousand_yen"), "payroll unit revalidation statuses are incomplete");
for (const [name, document] of [["index.html", html], ["qa.html", qaHtml], ["qa_v0.1.html", qaV01Html], ["analysis_dashboard.html", dashboardHtml]]) {
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
  "analysis_exclusion_reasons", "sales_values_analysis_status", "sales_rate_analysis_status",
  "labor_values_analysis_status", "employee_pay_values_analysis_status", "officer_pay_rate_analysis_status",
]) assert(caseCsv.includes(column), `cases.csv must include analysis flag ${column}`);
for (const column of [
  "employee_pay_total_base_estimated_oku", "employee_pay_total_target_estimated_oku",
  "employee_pay_total_increase_estimated_oku", "employee_pay_total_calculation_status",
  "employee_pay_total_period_alignment", "employee_pay_total_entity_alignment",
  "employee_pay_total_unit_validation", "employee_pay_total_increase_analysis_status",
]) assert(caseCsv.includes(column), `cases.csv must include payroll estimate field ${column}`);

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
  "docs/validation.md", "docs/analysis_quality_flags.md", "html/index.html", "html/qa.html", "html/qa_v0.1.html", "html/analysis_dashboard.html", "html/data/cases.json", "scripts/build_dataset.mjs", "scripts/build_qa_v01.py", "scripts/build_analysis_dashboard.py",
  "scripts/build_analysis_flags.py", "scripts/validate_analysis_flags.py", "scripts/normalize_local_pdf_names.py",
  "scripts/sales_series.mjs", "scripts/revalidate_payroll_totals.py", "data/processed/cases.csv", "data/processed/pdf_manifest.csv",
  "data/processed/sales_series.csv", "data/processed/sales_series_annual.csv",
  "data/processed/quality_flags.csv", "data/processed/case_entities.csv", "data/processed/investment_components.csv", "data/processed/payroll_unit_revalidation_changes.csv", "data/reference/official_round_benchmarks.csv",
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
