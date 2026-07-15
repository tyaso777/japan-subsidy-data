#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const stage = process.argv[2];
if (!stage) throw new Error("Usage: node validate_integration.mjs <stage-dir>");
const cases = JSON.parse(await fs.readFile(path.join(stage, "html", "data", "cases.json"), "utf8"));
const errors = [];
const ids = new Set(cases.map((row) => row.case_id));
if (cases.length !== 381) errors.push(`cases=${cases.length}`);
if (ids.size !== 381) errors.push(`unique_ids=${ids.size}`);

let salesCount = 0;
let metricCount = 0;
let officerRateOnly = 0;
for (const row of cases) {
  if (!Array.isArray(row.sales_series) || !row.sales_series.length) errors.push(`${row.case_id}: missing sales_series`);
  for (const series of row.sales_series ?? []) {
    for (const side of ["baseline", "target"]) {
      if (!Object.hasOwn(series, `${side}_year_before_correction`) || !Object.hasOwn(series, `${side}_year_after_correction`)) errors.push(`${row.case_id}: missing ${side} year correction fields`);
      const label = String(series[`${side}_period_label`] ?? "");
      if (/\d+\s*年(?:後|前|以内)/.test(label) && series[`${side}_year_after_correction`] != null && series[`${side}_year_correction_method`] === "two_digit_year_assume_2000s") errors.push(`${row.case_id}: relative period misread as two-digit year: ${label}`);
    }
  }
  salesCount += row.sales_series?.length ?? 0;
  const metricMap = new Map((row.metrics ?? []).map((metric) => [metric.metric_key, metric]));
  for (const key of ["labor", "employee_pay", "officer_pay", "employees"]) {
    if (!metricMap.has(key)) errors.push(`${row.case_id}: missing ${key}`);
  }
  metricCount += row.metrics?.length ?? 0;
  const officer = metricMap.get("officer_pay");
  if (officer?.status === "rate_only") {
    officerRateOnly += 1;
    if (officer.listed_rate_pct == null) errors.push(`${row.case_id}: officer rate_only without rate`);
  }
  const representatives = row.sales_series.filter((series) => series.is_applicant_representative);
  if (representatives.length > 1) errors.push(`${row.case_id}: multiple applicant representatives`);
  if (row.sales_representative_series_id && representatives.length !== 1) errors.push(`${row.case_id}: representative pointer mismatch`);
}
if (salesCount !== 508) errors.push(`sales_series=${salesCount}`);
if (officerRateOnly !== 216) errors.push(`officer_rate_only=${officerRateOnly}`);
const byId = new Map(cases.map((row) => [row.case_id, row]));
const s109 = byId.get("s1_outline_109")?.sales_series?.[0];
if (s109?.baseline_year_before_correction !== null || s109?.baseline_year_after_correction !== 2023) errors.push("s1_outline_109: 23/12 correction failed");
const s127Relative = byId.get("s1_outline_127")?.sales_series?.find((series) => series.target_period_label === "5年後");
if (s127Relative?.target_year_after_correction !== 2029) errors.push("s1_outline_127: 5-year relative correction failed");

const qa = await fs.readFile(path.join(stage, "html", "qa.html"), "utf8");
const start = qa.indexOf("const DATA=") + "const DATA=".length;
const end = qa.indexOf(";\n", start);
if (start < "const DATA=".length || end < 0) errors.push("qa DATA marker missing");
else {
  const qaCases = JSON.parse(qa.slice(start, end));
  if (qaCases.length !== 381) errors.push(`qa cases=${qaCases.length}`);
}
for (const [index, match] of [...qa.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  try { new vm.Script(match[1], { filename: `qa-script-${index + 1}.js` }); }
  catch (error) { errors.push(`qa script syntax: ${error.message}`); }
}

const personal = [];
for (const file of [
  path.join(stage, "html", "data", "cases.json"),
  path.join(stage, "html", "qa.html"),
  path.join(stage, "data", "processed", "cases.csv"),
  path.join(stage, "data", "processed", "sales_series.csv"),
  path.join(stage, "data", "processed", "metrics.csv"),
]) {
  if ((await fs.readFile(file, "utf8")).includes("AtsushiSuzuki")) personal.push(file);
}
if (personal.length) errors.push(`personal paths found: ${personal.join(", ")}`);

const examples = Object.fromEntries(["s1_outline_10", "s1_outline_107", "s1_outline_116", "s2_outline_104"].map((id) => {
  const row = cases.find((item) => item.case_id === id);
  return [id, {
    company: row?.company,
    sales_series: row?.sales_series?.length,
    officer_status: row?.officer_pay_status,
    officer_rate: row?.officer_pay_annual_rate_pct,
  }];
}));
const result = { status: errors.length ? "error" : "ok", cases: cases.length, sales_series: salesCount, metrics: metricCount, officer_rate_only: officerRateOnly, errors, examples };
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
