import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const modelPath = path.join(projectDirectory, "app", "model.ts");
const source = await readFile(modelPath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const model = commonJsModule.exports;

const cagr = (start, end, years) => ((end / start) ** (1 / years) - 1) * 100;
const makePlan = (settings = model.DEFAULT_TIMELINE) => model.generatePlan(model.createHistoricalPlan(model.sampleBasePlan, settings), model.sampleDrivers, settings);

test("application starts without sample company, project, balance-sheet, or driver values", () => {
  const segmentValues = [...Object.values(model.basePlan.project), ...Object.values(model.basePlan.other)];
  assert.ok(segmentValues.every((value) => value === 0));
  assert.ok(model.defaultBalanceSheets.every((row) => Object.entries(row).filter(([key]) => key !== "year").every(([, value]) => value === 0)));
  assert.ok(Object.values(model.defaultDrivers).every((value) => value === 0));
  assert.equal(model.sampleBasePlan.project.sales, 80);
  assert.equal(model.sampleDrivers.investment, 45);
});

test("relative planning metrics have fixed ceilings while absolute amounts are scale dependent", () => {
  assert.equal(model.metrics.length, 15);
  const scaleDependent = new Set(["companySalesIncrease", "projectSalesIncrease", "valueAddedIncrease", "employeePayIncrease", "officerPayIncrease"]);
  for (const definition of model.metrics.filter((item) => item.key !== "localBenchmark" && !scaleDependent.has(item.key))) {
    const target = model.defaultTargets[definition.key];
    assert.ok(Number.isFinite(target.max));
    assert.ok(target.max > target.value);
    assert.equal(model.targetStatus(definition, target.max + 1, target).ok, false);
  }
  for (const key of scaleDependent) {
    assert.equal(model.defaultTargets[key].value, 0);
    assert.equal(model.defaultTargets[key].max, undefined);
  }
  assert.equal(model.defaultTargets.localBenchmark.policy, "monitor");
  const localHardTargets = structuredClone(model.defaultTargets);
  localHardTargets.localBenchmark.policy = "hard";
  localHardTargets.localBenchmark.value = 100;
  const summary = model.hardTargetSummary(model.calculateMetrics(makePlan(), model.sampleDrivers), localHardTargets);
  assert.equal(summary.hardCount, 0);
});

test("round-six officer metrics are reference-only and displayed last", () => {
  assert.deepEqual(model.metrics.slice(-2).map((item) => item.key), ["officerPayCagr", "officerPayIncrease"]);
  assert.equal(model.defaultTargets.officerPayCagr.policy, "monitor");
  assert.equal(model.defaultTargets.officerPayIncrease.policy, "monitor");
  assert.equal(model.isOptimizationExcludedMetric("officerPayCagr"), true);
  assert.equal(model.isOptimizationExcludedMetric("officerPayIncrease"), true);
  assert.equal(model.isOptimizationExcludedMetric("employeePayCagr"), false);
});

test("absolute-amount target defaults scale with the underlying company", () => {
  const plan = makePlan();
  const baseTargets = model.calculateScaleDependentTargetDefaults(plan, model.defaultTargets);
  const doubledPlan = structuredClone(plan);
  for (const row of doubledPlan) {
    for (const segment of [row.project, row.other]) {
      for (const key of ["sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga"]) segment[key] *= 2;
    }
  }
  const doubledTargets = model.calculateScaleDependentTargetDefaults(doubledPlan, model.defaultTargets);
  for (const key of ["companySalesIncrease", "projectSalesIncrease", "valueAddedIncrease", "employeePayIncrease"]) {
    assert.ok(baseTargets[key].value >= 0);
    assert.ok(baseTargets[key].max >= baseTargets[key].value);
    assert.ok(Math.abs(doubledTargets[key].value - baseTargets[key].value * 2) < 0.02);
    assert.ok(Math.abs(doubledTargets[key].max - baseTargets[key].max * 2) < 0.02);
  }
  assert.equal(baseTargets.officerPayIncrease, undefined);
});

test("sixth-round periods drive all current metrics", () => {
  const plan = makePlan();
  const actual = model.calculateMetrics(plan, model.sampleDrivers);
  const base = plan.find((row) => row.role === "base");
  const report3 = plan.find((row) => row.role === "report3");
  const latest = plan.find((row) => row.role === "latest");
  const baseCompany = model.total(base.project, base.other);
  const report3Company = model.total(report3.project, report3.other);
  const latestCompany = model.total(latest.project, latest.other);

  assert.equal(actual.companySalesCagr, cagr(baseCompany.sales, report3Company.sales, 3));
  assert.equal(actual.companySalesIncrease, report3Company.sales - baseCompany.sales);
  assert.equal(actual.projectSalesCagr, cagr(base.project.sales, report3.project.sales, 3));
  assert.equal(actual.investmentSalesRatio, model.sampleDrivers.investment / latestCompany.sales * 100);
});

test("historical target references compare the two actual-year intervals", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const comparisons = model.calculateHistoricalMetricComparisons(historical, model.sampleBalanceSheets);
  const firstCompany = model.total(historical[0].project, historical[0].other);
  const secondCompany = model.total(historical[1].project, historical[1].other);
  const latestCompany = model.total(historical[2].project, historical[2].other);

  assert.deepEqual(comparisons.companySalesIncrease, [
    secondCompany.sales - firstCompany.sales,
    latestCompany.sales - secondCompany.sales,
  ]);
  assert.equal(comparisons.investmentSalesRatio[1], model.sampleBalanceSheets[2].capex / latestCompany.sales * 100);
  assert.ok(Number.isNaN(comparisons.valueAddedSubsidyRatio[0]));
  assert.ok(Number.isNaN(comparisons.localBenchmark[1]));

  const metricSeries = model.calculateHistoricalMetricSeries(historical, model.sampleBalanceSheets);
  assert.equal(metricSeries.companySalesCagr.mode, "change");
  assert.ok(Number.isNaN(metricSeries.companySalesCagr.values[0]));
  assert.equal(metricSeries.projectSalesShare.mode, "level");
  assert.equal(metricSeries.projectSalesShare.values.length, 3);

  const driverSeries = model.calculateHistoricalDriverSeries(historical, model.sampleBalanceSheets);
  assert.equal(driverSeries.projectSalesGrowth.mode, "change");
  assert.equal(driverSeries.projectCogsImprovementAfterBase.mode, "change");
  assert.equal(driverSeries.projectCogsImprovementToBase.referenceLevels.length, 3);
  assert.equal(driverSeries.projectSgaImprovementToBase.mode, "change");
  assert.equal(driverSeries.projectSgaImprovementToBase.referenceLevels.length, 3);
  assert.equal(model.driverBounds.projectPayGrowthToBase[0], 0);
  const projectPayHistory = driverSeries.projectPayGrowthToBase.values.filter(Number.isFinite);
  assert.equal(projectPayHistory.length, 2);
  assert.ok(projectPayHistory.every((value) => value > 0.015 && value < 0.025));
  assert.deepEqual(model.driverBounds.projectCogsImprovementToBase, [0, 0.02]);
  assert.deepEqual(model.driverBounds.projectSgaImprovementToBase, [0, 0.02]);
  assert.deepEqual(model.driverBounds.otherCogsImprovementToBase, [0, 0.02]);
  assert.deepEqual(model.driverBounds.otherSgaImprovementToBase, [0, 0.02]);
  assert.deepEqual(model.driverBounds.projectCogsImprovementAfterBase, [0, 0.03]);
  assert.deepEqual(model.driverBounds.otherCogsImprovement, [0, 0.03]);
  assert.deepEqual(driverSeries.investment.values, model.sampleBalanceSheets.map((row) => row.capex));
  assert.ok(model.defaultBalanceSheets.every((row) => row.capex === 0));
});

test("project-period forecast starts from latest actuals instead of the legacy 120 sample", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const latest = historical.at(-1);
  const inputs = model.createForecastProjectPeriodInputs(latest, model.sampleDrivers, model.DEFAULT_TIMELINE);

  assert.equal(latest.project.sales, 80);
  assert.equal(inputs[0].project.sales, 96.8);
  assert.notEqual(inputs[0].project.sales, 40);
  assert.equal(inputs.at(-1).year, model.DEFAULT_TIMELINE.baseYear);
});

test("project sales uses separate growth rates before and after the base year", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = { ...model.sampleDrivers, projectSalesGrowthToBase: 0.1, projectSalesGrowth: 0.3 };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const base = plan.find((row) => row.role === "base");
  const report1 = plan.find((row) => row.role === "report1");

  assert.equal(inputs[0].project.sales, 88);
  assert.equal(base.project.sales, 106.48);
  assert.equal(report1.project.sales, 138.42);
});

test("other-business forecast uses separate assumptions before and after the base year", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    otherSalesGrowthToBase: 0.1,
    otherSalesGrowth: 0.2,
    otherCogsImprovementToBase: 0.03,
    otherCogsImprovement: 0.06,
  };
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE);
  const latest = plan.find((row) => row.role === "latest");
  const base = plan.find((row) => row.role === "base");
  const report1 = plan.find((row) => row.role === "report1");
  const report3 = plan.find((row) => row.role === "report3");

  assert.equal(base.other.sales, Number((latest.other.sales * 1.1 ** 3).toFixed(2)));
  assert.equal(report1.other.sales, Number((base.other.sales * 1.2).toFixed(2)));
  assert.ok(Math.abs(base.other.cogs / base.other.sales - 0.65) < 0.001);
  assert.ok(Math.abs(report3.other.cogs / report3.other.sales - 0.59) < 0.001);
});

test("sample other-business post-base assumptions include a modest synergy lift", () => {
  assert.ok(Math.abs(model.sampleDrivers.otherSalesGrowth - model.sampleDrivers.otherSalesGrowthToBase - 0.02) < 1e-9);
  assert.ok(Math.abs(model.sampleDrivers.otherCogsImprovement - model.sampleDrivers.otherCogsImprovementToBase - 0.005) < 1e-9);
  assert.ok(Math.abs(model.sampleDrivers.otherPayGrowth - model.sampleDrivers.otherPayGrowthToBase - 0.005) < 1e-9);
  assert.ok(Math.abs(model.sampleDrivers.otherHeadcountGrowth - model.sampleDrivers.otherHeadcountGrowthToBase - 0.005) < 1e-9);
});

test("forecast PL values are stored with at most two decimal places", () => {
  const plan = makePlan();
  const numericFields = ["sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga", "headcount", "officerCount"];
  for (const row of plan.slice(3)) {
    for (const segment of [row.project, row.other]) {
      for (const field of numericFields) {
        assert.ok(Math.abs(segment[field] * 100 - Math.round(segment[field] * 100)) < 1e-8, `${row.year} ${field}=${segment[field]}`);
      }
    }
  }
});

test("forecast employee and officer counts are stored as whole people", () => {
  const plan = makePlan();
  for (const row of plan.slice(3)) {
    for (const segment of [row.project, row.other]) {
      assert.ok(Number.isInteger(segment.headcount), `${row.year} headcount=${segment.headcount}`);
      assert.ok(Number.isInteger(segment.officerCount), `${row.year} officerCount=${segment.officerCount}`);
    }
  }
});

test("cogs assumptions are period improvement points rather than terminal rates", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsImprovementToBase: 0.06,
    projectCogsImprovementAfterBase: 0.03,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const base = plan.find((row) => row.role === "base");
  const report3 = plan.find((row) => row.role === "report3");

  assert.ok(Math.abs(base.project.cogs / base.project.sales - 0.62) < 1e-4);
  assert.ok(Math.abs(report3.project.cogs / report3.project.sales - 0.59) < 1e-4);
});

test("equipment-period other SGA assumption is an improvement point", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = { ...model.sampleDrivers, projectSgaImprovementToBase: 0.03 };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const base = inputs.at(-1).project;

  assert.ok(Math.abs(base.otherSga / base.sales - 0.095) < 1e-4);
});

test("optimizer respects user-supplied driver ranges", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const bounds = structuredClone(model.driverBounds);
  bounds.projectSalesGrowth = [0.01, 0.02];
  const result = model.optimizeDrivers(
    model.sampleDrivers,
    historical,
    model.DEFAULT_TIMELINE,
    model.defaultTargets,
    model.defaultProjectBasePlan,
    undefined,
    bounds,
  );
  assert.ok(result.drivers.projectSalesGrowth >= 0.01);
  assert.ok(result.drivers.projectSalesGrowth <= 0.02);
});

test("optimizer is deterministic and gives feasible hard targets lexical priority", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const targets = structuredClone(model.defaultTargets);
  for (const target of Object.values(targets)) target.policy = "monitor";
  targets.companySalesCagr = { value: 18, max: 25, policy: "hard", weight: 1 };
  const first = model.optimizeDrivers(model.sampleDrivers, historical, model.DEFAULT_TIMELINE, targets, model.defaultProjectBasePlan, undefined, model.driverBounds, true);
  const second = model.optimizeDrivers(model.sampleDrivers, historical, model.DEFAULT_TIMELINE, targets, model.defaultProjectBasePlan, undefined, model.driverBounds, true);
  assert.deepEqual(first.drivers, second.drivers);
  assert.equal(first.hardFeasible, true);
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), first.drivers, model.DEFAULT_TIMELINE);
  const actual = model.calculateMetrics(model.generatePlan(historical, first.drivers, model.DEFAULT_TIMELINE, inputs), first.drivers);
  assert.equal(model.targetStatus(model.metrics.find((metric) => metric.key === "companySalesCagr"), actual.companySalesCagr, targets.companySalesCagr).ok, true);
});

test("optimizer reaches the standard sample company sales hard target with a reference plan", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const periodInputs = model.createForecastProjectPeriodInputs(historical.at(-1), model.sampleDrivers, model.DEFAULT_TIMELINE);
  const referencePlan = model.generatePlan(historical, model.sampleDrivers, model.DEFAULT_TIMELINE, periodInputs);
  const targets = structuredClone(model.defaultTargets);
  for (const target of Object.values(targets)) target.policy = "monitor";
  targets.companySalesCagr = { value: 21, max: 35, policy: "hard", weight: 1 };

  const result = model.optimizeDrivers(
    model.sampleDrivers,
    historical,
    model.DEFAULT_TIMELINE,
    targets,
    periodInputs,
    referencePlan,
    model.driverBounds,
    true,
  );
  const solvedInputs = model.createForecastProjectPeriodInputs(historical.at(-1), result.drivers, model.DEFAULT_TIMELINE);
  const solvedPlan = model.generatePlan(historical, result.drivers, model.DEFAULT_TIMELINE, solvedInputs);
  const actual = model.calculateMetrics(solvedPlan, result.drivers);

  assert.equal(result.hardFeasible, true);
  assert.equal(model.targetStatus(model.metrics.find((metric) => metric.key === "companySalesCagr"), actual.companySalesCagr, targets.companySalesCagr).ok, true);
});

test("optimizer gives statutory metric minimums lexical priority over conflicting user hard targets", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const initial = { ...model.sampleDrivers, projectPayGrowth: 0.01 };
  const targets = Object.fromEntries(Object.entries(model.defaultTargets).map(([key, target]) => [key, { ...target, policy: "monitor" }]));
  targets.employeePayCagr = { value: 0, max: 1, policy: "hard", weight: 10 };
  const bounds = { ...model.driverBounds, projectPayGrowth: [0, 0.1] };
  const result = model.optimizeDrivers(
    initial,
    historical,
    model.DEFAULT_TIMELINE,
    targets,
    model.defaultProjectBasePlan,
    undefined,
    bounds,
    true,
    undefined,
    { employeePayCagr: 5 },
  );
  const periodInputs = model.createForecastProjectPeriodInputs(historical.at(-1), result.drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, result.drivers, model.DEFAULT_TIMELINE, periodInputs);
  const actual = model.calculateMetrics(plan, result.drivers);

  assert.ok(result.requiredViolation <= 1e-12);
  assert.ok(result.hardViolation > 0);
  assert.equal(result.hardFeasible, false);
  assert.ok(actual.employeePayCagr >= 5 - 1e-8, `employeePayCagr was ${actual.employeePayCagr}`);
});

test("productivity and officer pay use officer counts", () => {
  const plan = makePlan();
  plan.find((row) => row.role === "report3").project.officerCount *= 2;
  const actual = model.calculateMetrics(plan, model.sampleDrivers);
  const base = plan.find((row) => row.role === "base").project;
  const report3 = plan.find((row) => row.role === "report3").project;
  const baseProductivity = model.valueAdded(base) / (base.headcount + base.officerCount);
  const report3Productivity = model.valueAdded(report3) / (report3.headcount + report3.officerCount);
  const baseOfficerPay = base.officerPay / base.officerCount;
  const report3OfficerPay = report3.officerPay / report3.officerCount;

  assert.equal(actual.laborProductivityCagr, cagr(baseProductivity, report3Productivity, 3));
  assert.equal(actual.officerPayCagr, cagr(baseOfficerPay, report3OfficerPay, 3));
});

test("sixth-round wage requirement falls back to officers only when base converted employee count is zero", () => {
  const plan = makePlan();
  const base = plan.find((row) => row.role === "base").project;
  const report3 = plan.find((row) => row.role === "report3").project;
  base.headcount = 0;
  base.employeePay = 0;
  report3.headcount = 0;
  report3.employeePay = 0;
  const actual = model.calculateMetrics(plan, model.sampleDrivers);
  const expected = cagr(base.officerPay / base.officerCount, report3.officerPay / report3.officerCount, 3);
  assert.equal(actual.employeePayCagr, expected);
});

test("timeline follows the application form: three past periods plus up to nine future periods", () => {
  const defaultPlan = makePlan({ latestYear: 2025, baseYear: 2028 });
  assert.deepEqual(defaultPlan.slice(0, 3).map((row) => row.role), ["prePrevious", "previous", "latest"]);
  assert.equal(defaultPlan.length, 9);
  assert.equal(defaultPlan.at(-1).year, 2031);
  assert.equal(defaultPlan.at(-1).role, "report3");

  const maximumPlan = makePlan({ latestYear: 2025, baseYear: 2031 });
  assert.equal(maximumPlan.length, 12);
  assert.equal(maximumPlan.filter((row) => row.year > 2025).length, 9);
  assert.equal(maximumPlan.at(-1).role, "report3");
});

test("forecast drivers never overwrite the three manually supplied actual periods", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  historical[0].project.sales = 111.1;
  historical[1].project.sales = 122.2;
  historical[2].project.sales = 133.3;
  const plan = model.generatePlan(historical, { ...model.sampleDrivers, projectSalesGrowth: 0.4 }, model.DEFAULT_TIMELINE);
  assert.deepEqual(plan.slice(0, 3).map((row) => row.project.sales), [111.1, 122.2, 133.3]);
  assert.notEqual(plan[3].project.sales, 133.3);
});

test("project-period inputs are preserved and report years start from the manual base-year PL", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const projectBase = { ...model.defaultProjectBasePlan, sales: 137.5, cogs: 81.25, headcount: 77 };
  const projectInputs = model.createProjectPeriodInputs(model.DEFAULT_TIMELINE, projectBase);
  projectInputs[0].project.sales = 12.3;
  projectInputs[1].project.sales = 45.6;
  const plan = model.generatePlan(historical, { ...model.sampleDrivers, projectSalesGrowth: 0.4 }, model.DEFAULT_TIMELINE, projectInputs);
  const beforeBase = plan.filter((row) => row.year > model.DEFAULT_TIMELINE.latestYear && row.year < model.DEFAULT_TIMELINE.baseYear);
  const base = plan.find((row) => row.role === "base");
  const report1 = plan.find((row) => row.role === "report1");

  assert.deepEqual(beforeBase.map((row) => row.project.sales), [12.3, 45.6]);
  assert.deepEqual(base.project, projectBase);
  assert.equal(report1.project.sales, 192.5);
});

test("both round definitions are retained and sixth-round definitions are explicit", () => {
  assert.equal(model.metrics.length, 15);
  for (const metric of model.metrics) {
    assert.ok(metric.round3Formula.length > 0, `${metric.key} lacks round 3 definition`);
    assert.ok(metric.round6Formula.length > 0, `${metric.key} lacks round 6 definition`);
  }
  const companySales = model.metrics.find((metric) => metric.key === "companySalesCagr");
  assert.match(companySales.round3Formula, /基準年前年/);
  assert.match(companySales.round6Formula, /基準年→事業化報告3年目/);
});

test("round-six balance sheet metrics reconcile and use company EBITDA", () => {
  const row = model.sampleBalanceSheets.at(-1);
  const plan = makePlan();
  const latest = plan.find((item) => item.role === "latest");
  const company = model.total(latest.project, latest.other);
  const ebitda = model.operatingProfit(company) + company.depreciation;
  const derived = model.balanceSheetDerived(row, ebitda);

  assert.equal(derived.liabilitiesAndNetAssets, row.liabilities + row.netAssets);
  assert.equal(derived.equityRatio, row.netAssets / (row.liabilities + row.netAssets) * 100);
  assert.equal(derived.ebitdaDebtMultiple, (row.shortTermDebt + row.longTermDebt - row.cash) / ebitda);
});
