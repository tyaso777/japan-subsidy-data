import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const compiled = (await build({
  absWorkingDir: projectDirectory,
  entryPoints: ["./app/model.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  target: "node22",
})).outputFiles[0].text;
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
  assert.equal(Object.hasOwn(model.defaultDrivers, "usefulLife"), false);
  assert.equal(Object.hasOwn(model.driverBounds, "usefulLife"), false);
  assert.equal(model.sampleBasePlan.project.sales, 8_000_000_000);
  assert.equal(model.sampleDrivers.investment, 4_500_000_000);
});

test("previously implicit PL assumptions are explicit drivers", () => {
  assert.equal(model.sampleDrivers.projectCogsRateWhenSalesZero, 0.68);
  assert.equal(model.sampleDrivers.otherCogsRateWhenSalesZero, 0.68);
  assert.equal(model.sampleDrivers.projectEmployeeSalaryShare, 0.95);
  assert.equal(model.sampleDrivers.otherEmployeeSalaryShare, 0.95);
  assert.equal(model.sampleDrivers.projectOfficerCompensationShare, 0.90);
  assert.equal(model.sampleDrivers.otherOfficerCompensationShare, 0.90);
  assert.equal(model.sampleDrivers.projectCogsDepreciationShare, 0.25);
  assert.equal(model.sampleDrivers.otherCogsDepreciationShare, 0.20);
  assert.equal(model.sampleDrivers.projectResearchDevelopmentRate, 0.005);
  assert.equal(model.sampleDrivers.otherResearchDevelopmentRate, 0.004);
  assert.equal(model.sampleDrivers.projectNonOperatingRate, 0);
  assert.equal(model.sampleDrivers.otherNonOperatingRate, -0.005);
  assert.equal(model.sampleDrivers.projectExtraordinaryRate, 0);
  assert.equal(model.sampleDrivers.otherExtraordinaryRate, 0);
  assert.equal(model.sampleDrivers.effectiveTaxRate, 0.30);
  assert.equal(model.sampleDrivers.otherOfficerPayGrowthToBase, 0.04);
  assert.equal(model.sampleDrivers.otherOfficerPayGrowth, 0.045);
});

test("cogs-rate defaults use project history and fall back to a wider base-business range", () => {
  const fromProject = model.suggestCogsRateRange([0.66, 0.68, 0.70], [0.55, 0.56, 0.57]);
  assert.ok(Math.abs(fromProject.initial - 0.686) < 1e-9);
  assert.ok(Math.abs(fromProject.lower - 0.64) < 1e-9);
  assert.ok(Math.abs(fromProject.upper - 0.72) < 1e-9);

  const fromBase = model.suggestCogsRateRange([0, Number.NaN, 0], [0.60, 0.62, 0.64]);
  assert.ok(Math.abs(fromBase.initial - 0.626) < 1e-9);
  assert.ok(Math.abs(fromBase.lower - 0.55) < 1e-9);
  assert.ok(Math.abs(fromBase.upper - 0.69) < 1e-9);

  assert.deepEqual(model.suggestCogsRateRange([0, 0, 0], [0, 0, 0]), {
    initial: 0.68,
    lower: 0.58,
    upper: 0.78,
  });
});

test("post-base cogs-rate inputs affect forecasts even when historical sales exist", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsRateWhenSalesZero: 0.55,
    otherCogsRateWhenSalesZero: 0.60,
    projectCogsImprovementAfterBase: 0,
    otherCogsImprovement: 0,
  };
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE);
  const report1 = plan.find((row) => row.role === "report1");
  assert.ok(Math.abs(report1.project.cogs / report1.project.sales - 0.55) < 0.002);
  assert.ok(Math.abs(report1.other.cogs / report1.other.sales - 0.60) < 0.002);
});

test("accounting breakdowns and profit stages use explicit adjustment levels", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    otherPayGrowthToBase: 0,
    otherPayGrowth: 0,
    otherOfficerPayGrowthToBase: 0.08,
    otherOfficerPayGrowth: 0.08,
    projectEmployeeSalaryShare: 0.80,
    otherEmployeeSalaryShare: 0.75,
    projectOfficerCompensationShare: 0.70,
    otherOfficerCompensationShare: 0.65,
    projectCogsDepreciationShare: 0.30,
    otherCogsDepreciationShare: 0.40,
    projectResearchDevelopmentRate: 0.02,
    otherResearchDevelopmentRate: 0.03,
    projectNonOperatingRate: 0.01,
    otherNonOperatingRate: -0.02,
    projectExtraordinaryRate: -0.01,
    otherExtraordinaryRate: 0.02,
    effectiveTaxRate: 0.40,
  };
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE);
  const base = plan.find((row) => row.role === "base");
  const report3 = plan.find((row) => row.role === "report3");
  assert.ok(base.other.officerPay > historical.at(-1).other.officerPay);
  assert.ok(report3.other.officerPay > base.other.officerPay);
  assert.ok(Math.abs(model.employeeSalary(report3.project) / report3.project.employeePay - 0.80) < 0.002);
  assert.ok(Math.abs(model.employeeSalary(report3.other) / report3.other.employeePay - 0.75) < 0.002);
  assert.equal(model.officerCompensation(report3.project), Math.round(report3.project.officerPay * 0.70));
  assert.equal(model.officerCompensation(report3.other), Math.round(report3.other.officerPay * 0.65));
  assert.equal(model.cogsDepreciation(report3.project) + model.sgaDepreciation(report3.project), report3.project.depreciation);
  assert.equal(model.cogsDepreciation(report3.other) + model.sgaDepreciation(report3.other), report3.other.depreciation);
  const changedLegacyShares = model.generatePlan(historical, {
    ...drivers,
    projectCogsDepreciationShare: 0.99,
    otherCogsDepreciationShare: 0.01,
  }, model.DEFAULT_TIMELINE);
  const changedReport3 = changedLegacyShares.find((row) => row.role === "report3");
  assert.equal(changedReport3.project.depreciation, report3.project.depreciation);
  assert.equal(changedReport3.other.depreciation, report3.other.depreciation);
  assert.ok(Math.abs(model.cogsDepreciation(changedReport3.project) / changedReport3.project.depreciation - 0.99) < 0.002);
  assert.ok(Math.abs(model.cogsDepreciation(changedReport3.other) / changedReport3.other.depreciation - 0.01) < 0.002);
  assert.notEqual(model.cogsDepreciation(changedReport3.project), model.cogsDepreciation(report3.project));
  assert.notEqual(model.cogsDepreciation(changedReport3.other), model.cogsDepreciation(report3.other));
  assert.ok(Math.abs(model.researchDevelopment(report3.project) / report3.project.sales - 0.02) < 0.002);
  assert.ok(Math.abs(model.researchDevelopment(report3.other) / report3.other.sales - 0.03) < 0.002);
  assert.ok(Math.abs(model.nonOperatingProfitLoss(report3.project) / report3.project.sales - 0.01) < 0.002);
  assert.ok(Math.abs(model.nonOperatingProfitLoss(report3.other) / report3.other.sales + 0.02) < 0.002);
  assert.ok(Math.abs(model.extraordinaryProfitLoss(report3.project) / report3.project.sales + 0.01) < 0.002);
  assert.ok(Math.abs(model.extraordinaryProfitLoss(report3.other) / report3.other.sales - 0.02) < 0.002);
  const company = model.total(report3.project, report3.other);
  assert.ok(Math.abs(model.netIncome(company) / model.preTaxIncome(company) - 0.60) < 0.002);
});

test("future depreciation keeps the total authoritative and splits it by explicit adjustment levels", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const latest = historical.at(-1);
  latest.project.cogsDepreciation = 800_000;
  latest.project.sgaDepreciation = 400_000;
  latest.project.depreciation = 1_200_000;
  latest.other.cogsDepreciation = 1_000_000;
  latest.other.sgaDepreciation = 600_000;
  latest.other.depreciation = 1_600_000;

  const drivers = {
    ...model.sampleDrivers,
    projectCogsDepreciationShare: 0.35,
    otherCogsDepreciationShare: 0.60,
  };
  const periodInputs = model.createForecastProjectPeriodInputs(latest, drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, periodInputs);
  for (const row of plan.slice(3)) {
    assert.equal(
      model.cogsDepreciation(row.project) + model.sgaDepreciation(row.project),
      row.project.depreciation,
    );
    assert.equal(
      model.cogsDepreciation(row.other) + model.sgaDepreciation(row.other),
      row.other.depreciation,
    );
    assert.ok(Math.abs(model.cogsDepreciation(row.project) / row.project.depreciation - 0.35) < 0.002);
    assert.ok(Math.abs(model.cogsDepreciation(row.other) / row.other.depreciation - 0.60) < 0.002);
  }
});

test("project depreciation allocation defaults from the base-business historical ratio", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  historical[0].project.depreciation = 1_000;
  historical[0].project.cogsDepreciation = 900;
  historical[0].project.sgaDepreciation = 100;
  historical[0].other.depreciation = 2_000;
  historical[0].other.cogsDepreciation = 500;
  historical[0].other.sgaDepreciation = 1_500;

  const series = model.calculateHistoricalDriverSeries(historical, model.sampleBalanceSheets);
  assert.equal(series.projectCogsDepreciationShare.values[0], 0.25);
  assert.equal(series.otherCogsDepreciationShare.values[0], 0.25);
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

test("non-operating and extraordinary profit/loss reconcile the three profit levels", () => {
  const segment = {
    sales: 100,
    cogs: 60,
    employeePay: 10,
    officerPay: 2,
    depreciation: 3,
    cogsDepreciation: 0,
    sgaDepreciation: 3,
    otherSga: 5,
    headcount: 10,
    officerCount: 1,
    ordinaryIncome: 18,
    preTaxIncome: 16,
  };
  assert.equal(model.operatingProfit(segment), 20);
  assert.equal(model.nonOperatingProfitLoss(segment), -2);
  assert.equal(model.extraordinaryProfitLoss(segment), -2);
  assert.equal(model.operatingProfit(segment) + model.nonOperatingProfitLoss(segment), model.ordinaryIncome(segment));
  assert.equal(model.ordinaryIncome(segment) + model.extraordinaryProfitLoss(segment), model.preTaxIncome(segment));

  const withoutBelowOperatingProfit = { ...segment, ordinaryIncome: undefined, preTaxIncome: undefined };
  assert.equal(model.nonOperatingProfitLoss(withoutBelowOperatingProfit), 0);
  assert.equal(model.extraordinaryProfitLoss(withoutBelowOperatingProfit), 0);
});

test("absolute-amount target defaults scale with the underlying company", () => {
  const plan = makePlan();
  const baseTargets = model.calculateScaleDependentTargetDefaults(plan, model.defaultTargets);
  const doubledPlan = structuredClone(plan);
  for (const row of doubledPlan) {
    for (const segment of [row.project, row.other]) {
      for (const key of [
        "sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga",
        "employeeSalary", "employeeBonus", "officerCompensation", "officerBonus",
        "cogsDepreciation", "sgaDepreciation", "researchDevelopment",
        "ordinaryIncome", "preTaxIncome", "netIncome",
      ]) {
        if (segment[key] !== undefined) segment[key] *= 2;
      }
    }
  }
  const doubledTargets = model.calculateScaleDependentTargetDefaults(doubledPlan, model.defaultTargets);
  for (const key of ["companySalesIncrease", "projectSalesIncrease", "valueAddedIncrease", "employeePayIncrease"]) {
    assert.ok(baseTargets[key].value >= 0);
    assert.ok(baseTargets[key].max >= baseTargets[key].value);
    assert.ok(Math.abs(doubledTargets[key].value - baseTargets[key].value * 2) <= 1);
    assert.ok(Math.abs(doubledTargets[key].max - baseTargets[key].max * 2) <= 1);
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
  assert.equal(driverSeries.projectSgaRateEnd.mode, "change");
  assert.equal(driverSeries.otherSgaRateEnd.mode, "change");
  assert.deepEqual(model.driverBounds.projectSgaRateEnd, [0, 0.03]);
  assert.deepEqual(model.driverBounds.otherSgaRateEnd, [0, 0.03]);
  assert.deepEqual(driverSeries.investment.values, model.sampleBalanceSheets.map((row) => row.capex));
  assert.ok(model.defaultBalanceSheets.every((row) => row.capex === 0));
});

test("project-period forecast starts from latest actuals instead of the legacy 120 sample", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const latest = historical.at(-1);
  const inputs = model.createForecastProjectPeriodInputs(latest, model.sampleDrivers, model.DEFAULT_TIMELINE);

  assert.equal(latest.project.sales, 8_000_000_000);
  assert.equal(inputs[0].project.sales, 9_680_000_000);
  assert.notEqual(inputs[0].project.sales, 4_000_000_000);
  assert.equal(inputs.at(-1).year, model.DEFAULT_TIMELINE.baseYear);
});

test("project sales uses separate growth rates before and after the base year", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = { ...model.sampleDrivers, projectSalesGrowthToBase: 0.1, projectSalesGrowth: 0.3 };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const base = plan.find((row) => row.role === "base");
  const report1 = plan.find((row) => row.role === "report1");

  assert.equal(inputs[0].project.sales, 8_800_000_000);
  assert.equal(base.project.sales, 10_648_000_000);
  assert.equal(report1.project.sales, 13_842_400_000);
});

test("zero-sales project keeps first equipment-year and base-year sales anchors without inventing intermediate sales", () => {
  const zeroSalesLatest = {
    ...model.sampleBasePlan,
    project: { ...model.sampleBasePlan.project, sales: 0, cogs: 0 },
  };
  const historical = model.createHistoricalPlan(zeroSalesLatest, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectFirstYearSales: 2_000_000_000,
    projectBaseYearSales: 8_000_000_000,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);

  assert.deepEqual(inputs.map((row) => row.project.sales), [2_000_000_000, 0, 8_000_000_000]);
});

test("sales anchors do not override a project with latest actual sales", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectSalesGrowthToBase: 0.1,
    projectFirstYearSales: 2_000_000_000,
    projectBaseYearSales: 8_000_000_000,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);

  assert.deepEqual(inputs.map((row) => row.project.sales), [8_800_000_000, 9_680_000_000, 10_648_000_000]);
});

test("zero first-year sales does not invent intermediate project sales", () => {
  const zeroSalesLatest = {
    ...model.sampleBasePlan,
    project: { ...model.sampleBasePlan.project, sales: 0, cogs: 0 },
  };
  const historical = model.createHistoricalPlan(zeroSalesLatest, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectFirstYearSales: 0,
    projectBaseYearSales: 8_000_000_000,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);

  assert.deepEqual(inputs.map((row) => row.project.sales), [0, 0, 8_000_000_000]);
});

test("other-business forecast uses separate assumptions before and after the base year", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    otherSalesGrowthToBase: 0.1,
    otherSalesGrowth: 0.2,
    otherCogsRateToBase: 0.68,
    otherCogsImprovementToBase: 0.03,
    otherCogsRateWhenSalesZero: 0.65,
    otherCogsImprovement: 0.01,
  };
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE);
  const latest = plan.find((row) => row.role === "latest");
  const base = plan.find((row) => row.role === "base");
  const report1 = plan.find((row) => row.role === "report1");
  const report3 = plan.find((row) => row.role === "report3");

  assert.equal(base.other.sales, Number((latest.other.sales * 1.1 ** 3).toFixed(2)));
  assert.equal(report1.other.sales, Number((base.other.sales * 1.2).toFixed(2)));
  assert.ok(Math.abs(base.other.cogs / base.other.sales - 0.62) < 0.001);
  assert.ok(Math.abs(report1.other.cogs / report1.other.sales - 0.65) < 0.001);
  assert.ok(Math.abs(report3.other.cogs / report3.other.sales - 0.63) < 0.001);
});

test("sample other-business post-base assumptions include a modest synergy lift", () => {
  assert.ok(Math.abs(model.sampleDrivers.otherSalesGrowth - model.sampleDrivers.otherSalesGrowthToBase - 0.02) < 1e-9);
  assert.ok(Math.abs(model.sampleDrivers.otherCogsImprovement - model.sampleDrivers.otherCogsImprovementToBase - 0.005) < 1e-9);
  assert.ok(Math.abs(model.sampleDrivers.otherPayGrowth - model.sampleDrivers.otherPayGrowthToBase - 0.005) < 1e-9);
  assert.ok(Math.abs(model.sampleDrivers.otherHeadcountGrowth - model.sampleDrivers.otherHeadcountGrowthToBase - 0.005) < 1e-9);
});

test("forecast monetary PL values are stored as integer yen", () => {
  const plan = makePlan();
  const monetaryFields = ["sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga"];
  for (const row of plan.slice(3)) {
    for (const segment of [row.project, row.other]) {
      for (const field of monetaryFields) {
        assert.ok(Number.isInteger(segment[field]), `${row.year} ${field}=${segment[field]}`);
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

test("round-six payroll and depreciation breakdowns reconcile to their calculated totals", () => {
  const segment = {
    sales: 100,
    cogs: 60,
    employeePay: 12,
    employeeSalary: 10,
    employeeBonus: 2,
    officerPay: 3,
    officerCompensation: 2.5,
    officerBonus: 0.5,
    depreciation: 5,
    cogsDepreciation: 2,
    sgaDepreciation: 3,
    researchDevelopment: 1,
    otherSga: 4,
    headcount: 20,
    officerCount: 2,
  };
  assert.equal(model.employeeSalary(segment) + model.employeeBonus(segment), segment.employeePay);
  assert.equal(model.officerCompensation(segment) + model.officerBonus(segment), segment.officerPay);
  assert.equal(model.cogsDepreciation(segment) + model.sgaDepreciation(segment), segment.depreciation);
  assert.equal(model.operatingProfit(segment), 17);
  assert.equal(model.valueAdded(segment), 37);
});

test("round-six company income inputs are preserved and future profits use explicit driver rates", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  historical.forEach((row, index) => {
    const company = model.total(row.project, row.other);
    const companyOrdinary = model.operatingProfit(company) - company.sales * 0.01;
    const companyPreTax = companyOrdinary - company.sales * 0.005;
    const companyNet = companyPreTax * 0.7;
    row.other.ordinaryIncome = companyOrdinary - model.ordinaryIncome(row.project);
    row.other.preTaxIncome = companyPreTax - model.preTaxIncome(row.project);
    row.other.netIncome = companyNet - model.netIncome(row.project);
    row.other.headcount = 100 + index * 5 - row.project.headcount;
    row.other.officerCount = 4 - row.project.officerCount;
  });
  const drivers = {
    ...model.sampleDrivers,
    projectNonOperatingRate: -0.01,
    otherNonOperatingRate: -0.01,
    projectExtraordinaryRate: -0.005,
    otherExtraordinaryRate: -0.005,
    effectiveTaxRate: 0.30,
  };
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE);
  const latest = model.total(plan[2].project, plan[2].other);
  assert.equal(model.ordinaryIncome(latest), model.ordinaryIncome(historical[2].project) + historical[2].other.ordinaryIncome);
  assert.equal(model.preTaxIncome(latest), model.preTaxIncome(historical[2].project) + historical[2].other.preTaxIncome);
  assert.equal(model.netIncome(latest), model.netIncome(historical[2].project) + historical[2].other.netIncome);
  assert.equal(latest.headcount, 110);
  assert.equal(latest.officerCount, 4);

  const future = model.total(plan[3].project, plan[3].other);
  const expectedOrdinary = model.operatingProfit(future) - future.sales * 0.01;
  const expectedPreTax = expectedOrdinary - future.sales * 0.005;
  assert.ok(Math.abs(model.ordinaryIncome(future) - expectedOrdinary) <= 1);
  assert.ok(Math.abs(model.preTaxIncome(future) - expectedPreTax) <= 1);
  assert.ok(Math.abs(model.netIncome(future) / model.preTaxIncome(future) - 0.7) < 0.002);
});

test("post-base cogs rate is the first-year level and annual improvement is applied thereafter", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsRateWhenSalesZero: 0.70,
    projectCogsImprovementAfterBase: 0.03,
    otherCogsRateWhenSalesZero: 0.67,
    otherCogsImprovement: 0.02,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const report1 = plan.find((row) => row.role === "report1");
  const report2 = plan.find((row) => row.role === "report2");
  const report3 = plan.find((row) => row.role === "report3");

  assert.ok(Math.abs(report1.project.cogs / report1.project.sales - 0.70) < 1e-4);
  assert.ok(Math.abs(report2.project.cogs / report2.project.sales - 0.67) < 1e-4);
  assert.ok(Math.abs(report3.project.cogs / report3.project.sales - 0.64) < 1e-4);
  assert.ok(Math.abs(report1.other.cogs / report1.other.sales - 0.67) < 1e-4);
  assert.ok(Math.abs(report2.other.cogs / report2.other.sales - 0.65) < 1e-4);
  assert.ok(Math.abs(report3.other.cogs / report3.other.sales - 0.63) < 1e-4);
});

test("equipment-period cogs rates are first-year levels and improvements are annual", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsRateToBase: 0.66,
    projectCogsImprovementToBase: 0.02,
    otherCogsRateToBase: 0.64,
    otherCogsImprovementToBase: 0.01,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const equipment1 = plan.find((row) => row.year === model.DEFAULT_TIMELINE.latestYear + 1);
  const equipment2 = plan.find((row) => row.year === model.DEFAULT_TIMELINE.latestYear + 2);
  const base = plan.find((row) => row.role === "base");

  assert.ok(Math.abs(equipment1.project.cogs / equipment1.project.sales - 0.66) < 1e-4);
  assert.ok(Math.abs(equipment2.project.cogs / equipment2.project.sales - 0.64) < 1e-4);
  assert.ok(Math.abs(base.project.cogs / base.project.sales - 0.62) < 1e-4);
  assert.ok(Math.abs(equipment1.other.cogs / equipment1.other.sales - 0.64) < 1e-4);
  assert.ok(Math.abs(equipment2.other.cogs / equipment2.other.sales - 0.63) < 1e-4);
  assert.ok(Math.abs(base.other.cogs / base.other.sales - 0.62) < 1e-4);
});

test("cogs transition validation warns when the post-base first-year rate worsens", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsRateToBase: 0.68,
    projectCogsImprovementToBase: 0.02,
    projectCogsRateWhenSalesZero: 0.70,
    projectCogsImprovementAfterBase: 0.01,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const validations = model.validatePlan(plan, drivers);

  assert.ok(validations.some((item) => item.title === "補助事業の原価率が期間境界で悪化"));
});

test("cogs transition validation warns when annual improvement itself is excessive", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsRateToBase: 0.68,
    projectCogsImprovementToBase: 0.10,
    projectCogsRateWhenSalesZero: 0.68,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const validations = model.validatePlan(plan, drivers);

  assert.ok(validations.some((item) => (
    item.title === "補助事業の設備導入期間の原価率改善が過大"
    && item.detail.includes("10.00pt/年")
    && item.detail.includes("2.00pt/年")
  )));
});

test("cogs transition validation detects a reset even when the project has no equipment-period sales", () => {
  const historical = model.createHistoricalPlan({
    ...model.sampleBasePlan,
    project: {
      ...model.sampleBasePlan.project,
      sales: 0,
      cogs: 0,
    },
  }, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectFirstYearSales: 0,
    projectBaseYearSales: 0,
    projectCogsRateToBase: 0.68,
    projectCogsImprovementToBase: 0.10,
    projectCogsRateWhenSalesZero: 0.68,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const validations = model.validatePlan(plan, drivers);

  assert.ok(validations.some((item) => (
    item.title === "補助事業の原価率が期間境界で悪化"
    && item.detail.includes("設備導入期間末")
  )));
});

test("cogs transition validation warns about an excessive boundary improvement", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsRateToBase: 0.68,
    projectCogsImprovementToBase: 0.01,
    projectCogsRateWhenSalesZero: 0.55,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const validations = model.validatePlan(plan, drivers);

  assert.ok(validations.some((item) => item.title === "補助事業の原価率が期間境界で急改善"));
});

test("cogs transition validation reports annual improvements that make a rate negative", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = {
    ...model.sampleDrivers,
    projectCogsRateWhenSalesZero: 0.04,
    projectCogsImprovementAfterBase: 0.03,
  };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const validations = model.validatePlan(plan, drivers);

  assert.ok(validations.some((item) => item.title === "補助事業の原価率が0%を下回る設定"));
});

test("validation does not apply industry-agnostic provisional ranges", () => {
  const plan = makePlan();
  for (const row of plan) {
    for (const segmentKey of ["project", "other"]) {
      const segment = row[segmentKey];
      segment.cogs = segment.sales * 0.20;
      segment.otherSga = segment.sales * 0.35;
      segment.employeePay = segment.sales * 0.15;
      segment.headcount = 1;
    }
  }
  plan[3].project.sales = plan[2].project.sales * 2;
  plan[3].project.employeePay = plan[2].project.employeePay * 2;
  plan[3].project.headcount = plan[2].project.headcount;

  const validations = model.validatePlan(plan, model.sampleDrivers);

  assert.equal(validations.some((item) => item.title.includes("原価率が暫定レンジ外")), false);
  assert.equal(validations.some((item) => item.title.includes("その他販管費率が暫定レンジ外")), false);
  assert.equal(validations.some((item) => item.title.includes("営業利益率を要確認")), false);
  assert.equal(validations.some((item) => item.title.includes("売上の年度変動が大きい")), false);
  assert.equal(validations.some((item) => item.title.includes("給与支給総額の年度変動を要確認")), false);
});

test("equipment-period other SGA assumption is an improvement point", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = { ...model.sampleDrivers, projectSgaImprovementToBase: 0.03 };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const base = inputs.at(-1).project;

  assert.ok(Math.abs(base.otherSga / base.sales - 0.095) < 1e-4);
});

test("post-base other SGA assumption is an improvement point rather than a terminal rate", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const drivers = { ...model.sampleDrivers, projectSgaRateEnd: 0.02, otherSgaRateEnd: 0.01 };
  const inputs = model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE);
  const plan = model.generatePlan(historical, drivers, model.DEFAULT_TIMELINE, inputs);
  const base = plan.find((row) => row.role === "base");
  const report3 = plan.find((row) => row.role === "report3");
  const baseProjectRate = base.project.otherSga / base.project.sales;
  const report3ProjectRate = report3.project.otherSga / report3.project.sales;
  const baseOtherRate = base.other.otherSga / base.other.sales;
  const report3OtherRate = report3.other.otherSga / report3.other.sales;

  assert.ok(Math.abs((baseProjectRate - report3ProjectRate) - 0.02) < 1e-4);
  assert.ok(Math.abs((baseOtherRate - report3OtherRate) - 0.01) < 1e-4);
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

test("hard-target repair crosses rounded PL plateaus and exhausts the useful pay-growth range", () => {
  const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
  const bounds = structuredClone(model.driverBounds);
  bounds.projectPayGrowthToBase = [0.019325330501846927, 0.020735994183189166];
  bounds.otherPayGrowthToBase = [0.019139457023717443, 0.020553459914763095];
  const initial = {
    ...model.sampleDrivers,
    projectPayGrowthToBase: 0.020030662342518046,
    otherPayGrowthToBase: 0.01984645846924027,
  };
  const targets = structuredClone(model.defaultTargets);
  for (const target of Object.values(targets)) target.policy = "monitor";
  targets.companyPaySchedule = { value: 3.5, policy: "hard", weight: 1 };
  const periodInputs = model.createForecastProjectPeriodInputs(historical.at(-1), initial, model.DEFAULT_TIMELINE);
  const referencePlan = model.generatePlan(historical, initial, model.DEFAULT_TIMELINE, periodInputs);

  const result = model.optimizeDrivers(
    initial,
    historical,
    model.DEFAULT_TIMELINE,
    targets,
    periodInputs,
    referencePlan,
    bounds,
    true,
  );
  const metricValue = (drivers) => model.calculateMetrics(
    model.generatePlan(
      historical,
      drivers,
      model.DEFAULT_TIMELINE,
      model.createForecastProjectPeriodInputs(historical.at(-1), drivers, model.DEFAULT_TIMELINE),
    ),
    drivers,
  ).companyPaySchedule;
  const upperDrivers = {
    ...result.drivers,
    projectPayGrowthToBase: bounds.projectPayGrowthToBase[1],
    otherPayGrowthToBase: bounds.otherPayGrowthToBase[1],
  };

  assert.equal(result.hardFeasible, false);
  assert.equal(metricValue(result.drivers), metricValue(upperDrivers));
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
  const projectBase = { ...model.defaultProjectBasePlan, sales: 13_750_000_000, cogs: 8_125_000_000, headcount: 77 };
  const projectInputs = model.createProjectPeriodInputs(model.DEFAULT_TIMELINE, projectBase);
  projectInputs[0].project.sales = 1_230_000_000;
  projectInputs[1].project.sales = 4_560_000_000;
  const plan = model.generatePlan(historical, { ...model.sampleDrivers, projectSalesGrowth: 0.4 }, model.DEFAULT_TIMELINE, projectInputs);
  const beforeBase = plan.filter((row) => row.year > model.DEFAULT_TIMELINE.latestYear && row.year < model.DEFAULT_TIMELINE.baseYear);
  const base = plan.find((row) => row.role === "base");
  const report1 = plan.find((row) => row.role === "report1");

  assert.deepEqual(beforeBase.map((row) => row.project.sales), [1_230_000_000, 4_560_000_000]);
  for (const key of ["sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga", "headcount", "officerCount"]) {
    assert.equal(base.project[key], projectBase[key]);
  }
  const expectedCogsDepreciation = Math.round(projectBase.depreciation * model.sampleDrivers.projectCogsDepreciationShare * 1e6) / 1e6;
  assert.equal(model.cogsDepreciation(base.project), expectedCogsDepreciation);
  assert.equal(model.sgaDepreciation(base.project), projectBase.depreciation - expectedCogsDepreciation);
  assert.equal(model.cogsDepreciation(base.project) + model.sgaDepreciation(base.project), base.project.depreciation);
  assert.equal(report1.project.sales, 19_250_000_000);
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
