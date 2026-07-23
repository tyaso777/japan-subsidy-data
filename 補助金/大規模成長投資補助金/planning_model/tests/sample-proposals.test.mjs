import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseName = "成長投資計画_提案計画サンプル_基準年売上開始";
const standardBaseName = "成長投資計画_提案計画サンプル";
const partiallyUnmetBaseName = "成長投資計画_提案計画サンプル_一部目標未達";

test("standard sample represents the completed two-pass planning workflow", async () => {
  const html = await readFile(path.join(projectDirectory, "examples", `${standardBaseName}.html`), "utf8");
  const payload = html.match(/<script id="growth-proposal-data" type="application\/json">([^<]+)<\/script>/)?.[1];
  assert.ok(payload, "proposal payload should be embedded for reimport");
  const proposal = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));

  assert.equal(proposal.forecastOverrides["2029:other:sales"], 85.13);
  assert.equal(proposal.forecastOverrides["2029:project:7-8"], 7.89);
  assert.equal(proposal.futureInputBasis, "other");
  assert.equal(proposal.drivers.projectPayGrowth, 0.07, "planning input should retain the pre-optimization default");
  assert.ok(proposal.adjustedDrivers.projectPayGrowth > 0.088, "second optimization should lift project pay growth after the manual future input");
  assert.equal(proposal.adjustedDrivers.projectSalesGrowth, 0.2938871439006574, "saved result should match a rerun from planning inputs plus future overrides");
  assert.ok(proposal.adjustedDrivers.projectSalesGrowth <= proposal.driverRanges.projectSalesGrowth[1]);
  assert.equal(proposal.drivers.subsidy, 7.66);
  assert.equal(proposal.targets.companySalesIncrease.value, 133.5);
  assert.equal(proposal.targets.companySalesCagr.value, 20);
});

test("partially unmet sample retains a visibly unattainable pay target", async () => {
  const html = await readFile(path.join(projectDirectory, "examples", `${partiallyUnmetBaseName}.html`), "utf8");
  const payload = html.match(/<script id="growth-proposal-data" type="application\/json">([^<]+)<\/script>/)?.[1];
  assert.ok(payload, "proposal payload should be embedded for reimport");
  const proposal = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));

  assert.equal(proposal.title, "成長投資計画 一部目標未達サンプル");
  assert.equal(proposal.targets.companyPaySchedule.value, 3.5);
  assert.equal(proposal.adjustedDrivers.projectPayGrowthToBase, proposal.driverRanges.projectPayGrowthToBase[1]);
  assert.equal(proposal.adjustedDrivers.otherPayGrowthToBase, proposal.driverRanges.otherPayGrowthToBase[1]);
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
