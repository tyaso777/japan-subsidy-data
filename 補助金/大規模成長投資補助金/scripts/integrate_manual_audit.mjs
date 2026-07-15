#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.argv[2];
const stageDir = process.argv[3] ?? path.join(here, "integration_stage");
if (!projectDir) throw new Error("Usage: node integrate_manual_audit.mjs <project-dir> [stage-dir]");

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const clean = (value) => value === undefined ? null : value;
const csvCell = (value) => {
  if (value === undefined || value === null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const writeCsv = async (file, rows, columns) => {
  const lines = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(","))];
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
};

const batchFiles = (await fs.readdir(here))
  .filter((name) => /^batch.*\.jsonl$/.test(name))
  .sort();
const audits = [];
for (const name of batchFiles) {
  const text = await fs.readFile(path.join(here, name), "utf8");
  for (const line of text.split(/\r?\n/).filter(Boolean)) audits.push(JSON.parse(line));
}
const auditById = new Map(audits.map((row) => [row.case_id, row]));
if (audits.length !== 381 || auditById.size !== 381) {
  throw new Error(`Manual audit must contain 381 unique cases; got ${audits.length}/${auditById.size}`);
}

const sourceCases = await readJson(path.join(projectDir, "html", "data", "cases.json"));
const sourceById = new Map(sourceCases.map((row) => [row.case_id, row]));
const relationLabel = {
  applicant: "申請企業", group: "グループ", parent: "親会社", subsidiary: "子会社",
  affiliate: "関連会社", project: "補助事業", existing_business: "既存事業", unknown: "主体不明",
};
const metricLabels = {
  labor: "労働生産性",
  employee_pay: "従業員1人当たり給与支給総額",
  officer_pay: "役員1人当たり給与支給総額",
  employees: "補助事業に係る従業員数",
};
const statusLabel = {
  full_values: "AI画像目視確認済み（値・率あり）",
  rate_only: "AI画像目視確認済み（率のみ）",
  values_without_rate: "AI画像目視確認済み（値のみ）",
  not_stated: "AI画像目視確認済み（記載なし）",
  unreadable: "AI画像目視確認済み（判読不能）",
  not_applicable: "AI画像目視確認済み（該当なし）",
};

function parseYearLabel(label) {
  const raw = String(label ?? "").trim();
  if (!raw || /20xx/i.test(raw)) return { year: null, month: null, method: raw ? "unresolved_placeholder" : "missing", confidence: "low" };
  if (/(?:約\s*)?\d+\s*年(?:後|前|以内)/.test(raw)) return { year: null, month: null, method: "relative_year_requires_anchor", confidence: "low" };
  let match = raw.match(/(20\d{2})/);
  if (match) {
    const monthMatch = raw.match(/20\d{2}(?:年|[/.])(\d{1,2})(?:月|月期|期)?/);
    return { year: Number(match[1]), month: monthMatch ? Number(monthMatch[1]) : null, method: "four_digit_year_from_label", confidence: "high" };
  }
  match = raw.match(/FY\s*(\d{2})(?!\d)/i);
  if (match) return { year: 2000 + Number(match[1]), month: null, method: "two_digit_fy_assume_2000s", confidence: "medium" };
  match = raw.match(/(?:^|[^0-9])(\d{2})(?:\s*[/.]\s*(\d{1,2})|\s*年(?:\s*(\d{1,2})\s*月)?|\s*年度|\s*期)/);
  if (match) return {
    year: 2000 + Number(match[1]), month: match[2] ? Number(match[2]) : match[3] ? Number(match[3]) : null,
    method: "two_digit_year_assume_2000s", confidence: "medium",
  };
  return { year: null, month: null, method: "unresolved_relative_or_missing_context", confidence: "low" };
}

function correctPeriodPair(baseLabel, baseYear, baseMonth, targetLabel, targetYear, targetMonth) {
  const baseParsed = baseYear == null ? parseYearLabel(baseLabel) : { year: baseYear, month: baseMonth ?? null, method: "existing_normalized_year", confidence: "high" };
  const targetParsed = targetYear == null ? parseYearLabel(targetLabel) : { year: targetYear, month: targetMonth ?? null, method: "existing_normalized_year", confidence: "high" };
  let baseAfter = baseParsed.year;
  let targetAfter = targetParsed.year;
  let baseMethod = baseParsed.method;
  let targetMethod = targetParsed.method;
  let baseConfidence = baseParsed.confidence;
  let targetConfidence = targetParsed.confidence;
  const targetRaw = String(targetLabel ?? "");
  const baseRaw = String(baseLabel ?? "");
  let relative = targetRaw.match(/(?:基準年度\s*[+＋]\s*)?(\d+)\s*年後/);
  if (!relative) relative = targetRaw.match(/事業化報告\s*(\d+)\s*年目/);
  if (targetAfter == null && baseAfter != null && relative) {
    targetAfter = baseAfter + Number(relative[1]);
    targetMethod = "relative_year_from_corrected_baseline";
    targetConfidence = "medium";
  }
  const before = baseRaw.match(/(?:約\s*)?(\d+)\s*年前/);
  if (baseAfter == null && targetAfter != null && before) {
    baseAfter = targetAfter - Number(before[1]);
    baseMethod = "relative_year_before_corrected_target";
    baseConfidence = "medium";
  }
  return {
    base_year_before_correction: baseYear ?? null,
    base_year_after_correction: baseAfter ?? null,
    base_month_before_correction: baseMonth ?? null,
    base_month_after_correction: baseParsed.month ?? baseMonth ?? null,
    base_year_correction_method: baseMethod,
    base_year_correction_confidence: baseConfidence,
    target_year_before_correction: targetYear ?? null,
    target_year_after_correction: targetAfter ?? null,
    target_month_before_correction: targetMonth ?? null,
    target_month_after_correction: targetParsed.month ?? targetMonth ?? null,
    target_year_correction_method: targetMethod,
    target_year_correction_confidence: targetConfidence,
  };
}

function salesRow(base, audit, series, index) {
  const def = series.growth_rate_definition ?? "not_stated";
  const isCagr = def === "cagr";
  const baseline = series.baseline_sales_oku;
  const target = series.target_sales_oku;
  const increase = series.increase_oku;
  const arithmetic = baseline != null && target != null && increase != null
    ? Math.abs((target - baseline) - increase) <= Math.max(0.2, Math.abs(increase) * 0.01)
    : null;
  const period = correctPeriodPair(
    series.baseline_period_label, series.baseline_year, series.baseline_month,
    series.target_period_label, series.target_year, series.target_month,
  );
  return {
    case_id: base.case_id,
    round: base.round,
    company: base.company,
    series_id: `${base.case_id}_sales_${String(index + 1).padStart(2, "0")}`,
    series_label: series.label,
    scope: relationLabel[series.entity_relation] ?? series.entity_relation,
    entity_relation: series.entity_relation,
    is_primary: Boolean(series.is_pdf_primary),
    is_reported_primary: Boolean(series.is_pdf_primary),
    is_applicant_representative: Boolean(series.is_applicant_representative),
    series_role: series.is_applicant_representative && series.is_pdf_primary
      ? "申請企業代表・PDF主系列"
      : series.is_applicant_representative ? "申請企業代表" : series.is_pdf_primary ? "PDF主系列" : "その他系列",
    representative_reason: series.is_applicant_representative ? "AI画像目視で申請企業系列と確認" : "",
    baseline_period_label: clean(series.baseline_period_label),
    baseline_year: period.base_year_after_correction,
    baseline_month: period.base_month_after_correction,
    baseline_year_before_correction: period.base_year_before_correction,
    baseline_year_after_correction: period.base_year_after_correction,
    baseline_month_before_correction: period.base_month_before_correction,
    baseline_month_after_correction: period.base_month_after_correction,
    baseline_year_correction_method: period.base_year_correction_method,
    baseline_year_correction_confidence: period.base_year_correction_confidence,
    baseline_period_type: series.baseline_period_label ? "manual_label" : "missing",
    baseline_year_status: period.base_year_after_correction == null ? (series.baseline_period_label ? "補正不能・原文保持" : "記載なし") : period.base_year_correction_method,
    baseline_sales_oku: clean(baseline),
    target_period_label: clean(series.target_period_label),
    target_year: period.target_year_after_correction,
    target_month: period.target_month_after_correction,
    target_year_before_correction: period.target_year_before_correction,
    target_year_after_correction: period.target_year_after_correction,
    target_month_before_correction: period.target_month_before_correction,
    target_month_after_correction: period.target_month_after_correction,
    target_year_correction_method: period.target_year_correction_method,
    target_year_correction_confidence: period.target_year_correction_confidence,
    target_period_type: series.target_period_label ? "manual_label" : "missing",
    target_year_status: period.target_year_after_correction == null ? (series.target_period_label ? "補正不能・原文保持" : "記載なし") : period.target_year_correction_method,
    target_sales_oku: clean(target),
    increase_oku: clean(increase),
    growth_rate_pct: isCagr ? null : clean(series.growth_rate_pct),
    cagr_pct: isCagr ? clean(series.growth_rate_pct) : null,
    stated_rate_pct: clean(series.growth_rate_pct),
    growth_rate_definition: def,
    rate_type: def,
    extraction_method: "ai_visual_manual_audit",
    confidence: audit.confidence,
    review_required: audit.confidence !== "high",
    arithmetic_status: arithmetic === null ? "未判定" : arithmetic ? "整合" : "PDF原文内不整合・要注記",
    page: clean(series.page),
    raw_fragment: series.raw_evidence ?? "",
    pdf_url: base.pdf_url,
  };
}

function metricRow(base, key, metric) {
  const period = correctPeriodPair(
    metric.base_period_label, metric.base_year, null,
    metric.target_period_label, metric.target_year, null,
  );
  let calculated = null;
  if (metric.base_value != null && metric.target_value != null && period.base_year_after_correction != null && period.target_year_after_correction != null && period.target_year_after_correction > period.base_year_after_correction && metric.base_value > 0) {
    calculated = (Math.pow(metric.target_value / metric.base_value, 1 / (period.target_year_after_correction - period.base_year_after_correction)) - 1) * 100;
  }
  return {
    case_id: base.case_id, round: base.round, company: base.company,
    metric: metricLabels[key] ?? key, metric_key: key, status: metric.status,
    validation: statusLabel[metric.status] ?? metric.status,
    base_period_label: clean(metric.base_period_label), base_year: period.base_year_after_correction, base_value: clean(metric.base_value),
    base_year_before_correction: period.base_year_before_correction, base_year_after_correction: period.base_year_after_correction,
    base_year_correction_method: period.base_year_correction_method, base_year_correction_confidence: period.base_year_correction_confidence,
    target_period_label: clean(metric.target_period_label), target_year: period.target_year_after_correction, target_value: clean(metric.target_value),
    target_year_before_correction: period.target_year_before_correction, target_year_after_correction: period.target_year_after_correction,
    target_year_correction_method: period.target_year_correction_method, target_year_correction_confidence: period.target_year_correction_confidence,
    unit: clean(metric.unit), listed_rate_pct: clean(metric.listed_rate_pct),
    calculated_rate_pct: calculated == null ? null : Number(calculated.toFixed(4)),
    rate_diff_pt: calculated == null || metric.listed_rate_pct == null ? null : Number(Math.abs(calculated - metric.listed_rate_pct).toFixed(4)),
    source_method: "ai_visual_manual_audit", page: clean(metric.page),
    year_status: `${period.base_year_correction_method} → ${period.target_year_correction_method}`,
    issues: [], raw_support: Boolean(metric.raw_evidence), raw: metric.raw_evidence ?? "",
    rate_only: metric.status === "rate_only",
  };
}

const integrated = [];
const allSales = [];
const allMetrics = [];
for (const audit of audits) {
  const base = sourceById.get(audit.case_id);
  if (!base) throw new Error(`Missing source case: ${audit.case_id}`);
  const series = audit.sales_series.map((item, index) => salesRow(base, audit, item, index));
  const representative = series.find((row) => row.is_applicant_representative) ?? null;
  const reported = series.find((row) => row.is_reported_primary) ?? series[0] ?? null;
  const metrics = Object.entries(audit.metrics).map(([key, value]) => metricRow(base, key, value));
  const metricByKey = new Map(metrics.map((row) => [row.metric_key, row]));
  const row = { ...base };
  row.project_cost_million_yen = clean(audit.investment.total_cost_million_yen);
  row.subsidy_million_yen = clean(audit.investment.total_subsidy_million_yen);
  row.subsidy_rate_pct = row.project_cost_million_yen > 0 && row.subsidy_million_yen != null
    ? Number((row.subsidy_million_yen / row.project_cost_million_yen * 100).toFixed(4)) : null;
  row.cost_page = clean(audit.investment.page);
  row.cost_source_method = "ai_visual_manual_audit";
  row.cost_validation = audit.confidence === "high" ? "AI画像目視確認済み" : `AI画像目視確認済み（信頼度${audit.confidence}）`;
  row.cost_box_transcription = audit.investment.raw_evidence ?? "";
  row.investment_representative_basis = "同一申請内の投資案件合計（AI画像目視）";
  row.investment_components = audit.investment.components ?? [];
  row.cost = {
    page: clean(audit.investment.page), transcription: audit.investment.raw_evidence ?? "",
    source_method: "ai_visual_manual_audit", validation: row.cost_validation,
    total_cost_million_yen: row.project_cost_million_yen, total_subsidy_million_yen: row.subsidy_million_yen,
    components: row.investment_components,
  };
  row.sales_series = series;
  row.sales_representative_series_id = representative?.series_id ?? "";
  row.sales_representative_scope = representative?.series_label ?? "";
  row.sales_representative_reason = representative ? "AI画像目視で申請企業系列と確認" : "申請企業単体系列の記載なし";
  row.sales_representative_review_required = !representative || audit.confidence !== "high";
  row.sales_baseline_period_label = representative?.baseline_period_label ?? null;
  row.sales_baseline_year_before_correction = representative?.baseline_year_before_correction ?? null;
  row.sales_baseline_year_after_correction = representative?.baseline_year_after_correction ?? null;
  row.sales_baseline_year_correction_method = representative?.baseline_year_correction_method ?? null;
  row.sales_baseline_year_correction_confidence = representative?.baseline_year_correction_confidence ?? null;
  row.sales_baseline_year = representative?.baseline_year ?? null;
  row.sales_baseline_oku_yen = representative?.baseline_sales_oku ?? null;
  row.sales_target_period_label = representative?.target_period_label ?? null;
  row.sales_target_year_before_correction = representative?.target_year_before_correction ?? null;
  row.sales_target_year_after_correction = representative?.target_year_after_correction ?? null;
  row.sales_target_year_correction_method = representative?.target_year_correction_method ?? null;
  row.sales_target_year_correction_confidence = representative?.target_year_correction_confidence ?? null;
  row.sales_target_year = representative?.target_year ?? null;
  row.sales_target_oku_yen = representative?.target_sales_oku ?? null;
  row.sales_increase_oku_yen = representative?.increase_oku ?? null;
  row.sales_growth_pct = representative?.growth_rate_pct ?? null;
  row.sales_cagr_pct = representative?.cagr_pct ?? null;
  row.sales_growth_rate_definition = representative?.growth_rate_definition ?? null;
  row.sales_multiple = representative?.baseline_sales_oku && representative?.target_sales_oku
    ? representative.target_sales_oku / representative.baseline_sales_oku : null;
  row.sales_validation = representative?.arithmetic_status ?? "申請企業単体系列なし";
  row.sales_reported_primary_series_id = reported?.series_id ?? "";
  row.sales_reported_scope = reported?.series_label ?? "";
  row.sales_reported_baseline_year = reported?.baseline_year ?? null;
  row.sales_reported_baseline_oku_yen = reported?.baseline_sales_oku ?? null;
  row.sales_reported_target_year = reported?.target_year ?? null;
  row.sales_reported_target_oku_yen = reported?.target_sales_oku ?? null;
  row.sales_reported_increase_oku_yen = reported?.increase_oku ?? null;
  row.sales_reported_growth_pct = reported?.growth_rate_pct ?? null;
  row.sales_reported_cagr_pct = reported?.cagr_pct ?? null;
  row.metrics = metrics;
  for (const key of Object.keys(metricLabels)) {
    const metric = metricByKey.get(key);
    row[`${key}_base_period_label`] = metric?.base_period_label ?? null;
    row[`${key}_base_year_before_correction`] = metric?.base_year_before_correction ?? null;
    row[`${key}_base_year_after_correction`] = metric?.base_year_after_correction ?? null;
    row[`${key}_base_year_correction_method`] = metric?.base_year_correction_method ?? null;
    row[`${key}_base_year_correction_confidence`] = metric?.base_year_correction_confidence ?? null;
    row[`${key}_base_year`] = metric?.base_year ?? null;
    row[`${key}_base_value`] = metric?.base_value ?? null;
    row[`${key}_target_period_label`] = metric?.target_period_label ?? null;
    row[`${key}_target_year_before_correction`] = metric?.target_year_before_correction ?? null;
    row[`${key}_target_year_after_correction`] = metric?.target_year_after_correction ?? null;
    row[`${key}_target_year_correction_method`] = metric?.target_year_correction_method ?? null;
    row[`${key}_target_year_correction_confidence`] = metric?.target_year_correction_confidence ?? null;
    row[`${key}_target_year`] = metric?.target_year ?? null;
    row[`${key}_target_value`] = metric?.target_value ?? null;
    row[`${key}_unit`] = metric?.unit ?? null;
    row[`${key}_annual_rate_pct`] = metric?.listed_rate_pct ?? null;
    row[`${key}_validation`] = metric?.validation ?? null;
    row[`${key}_status`] = metric?.status ?? null;
    row[`${key}_raw_evidence`] = metric?.raw ?? "";
  }
  row.manual_audit_confidence = audit.confidence;
  row.manual_audit_pages = audit.pages_visually_checked;
  row.manual_audit_notes = audit.notes ?? "";
  row.manual_audit_corrections = audit.corrections ?? [];
  row.manual_audit_correction_count = row.manual_audit_corrections.length;
  row.issue_labels = [
    ...(base.issue_labels ?? []).filter((label) => !/PDF記載なし又は抽出不能/.test(label)),
    ...row.manual_audit_corrections.map((correction) => `AI目視: ${correction.field ?? "要確認"}`),
  ];
  row.issue_count = row.issue_labels.length;
  integrated.push(row);
  allSales.push(...series);
  allMetrics.push(...metrics);
}

integrated.sort((a, b) => a.case_id.localeCompare(b.case_id, "ja", { numeric: true }));
await fs.rm(stageDir, { recursive: true, force: true });
await fs.mkdir(path.join(stageDir, "html", "data"), { recursive: true });
await fs.mkdir(path.join(stageDir, "data", "processed"), { recursive: true });
await fs.mkdir(path.join(stageDir, "data", "manual_audit"), { recursive: true });
await fs.mkdir(path.join(stageDir, "docs"), { recursive: true });
await fs.mkdir(path.join(stageDir, "scripts"), { recursive: true });
const readmeSection = `

## 生成AIによる全件画像監査

381案件・887ページについて、PDFをページ画像として1件ずつ確認しました。単純な横一行OCRではなく、Box・表・主体の位置関係を見ながら次を整理しています。

- 売上目標は申請企業、グループ、親会社、子会社、関連会社、補助事業などを別系列として保持
- 投資案件が複数ある場合、補助対象となる同一申請内の合計額を代表値として保持
- 労働生産性、従業員給与、役員給与、従業員数を表の行・列単位で確認
- 役員給与は金額がなく年平均上昇率だけ記載されたケースも \`rate_only\` として保持
- \`23/12期\`、\`FY28\`、\`30年\`などは原文ラベルと補正前年を残したうえで、分析用の補正後年を2023、2028、2030として保持
- \`5年後\`、\`基準年度+3年後\`などは、同じ系列の基準年を確定できる場合に基準年から補正後年を算出
- PDF内で数値同士が一致しない場合、推測値へ置き換えず原文値と不整合注記を保持

監査結果は \`data/manual_audit/manual_audit.jsonl\`、監査スキーマは \`data/manual_audit/schema.json\` にあります。横断検証と二巡目確認の記録は \`docs/cross_batch_validation.md\`、\`docs/sales_numeric_validation.md\`、\`docs/recheck_*.md\` を参照してください。

監査結果をCSV・HTMLへ反映するには、次を実行します。

\`node scripts/integrate_manual_audit.mjs <project-dir> <stage-dir>\`
`;
let readme = await fs.readFile(path.join(projectDir, "README.md"), "utf8");
readme = readme.replace(/\n## 生成AIによる全件画像監査[\s\S]*?(?=\n## |$)/, "");
await fs.writeFile(path.join(stageDir, "README.md"), `${readme.trimEnd()}${readmeSection}`, "utf8");
await fs.writeFile(path.join(stageDir, "html", "data", "cases.json"), `${JSON.stringify(integrated, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(stageDir, "data", "manual_audit", "manual_audit.jsonl"), `${audits.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

const originalCaseColumns = [
  "case_id","round","company","target_entity","scope","other_participants","page_count","vision_page_count","project_page_count","additional_page_count",
  "project_cost_million_yen","subsidy_million_yen","subsidy_rate_pct","cost_page","investment_representative_basis","cost_source_method","cost_validation","cost_box_transcription",
  "sales_baseline_period_label","sales_baseline_year_before_correction","sales_baseline_year_after_correction","sales_baseline_year_correction_method","sales_baseline_year_correction_confidence","sales_baseline_year","sales_baseline_oku_yen",
  "sales_target_period_label","sales_target_year_before_correction","sales_target_year_after_correction","sales_target_year_correction_method","sales_target_year_correction_confidence","sales_target_year","sales_target_oku_yen","sales_increase_oku_yen","sales_growth_pct","sales_cagr_pct","sales_growth_rate_definition","sales_multiple","sales_validation",
  "sales_representative_series_id","sales_representative_scope","sales_representative_reason","sales_representative_review_required",
  "sales_reported_primary_series_id","sales_reported_scope","sales_reported_baseline_year","sales_reported_baseline_oku_yen","sales_reported_target_year","sales_reported_target_oku_yen","sales_reported_increase_oku_yen","sales_reported_growth_pct","sales_reported_cagr_pct",
];
const metricColumns = Object.keys(metricLabels).flatMap((key) => [
  `${key}_base_period_label`,`${key}_base_year_before_correction`,`${key}_base_year_after_correction`,`${key}_base_year_correction_method`,`${key}_base_year_correction_confidence`,`${key}_base_year`,`${key}_base_value`,
  `${key}_target_period_label`,`${key}_target_year_before_correction`,`${key}_target_year_after_correction`,`${key}_target_year_correction_method`,`${key}_target_year_correction_confidence`,`${key}_target_year`,`${key}_target_value`,`${key}_unit`,`${key}_annual_rate_pct`,`${key}_status`,`${key}_validation`,`${key}_raw_evidence`,
]);
const caseColumns = [...originalCaseColumns, ...metricColumns,
  "manual_audit_confidence","manual_audit_correction_count","manual_audit_notes","investment_components","manual_audit_corrections","pdf_url"];
await writeCsv(path.join(stageDir, "data", "processed", "cases.csv"), integrated, caseColumns);
await writeCsv(path.join(stageDir, "data", "processed", "sales_series.csv"), allSales, Object.keys(allSales[0]));
await writeCsv(path.join(stageDir, "data", "processed", "metrics.csv"), allMetrics, Object.keys(allMetrics[0]));
await writeCsv(path.join(stageDir, "data", "processed", "validations.csv"), allMetrics, Object.keys(allMetrics[0]));
const salesTargets = integrated.map((row) => {
  const primary = row.sales_series.find((series) => series.is_reported_primary) ?? row.sales_series[0];
  return {
    case_id: row.case_id, round: row.round, company: row.company, page: primary?.page,
    page_role: "長期成長ビジョン", source_method: "ai_visual_manual_audit", confidence: row.manual_audit_confidence,
    baseline_period_label: primary?.baseline_period_label,
    baseline_year_before_correction: primary?.baseline_year_before_correction,
    baseline_year_after_correction: primary?.baseline_year_after_correction,
    baseline_year_correction_method: primary?.baseline_year_correction_method,
    baseline_year: primary?.baseline_year, baseline_sales_oku: primary?.baseline_sales_oku,
    target_period_label: primary?.target_period_label,
    target_year_before_correction: primary?.target_year_before_correction,
    target_year_after_correction: primary?.target_year_after_correction,
    target_year_correction_method: primary?.target_year_correction_method,
    target_year: primary?.target_year, target_sales_oku: primary?.target_sales_oku,
    increase_oku: primary?.increase_oku, stated_rate_pct: primary?.stated_rate_pct,
    stated_rate_type: primary?.growth_rate_definition, calculated_cagr_pct: primary?.cagr_pct,
    validation_status: primary?.arithmetic_status, raw: primary?.raw_fragment, pdf_url: row.pdf_url,
  };
});
await writeCsv(path.join(stageDir, "data", "processed", "sales_targets.csv"), salesTargets, Object.keys(salesTargets[0]));
const salesAnnual = [];
for (const series of allSales) {
  for (const [pointType, labelKey, yearKey, beforeYearKey, monthKey, beforeMonthKey, methodKey, valueKey] of [
    ["baseline", "baseline_period_label", "baseline_year_after_correction", "baseline_year_before_correction", "baseline_month_after_correction", "baseline_month_before_correction", "baseline_year_correction_method", "baseline_sales_oku"],
    ["target", "target_period_label", "target_year_after_correction", "target_year_before_correction", "target_month_after_correction", "target_month_before_correction", "target_year_correction_method", "target_sales_oku"],
  ]) {
    if (series[valueKey] == null) continue;
    salesAnnual.push({
      case_id: series.case_id, round: series.round, company: series.company, series_id: series.series_id,
      series_label: series.series_label, point_type: pointType, period_label: series[labelKey],
      year_before_correction: series[beforeYearKey], year_after_correction: series[yearKey], year_correction_method: series[methodKey],
      year: series[yearKey], month_before_correction: series[beforeMonthKey], month_after_correction: series[monthKey], month: series[monthKey], sales_oku_yen: series[valueKey],
      page: series.page, pdf_url: series.pdf_url,
    });
  }
}
await writeCsv(path.join(stageDir, "data", "processed", "sales_series_annual.csv"), salesAnnual, Object.keys(salesAnnual[0]));
await writeCsv(path.join(stageDir, "data", "processed", "sales_annual.csv"), salesAnnual, Object.keys(salesAnnual[0]));
await writeCsv(path.join(stageDir, "data", "processed", "cost_validations.csv"), integrated.map((row) => ({
  case_id: row.case_id, round: row.round, company: row.company, page: row.cost_page,
  source_method: row.cost_source_method, box_transcription: row.cost_box_transcription,
  cost_million: row.project_cost_million_yen, subsidy_million: row.subsidy_million_yen,
  subsidy_rate_pct: row.subsidy_rate_pct, validation: row.cost_validation,
  components: row.investment_components, pdf_url: row.pdf_url,
})), ["case_id","round","company","page","source_method","box_transcription","cost_million","subsidy_million","subsidy_rate_pct","validation","components","pdf_url"]);

const qaSource = await fs.readFile(path.join(projectDir, "html", "qa.html"), "utf8");
const start = qaSource.indexOf("const DATA=");
const end = qaSource.indexOf(";\n", start);
if (start < 0 || end < 0) throw new Error("Could not locate embedded DATA in qa.html");
let qaIntegrated = `${qaSource.slice(0, start)}const DATA=${JSON.stringify(integrated).replace(/<\//g, "<\\/")}${qaSource.slice(end)}`;
qaIntegrated = qaIntegrated.replace(
  /function metricTable\(rows\)\{[\s\S]*?\}\nfunction salesSeriesTable/,
  `function metricTable(rows){return '<table><thead><tr><th>指標</th><th>基準期・値</th><th>目標期・値</th><th>年平均率</th><th>監査状態</th><th>出典</th></tr></thead><tbody>'+rows.map(m=>'<tr><td><b>'+esc(m.metric)+'</b><br><small>'+esc(m.unit||'')+'</small></td><td>'+esc(m.base_period_label||'記載なし')+'<br><small>補正前: '+val(m.base_year_before_correction)+' → 補正後: '+val(m.base_year_after_correction)+'</small><br><small>'+esc(m.base_year_correction_method||'')+'</small><br><b>'+val(m.base_value)+'</b></td><td>'+esc(m.target_period_label||'記載なし')+'<br><small>補正前: '+val(m.target_year_before_correction)+' → 補正後: '+val(m.target_year_after_correction)+'</small><br><small>'+esc(m.target_year_correction_method||'')+'</small><br><b>'+val(m.target_value)+'</b></td><td class="num">'+(m.listed_rate_pct==null?'—':num(m.listed_rate_pct)+'%')+'</td><td class="status">'+esc(m.validation||m.status)+'<br><small>'+esc(m.year_status||'')+'</small></td><td><button class="source" data-page="'+(m.page||1)+'">p.'+(m.page||1)+'</button><details><summary>表の原文</summary><div class="raw">'+esc(m.raw||'')+'</div></details></td></tr>').join('')+'</tbody></table>'}
function salesSeriesTable`,
);
qaIntegrated = qaIntegrated.replace(
  /function salesSeriesTable\(rows\)\{[\s\S]*?\}\nfunction salesSeriesHtml/,
  `function salesSeriesTable(rows){return '<table><thead><tr><th>系列</th><th>基準期（原文／補正前→補正後）</th><th>基準売上</th><th>目標期（原文／補正前→補正後）</th><th>目標売上</th><th>増加額</th><th>成長率 / CAGR</th><th>検証</th></tr></thead><tbody>'+rows.map(s=>'<tr><td><span class="pill '+(s.is_applicant_representative?'ok':'')+'">'+esc(s.series_role)+'</span><br><b>'+esc(s.series_label)+'</b><br><small>'+esc(s.extraction_method)+'</small></td><td>'+esc(s.baseline_period_label||'記載なし')+'<br><small>'+val(s.baseline_year_before_correction)+' → '+val(s.baseline_year_after_correction)+(s.baseline_month_after_correction?'/'+s.baseline_month_after_correction:'')+'</small><br><small>'+esc(s.baseline_year_correction_method||'')+'</small></td><td class="num">'+num(s.baseline_sales_oku)+'億円</td><td>'+esc(s.target_period_label||'記載なし')+'<br><small>'+val(s.target_year_before_correction)+' → '+val(s.target_year_after_correction)+(s.target_month_after_correction?'/'+s.target_month_after_correction:'')+'</small><br><small>'+esc(s.target_year_correction_method||'')+'</small></td><td class="num">'+num(s.target_sales_oku)+'億円</td><td class="num">'+num(s.increase_oku)+'億円</td><td class="num">'+num(s.growth_rate_pct)+'%<br><small>CAGR '+num(s.cagr_pct)+'%</small></td><td><span class="pill '+(s.review_required?'issue':'ok')+'">'+(s.review_required?'要確認':esc(s.arithmetic_status))+'</span><br><button class="source" data-page="'+(s.page||1)+'">p.'+(s.page||1)+'</button><details><summary>系列原文</summary><div class="raw">'+esc(s.raw_fragment)+'</div></details></td></tr>').join('')+'</tbody></table>'}
function salesSeriesHtml`,
);
qaIntegrated = qaIntegrated.replace(
  "+section('事業費・補助額'",
  "+section('生成AI画像目視監査','<div class=\"grid\"><div class=\"kv\"><label>信頼度</label><b>'+esc(r.manual_audit_confidence)+'</b></div><div class=\"kv\"><label>確認ページ</label><b>'+esc((r.manual_audit_pages||[]).join(', '))+'</b></div><div class=\"kv\"><label>修正・注記</label><b>'+num(r.manual_audit_correction_count)+'件</b></div></div><div class=\"raw\">'+esc(r.manual_audit_notes||'')+'</div>'+(r.manual_audit_corrections?.length?'<details><summary>修正・不整合の内訳</summary><div class=\"raw\">'+esc(JSON.stringify(r.manual_audit_corrections,null,2))+'</div></details>':'') )+section('事業費・補助額'",
);
await fs.writeFile(path.join(stageDir, "html", "qa.html"), qaIntegrated, "utf8");

for (const name of ["schema.json", "cross_batch_validation.md", "sales_numeric_validation.md", "recheck_A1.md", "recheck_A2.md", "recheck_B.md"]) {
  await fs.copyFile(path.join(here, name), path.join(stageDir, name === "schema.json" ? "data/manual_audit/schema.json" : `docs/${name}`));
}
for (const name of ["integrate_manual_audit.mjs", "validate_integration.mjs"]) {
  await fs.copyFile(path.join(here, name), path.join(stageDir, "scripts", name));
}

const summary = {
  cases: integrated.length,
  sales_series: allSales.length,
  metrics: allMetrics.length,
  officer_rate_only: audits.filter((row) => row.metrics.officer_pay.status === "rate_only").length,
  applicant_representative_missing: integrated.filter((row) => !row.sales_representative_series_id).length,
  corrections: integrated.reduce((sum, row) => sum + row.manual_audit_correction_count, 0),
  sales_annual: salesAnnual.length,
  stage_dir: stageDir,
};
await fs.writeFile(path.join(stageDir, "integration_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(stageDir, "dataset_stats.json"), `${JSON.stringify({
  cases: integrated.length, pages: 887, boxes: 1995, metrics: allMetrics.length,
  primary_metrics: integrated.length * 4, sales_targets: salesTargets.length,
  sales_series: allSales.length, sales_series_annual: salesAnnual.length,
  sales_applicant_representatives: integrated.filter((row) => row.sales_representative_series_id).length,
  officer_rate_only: summary.officer_rate_only, manual_corrections: summary.corrections,
  narratives: 2999, generated_at: new Date().toISOString(),
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
