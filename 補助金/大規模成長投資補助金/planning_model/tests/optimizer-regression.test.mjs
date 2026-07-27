import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");

async function compile(entryPoint) {
  const compiled = (await build({
    absWorkingDir: projectDirectory,
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    target: "node22",
  })).outputFiles[0].text;
  const commonJsModule = { exports: {} };
  new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
  return commonJsModule.exports;
}

const model = await compile("./app/model.ts");
const rules = await compile("./app/application-rules.ts");

const optimizableKeys = [
  "projectSalesGrowthToBase",
  "projectCogsRateToBase",
  "projectCogsImprovementToBase",
  "projectPayGrowthToBase",
  "projectHeadcountGrowthToBase",
  "projectSgaImprovementToBase",
  "projectOfficerPayGrowthToBase",
  "otherSalesGrowthToBase",
  "otherCogsRateToBase",
  "otherCogsImprovementToBase",
  "otherPayGrowthToBase",
  "otherHeadcountGrowthToBase",
  "otherSgaImprovementToBase",
  "projectSalesGrowth",
  "otherSalesGrowth",
  "projectCogsRateWhenSalesZero",
  "otherCogsRateWhenSalesZero",
  "projectCogsImprovementAfterBase",
  "otherCogsImprovement",
  "projectPayGrowth",
  "otherPayGrowth",
  "projectHeadcountGrowth",
  "otherHeadcountGrowth",
  "projectSgaRateEnd",
  "otherSgaRateEnd",
  "projectOfficerPayGrowth",
];

const fixedDriverKeys = Object.keys(model.sampleDrivers)
  .filter((key) => !optimizableKeys.includes(key));

const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);

function monitorTargets() {
  return Object.fromEntries(
    Object.entries(model.defaultTargets)
      .map(([key, target]) => [key, { ...target, policy: "monitor" }]),
  );
}

function boundsWithOnly(key, range) {
  const bounds = structuredClone(model.driverBounds);
  for (const optimizableKey of optimizableKeys) {
    const value = model.sampleDrivers[optimizableKey];
    bounds[optimizableKey] = [value, value];
  }
  bounds[key] = range;
  return bounds;
}

function calculateActual(drivers, planTransform) {
  const inputs = model.createForecastProjectPeriodInputs(
    historical.at(-1),
    drivers,
    model.DEFAULT_TIMELINE,
  );
  const generated = model.generatePlan(
    historical,
    drivers,
    model.DEFAULT_TIMELINE,
    inputs,
  );
  const plan = planTransform ? planTransform(generated) : generated;
  return model.calculateMetrics(plan, drivers);
}

function scaleSegment(segment, factor) {
  const result = { ...segment };
  for (const key of [
    "sales",
    "cogs",
    "employeePay",
    "officerPay",
    "depreciation",
    "otherSga",
    "employeeSalary",
    "employeeBonus",
    "officerCompensation",
    "officerBonus",
    "cogsDepreciation",
    "sgaDepreciation",
    "researchDevelopment",
    "ordinaryProfit",
    "preTaxIncome",
    "netIncome",
  ]) {
    if (Number.isFinite(result[key])) result[key] *= factor;
  }
  return result;
}

const planTransforms = {
  company(plan) {
    return plan.map((row) => (
      row.role === "historical"
        ? row
        : {
            ...row,
            project: scaleSegment(row.project, 1.001),
            other: scaleSegment(row.other, 1.001),
          }
    ));
  },
  baseBusiness(plan) {
    return plan.map((row) => (
      row.role === "historical"
        ? row
        : { ...row, other: scaleSegment(row.other, 1.001) }
    ));
  },
};

const scenarioVariants = [
  ["projectSalesGrowthToBase", [-0.02, 0.3]],
  ["projectCogsRateToBase", [0.55, 0.8]],
  ["projectCogsImprovementToBase", [0, 0.04]],
  ["projectPayGrowthToBase", [0, 0.08]],
  ["projectHeadcountGrowthToBase", [-0.03, 0.12]],
  ["projectSgaImprovementToBase", [0, 0.04]],
  ["projectOfficerPayGrowthToBase", [0, 0.08]],
  ["otherSalesGrowthToBase", [-0.03, 0.15]],
  ["otherCogsRateToBase", [0.55, 0.8]],
  ["otherPayGrowthToBase", [0, 0.08]],
  ["projectSalesGrowth", [0.05, 0.4]],
  ["otherSalesGrowth", [-0.02, 0.15]],
  ["projectCogsImprovementAfterBase", [0, 0.04]],
  ["projectPayGrowth", [0.05, 0.1]],
  ["projectOfficerPayGrowth", [0, 0.1]],
];

test("30 optimization scenarios stay deterministic, bounded, and preserve fixed drivers in both input modes", () => {
  const results = [];
  for (const [mode, planTransform] of Object.entries(planTransforms)) {
    for (const [key, range] of scenarioVariants) {
      const bounds = boundsWithOnly(key, range);
      const result = model.optimizeDrivers(
        model.sampleDrivers,
        historical,
        model.DEFAULT_TIMELINE,
        monitorTargets(),
        model.defaultProjectBasePlan,
        undefined,
        bounds,
        true,
        planTransform,
      );

      for (const optimizableKey of optimizableKeys) {
        const [lower, upper] = bounds[optimizableKey];
        const value = result.drivers[optimizableKey];
        assert.ok(
          value >= lower - 1e-12 && value <= upper + 1e-12,
          `${mode}/${key}: ${optimizableKey}=${value} was outside [${lower}, ${upper}]`,
        );
      }
      for (const fixedKey of fixedDriverKeys) {
        assert.equal(
          result.drivers[fixedKey],
          model.sampleDrivers[fixedKey],
          `${mode}/${key}: fixed driver ${fixedKey} changed`,
        );
      }
      assert.ok(Number.isFinite(result.score), `${mode}/${key}: score was not finite`);
      results.push({ mode, key, drivers: result.drivers });
    }
  }

  assert.equal(results.length, 30);

  for (const mode of Object.keys(planTransforms)) {
    const representative = results.find((result) => result.mode === mode);
    const range = scenarioVariants.find(([key]) => key === representative.key)[1];
    const repeated = model.optimizeDrivers(
      model.sampleDrivers,
      historical,
      model.DEFAULT_TIMELINE,
      monitorTargets(),
      model.defaultProjectBasePlan,
      undefined,
      boundsWithOnly(representative.key, range),
      true,
      planTransforms[mode],
    );
    assert.deepEqual(
      repeated.drivers,
      representative.drivers,
      `${mode}: identical inputs did not produce identical drivers`,
    );
  }
});

test("current statutory and inflation floors are explicit regression requirements", () => {
  assert.equal(rules.projectPayGrowthToBaseFloor(2.5), 0.025);
  assert.notEqual(
    rules.driverRangeRequirementFailure("projectPayGrowthToBase", "general", 0.0249, 2.5),
    null,
  );
  assert.equal(
    rules.driverRangeRequirementFailure("projectPayGrowthToBase", "general", 0.025, 2.5),
    null,
  );
  assert.notEqual(
    rules.driverRangeRequirementFailure("projectPayGrowth", "general", 0.0499),
    null,
  );
  assert.equal(
    rules.driverRangeRequirementFailure("projectPayGrowth", "general", 0.05),
    null,
  );
  assert.notEqual(
    rules.driverRangeRequirementFailure("projectPayGrowth", "hundredBillion", 0.0449),
    null,
  );
  assert.equal(
    rules.driverRangeRequirementFailure("projectPayGrowth", "hundredBillion", 0.045),
    null,
  );
  assert.deepEqual(rules.requiredMetricMinimums("general"), {
    companyPaySchedule: 0,
    employeePayCagr: 5,
  });
  assert.deepEqual(rules.requiredMetricMinimums("hundredBillion"), {
    companyPaySchedule: 0,
    employeePayCagr: 4.5,
  });
});

test("an impossible hard target remains infeasible and is not reported as achieved", () => {
  const targets = monitorTargets();
  targets.companySalesCagr = {
    value: 100,
    max: 101,
    policy: "hard",
    weight: 1,
  };
  const result = model.optimizeDrivers(
    model.sampleDrivers,
    historical,
    model.DEFAULT_TIMELINE,
    targets,
    model.defaultProjectBasePlan,
    undefined,
    boundsWithOnly("projectSalesGrowth", [
      model.sampleDrivers.projectSalesGrowth,
      model.sampleDrivers.projectSalesGrowth,
    ]),
    true,
  );

  assert.equal(result.hardFeasible, false);
  assert.ok(result.hardViolation > 0);
});

test("a suggested sales-growth range expansion improves the hard target without changing pay growth", () => {
  const targets = monitorTargets();
  targets.companySalesCagr = {
    value: 25,
    max: 35,
    policy: "hard",
    weight: 1,
  };
  const narrowBounds = boundsWithOnly("projectSalesGrowth", [0.01, 0.01]);
  const expandedBounds = boundsWithOnly("projectSalesGrowth", [0.01, 0.5]);

  const before = model.optimizeDrivers(
    { ...model.sampleDrivers, projectSalesGrowth: 0.01 },
    historical,
    model.DEFAULT_TIMELINE,
    targets,
    model.defaultProjectBasePlan,
    undefined,
    narrowBounds,
    true,
  );
  const after = model.optimizeDrivers(
    { ...model.sampleDrivers, projectSalesGrowth: 0.01 },
    historical,
    model.DEFAULT_TIMELINE,
    targets,
    model.defaultProjectBasePlan,
    undefined,
    expandedBounds,
    true,
  );
  const beforeActual = calculateActual(before.drivers);
  const afterActual = calculateActual(after.drivers);

  assert.ok(
    after.hardViolation < before.hardViolation,
    `range expansion did not improve hard violation: ${before.hardViolation} -> ${after.hardViolation}`,
  );
  assert.equal(
    after.hardFeasible,
    true,
    `suggested range expansion must actually satisfy the hard target (remaining violation: ${after.hardViolation})`,
  );
  assert.ok(
    afterActual.companySalesCagr > beforeActual.companySalesCagr,
    "range expansion did not improve company sales CAGR",
  );
  assert.ok(
    Math.abs(afterActual.employeePayCagr - beforeActual.employeePayCagr) < 1e-9,
    "sales-only correction unexpectedly changed employee pay CAGR",
  );
});
