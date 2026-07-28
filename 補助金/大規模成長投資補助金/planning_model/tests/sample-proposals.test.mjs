import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseName = "成長投資計画_提案計画サンプル_基準年売上開始";
const standardBaseName = "成長投資計画_提案計画サンプル";
const partiallyUnmetBaseName = "成長投資計画_提案計画サンプル_一部目標未達";
const multipleUnmetBaseName = "成長投資計画_提案計画サンプル_複数目標未達";
const wholeCompanyBaseName = "成長投資計画_入力サンプル_切り分けなし";
const runtimePath = path.join(projectDirectory, ".sample-proposal-test-runtime.mjs");
const sampleRuntime = await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);

const proposalFromHtml = async (baseName) => {
  const html = await readFile(path.join(projectDirectory, "examples", `${baseName}.html`), "utf8");
  const payload = html.match(/<script id="growth-proposal-data" type="application\/json">([^<]+)<\/script>/)?.[1];
  assert.ok(payload, "proposal payload should be embedded for reimport");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
};

const assertOptimizationIsStable = (proposal) => {
  const rerun = sampleRuntime.reoptimizeSampleProposal(proposal);
  const differences = Object.keys(proposal.adjustedDrivers)
    .filter((key) => Math.abs(proposal.adjustedDrivers[key] - rerun.drivers[key]) > 1e-12)
    .map((key) => `${key}: saved=${proposal.adjustedDrivers[key]}, rerun=${rerun.drivers[key]}`);
  assert.deepEqual(differences, [], `saved optimization result must be a deterministic fixed point:\n${differences.join("\n")}`);
  assert.deepEqual(
    sampleRuntime.createStandardSampleEffectivePlan(proposal),
    rerun.plan,
    "annual PL and all derived metric judgements must remain unchanged after optimization",
  );
};

const assertHistoricalPayrollInputsAreExplicit = (proposal) => {
  for (const row of proposal.historicalPlan) {
    const expectedEmployeePayroll = Number((
      (row.project.employeePayrollTotal ?? row.project.employeePay)
      + (row.other.employeePayrollTotal ?? row.other.employeePay)
    ).toFixed(2));
    const expectedOfficerPayroll = Number((
      (row.project.officerPayrollTotal ?? row.project.officerPay)
      + (row.other.officerPayrollTotal ?? row.other.officerPay)
    ).toFixed(2));

    assert.equal(
      proposal.inputValues[`actual:company:${row.year}:2-21`],
      expectedEmployeePayroll,
      `${row.year}年の2-21は確認用サンプルに実入力値として保存する`,
    );
    assert.equal(
      proposal.inputValues[`actual:company:${row.year}:2-22`],
      expectedOfficerPayroll,
      `${row.year}年の2-22は確認用サンプルに実入力値として保存する`,
    );
  }
};

test("standard sample represents the completed two-pass planning workflow", async () => {
  const proposal = await proposalFromHtml(standardBaseName);

  assert.equal(proposal.forecastOverrides["2029:other:sales"], 8_513_000_000);
  assert.equal(proposal.forecastOverrides["2029:project:7-8"], 790_000_000);
  assert.equal(proposal.futureInputBasis, "other");
  assert.equal(proposal.drivers.projectPayGrowth, 0.07, "planning input should retain the pre-optimization default");
  assert.ok(proposal.adjustedDrivers.projectPayGrowth > 0.08, "future pay override should be offset so the official pay-growth metric remains near the median");
  assert.ok(Math.abs(proposal.adjustedDrivers.projectSalesGrowth - 0.22) < 0.001, "saved result should remain near the fifth-round accepted-company median");
  assert.ok(proposal.adjustedDrivers.projectSalesGrowth <= proposal.driverRanges.projectSalesGrowth[1]);
  assert.equal(proposal.drivers.subsidy, 766_000_000);
  assert.equal(proposal.drivers.investment, 2_300_000_000);
  assert.ok(
    proposal.futureCapex.every((row) => row.value === 0 && !Object.hasOwn(proposal.inputValues, `future-capex:${row.year}`)),
    "the investment adjustment level must not be allocated automatically to annual capex",
  );
  assert.equal(proposal.targets.companySalesIncrease.value, 8_240_000_000);
  assert.equal(proposal.targets.companySalesCagr.value, 15);
  for (const code of ["2-18", "2-19", "2-20", "2-27", "2-28"]) {
    assert.equal(typeof proposal.inputValues[`actual:company:2025:${code}`], "number", `${code} must be saved as a round-six input`);
  }
  for (const year of [2023, 2024, 2025]) {
    assert.equal(typeof proposal.inputValues[`actual:project:${year}:7-10`], "number");
    assert.equal(Object.hasOwn(proposal.inputValues, `actual:project:${year}:P2-4`), false);
    assert.equal(Object.hasOwn(proposal.inputValues, `actual:project:${year}:P2-14`), false);
  }
  assert.equal(typeof proposal.historicalPlan[2].other.ordinaryIncome, "number");
  assert.equal(typeof proposal.historicalPlan[2].other.preTaxIncome, "number");
  assert.equal(typeof proposal.historicalPlan[2].other.netIncome, "number");
  assertHistoricalPayrollInputsAreExplicit(proposal);
  assertOptimizationIsStable(proposal);
});

test("generated samples include every sixth-round metric definition", async () => {
  const html = await readFile(path.join(projectDirectory, "examples", `${standardBaseName}.html`), "utf8");
  assert.doesNotMatch(html, /第6次定義：undefined/);
  assert.match(html, /第6次定義：基準年→事業化報告3年目（3年CAGR）/);
});

test("partially unmet sample retains a visibly unattainable pay target", async () => {
  const proposal = await proposalFromHtml(partiallyUnmetBaseName);
  const rerun = sampleRuntime.reoptimizeSampleProposal(proposal);

  assert.equal(proposal.title, "成長投資計画 一部目標未達サンプル");
  assert.equal(proposal.targets.companyPaySchedule.value, 3.5);
  assert.ok(rerun.failed.some((item) => item.key === "companyPaySchedule"));
  assert.ok(
    proposal.adjustedDrivers.projectPayGrowthToBase === proposal.driverRanges.projectPayGrowthToBase[1]
      || proposal.adjustedDrivers.otherPayGrowthToBase === proposal.driverRanges.otherPayGrowthToBase[1],
    "an unattainable pay target should exhaust at least one relevant pay-growth range",
  );
  assertHistoricalPayrollInputsAreExplicit(proposal);
  assertOptimizationIsStable(proposal);
});

test("multiple unmet sample retains three deterministic unmet targets", async () => {
  const proposal = await proposalFromHtml(multipleUnmetBaseName);
  const rerun = sampleRuntime.reoptimizeSampleProposal(proposal);
  const expectedUnmet = ["companySalesCagr", "companyPaySchedule", "projectSalesCagr"];
  const actualUnmet = rerun.failed.map((item) => item.key).filter((key) => expectedUnmet.includes(key)).sort();

  assert.equal(proposal.title, "成長投資計画 複数目標未達サンプル");
  assert.equal(proposal.targets.companySalesCagr.value, 30);
  assert.equal(proposal.targets.companyPaySchedule.value, 3.5);
  assert.equal(proposal.targets.projectSalesCagr.value, 35);
  assert.deepEqual(actualUnmet, [...expectedUnmet].sort());
  assert.equal(rerun.failed.length, 3);
  assertHistoricalPayrollInputsAreExplicit(proposal);
  assertOptimizationIsStable(proposal);
});

test("base-year launch sample has no project sales before the base year", async () => {
  const html = await readFile(path.join(projectDirectory, "examples", `${baseName}.html`), "utf8");
  const payload = html.match(/<script id="growth-proposal-data" type="application\/json">([^<]+)<\/script>/)?.[1];
  assert.ok(payload, "proposal payload should be embedded for reimport");
  const proposal = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));

  assert.equal(proposal.title, "成長投資計画 提案計画サンプル（基準年売上開始）");
  assert.ok(proposal.historicalPlan.every((row) => row.project.sales === 0));
  assert.equal(proposal.inputValues["actual:project:2025:7-1"], 0, "explicit zero must survive export");
  assert.equal(Object.hasOwn(proposal.inputValues, "actual:project:2099:7-1"), false, "missing input must remain absent");
  assert.equal(proposal.metricGroupBases.companySales, "rate");
  assert.equal(proposal.forecastOverrides["2026:project:7-1"], 0);
  assert.equal(proposal.forecastOverrides["2027:project:7-1"], 0);
  assert.equal(proposal.forecastOverrides["2028:project:7-1"], 6_000_000_000);
  assert.ok(proposal.forecastOverrides["2031:project:7-1"] > 6_000_000_000);
  assertHistoricalPayrollInputsAreExplicit(proposal);
});

test("base-year launch Excel is an OOXML zip workbook", async () => {
  const xlsx = await readFile(path.join(projectDirectory, "examples", `${baseName}.xlsx`));
  assert.equal(xlsx.subarray(0, 2).toString("ascii"), "PK");
});

test("whole-company sample treats every company amount as the subsidy project", async () => {
  const proposal = await proposalFromHtml(wholeCompanyBaseName);
  const effectivePlan = sampleRuntime.createStandardSampleEffectivePlan(proposal);

  assert.equal(proposal.title, "成長投資計画 切り分けなし入力サンプル");
  assert.equal(proposal.businessSegmentationMode, "wholeCompanyAsProject");
  assert.equal(proposal.futureInputBasis, "company");
  for (const row of proposal.historicalPlan) {
    assert.ok(Object.values(row.other).every((value) => value === 0), `${row.year}年のベース事業は0`);
    assert.equal(
      proposal.inputValues[`actual:company:${row.year}:2-1`],
      proposal.inputValues[`actual:project:${row.year}:7-1`],
      `${row.year}年の全社売上高と補助事業売上高は一致`,
    );
  }
  for (const row of effectivePlan) {
    assert.ok(Object.values(row.other).every((value) => value === 0), `${row.year}年の出力でもベース事業は0`);
  }
});

test("whole-company input sample Excel is an OOXML zip workbook", async () => {
  const xlsx = await readFile(path.join(projectDirectory, "examples", `${wholeCompanyBaseName}.xlsx`));
  assert.equal(xlsx.subarray(0, 2).toString("ascii"), "PK");
});

test("incomplete input samples render non-finite metrics as blank instead of NaN", async () => {
  const html = await readFile(path.join(projectDirectory, "examples", `${wholeCompanyBaseName}.html`), "utf8");
  const xlsx = await readFile(path.join(projectDirectory, "examples", `${wholeCompanyBaseName}.xlsx`));
  const workbookXml = Object.values(unzipSync(xlsx))
    .map((entry) => Buffer.from(entry).toString("utf8"))
    .join("\n");

  assert.doesNotMatch(html, />NaN</);
  assert.doesNotMatch(workbookXml, />NaN</);
});
