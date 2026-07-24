import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseName = "成長投資計画_提案計画サンプル_基準年売上開始";
const standardBaseName = "成長投資計画_提案計画サンプル";
const partiallyUnmetBaseName = "成長投資計画_提案計画サンプル_一部目標未達";
const multipleUnmetBaseName = "成長投資計画_提案計画サンプル_複数目標未達";
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

test("standard sample represents the completed two-pass planning workflow", async () => {
  const proposal = await proposalFromHtml(standardBaseName);

  assert.equal(proposal.forecastOverrides["2029:other:sales"], 85.13);
  assert.equal(proposal.forecastOverrides["2029:project:7-8"], 7.9);
  assert.equal(proposal.futureInputBasis, "other");
  assert.equal(proposal.drivers.projectPayGrowth, 0.07, "planning input should retain the pre-optimization default");
  assert.ok(proposal.adjustedDrivers.projectPayGrowth > 0.088, "future pay override should be offset so the official pay-growth metric remains near the median");
  assert.ok(Math.abs(proposal.adjustedDrivers.projectSalesGrowth - 0.22) < 0.001, "saved result should remain near the fifth-round accepted-company median");
  assert.ok(proposal.adjustedDrivers.projectSalesGrowth <= proposal.driverRanges.projectSalesGrowth[1]);
  assert.equal(proposal.drivers.subsidy, 7.66);
  assert.equal(proposal.targets.companySalesIncrease.value, 82.4);
  assert.equal(proposal.targets.companySalesCagr.value, 15);
  assertOptimizationIsStable(proposal);
});

test("partially unmet sample retains a visibly unattainable pay target", async () => {
  const proposal = await proposalFromHtml(partiallyUnmetBaseName);

  assert.equal(proposal.title, "成長投資計画 一部目標未達サンプル");
  assert.equal(proposal.targets.companyPaySchedule.value, 3.5);
  assert.ok(proposal.adjustedDrivers.projectPayGrowthToBase < proposal.driverRanges.projectPayGrowthToBase[1]);
  assert.ok(proposal.adjustedDrivers.otherPayGrowthToBase < proposal.driverRanges.otherPayGrowthToBase[1]);
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
  assert.equal(proposal.forecastOverrides["2028:project:7-1"], 60);
  assert.ok(proposal.forecastOverrides["2031:project:7-1"] > 60);
});

test("base-year launch Excel is an OOXML zip workbook", async () => {
  const xlsx = await readFile(path.join(projectDirectory, "examples", `${baseName}.xlsx`));
  assert.equal(xlsx.subarray(0, 2).toString("ascii"), "PK");
});
