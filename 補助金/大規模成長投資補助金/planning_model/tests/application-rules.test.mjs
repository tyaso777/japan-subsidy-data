import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const compiled = (await build({
  absWorkingDir: projectDirectory,
  entryPoints: [path.join(projectDirectory, "app", "application-rules.ts")],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  target: "node22",
})).outputFiles[0].text;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const rules = commonJsModule.exports;

test("subsidy ceiling is truncated to integer thousand-yen precision", () => {
  assert.equal(rules.maximumSubsidyAmount(2_300_000_000), 766_666_000);
  assert.match(rules.driverRequirementLabel("subsidy", "general", 2_300_000_000), /現在上限7\.67億円/);

  const drivers = { investment: 2_300_000_000, subsidy: 766_666_000 };
  assert.equal(rules.driverConstraintFailure("subsidy", "general", drivers), null);
  assert.match(rules.driverConstraintFailure("subsidy", "general", { ...drivers, subsidy: 766_666_001 }), /7\.67億円以下/);
});

test("equipment-period project pay growth cannot fall below the statutory zero-percent floor", () => {
  assert.equal(rules.driverRequirementFloor("projectPayGrowthToBase"), 0);
  assert.deepEqual(
    rules.normalizeDriverRangeForRequirements("projectPayGrowthToBase", [-0.01, 0.0207]),
    [0, 0.0207],
  );
  assert.equal(rules.normalizeDriverValueForRequirements("projectPayGrowthToBase", -0.01), 0);
});

test("post-base project pay growth uses the statutory floor for each application category", () => {
  assert.equal(rules.driverRequirementFloor("projectPayGrowth", "general"), 0.05);
  assert.equal(rules.driverRequirementFloor("projectPayGrowth", "hundredBillion"), 0.045);
  assert.match(rules.driverRequirementLabel("projectPayGrowth", "general", 0), /制度下限5\.0%\/年/);
  assert.match(rules.driverRequirementLabel("projectPayGrowth", "hundredBillion", 0), /制度下限4\.5%\/年/);
  assert.equal(
    rules.driverRangeRequirementFailure("projectPayGrowth", "general", 0.049),
    "制度下限5.0%/年以上で入力してください",
  );
  assert.equal(rules.driverRangeRequirementFailure("projectPayGrowth", "general", 0.05), null);
  assert.equal(rules.driverRangeRequirementFailure("projectPayGrowth", "hundredBillion", 0.045), null);
});

test("latest-to-base pay growth explains the inflation examination risk separately from the statutory floor", () => {
  assert.match(rules.driverReviewNote("projectPayGrowthToBase"), /物価上昇率超を審査上重視/);
  assert.equal(rules.driverReviewNote("projectPayGrowth"), "");
  assert.equal(rules.driverReviewNote("projectSalesGrowth"), "");
});

test("entered inflation becomes the equipment-period project-pay lower floor", () => {
  assert.equal(rules.projectPayGrowthToBaseFloor(undefined), 0);
  assert.equal(rules.projectPayGrowthToBaseFloor(null), 0);
  assert.equal(rules.projectPayGrowthToBaseFloor(-1), 0);
  assert.equal(rules.projectPayGrowthToBaseFloor(2.5), 0.025);
  assert.equal(
    rules.driverRangeRequirementFailure("projectPayGrowthToBase", "general", 0.025, 2.5),
    null,
  );
  assert.equal(
    rules.driverRangeRequirementFailure("projectPayGrowthToBase", "general", 0.02, 2.5),
    "外部前提下限2.5%/年以上で入力してください",
  );
});

test("whole-company latest-to-base pay growth has a zero-percent statutory minimum", () => {
  assert.equal(rules.requiredMetricMinimums("general").companyPaySchedule, 0);
  assert.match(rules.metricRequirementLabel("companyPaySchedule", "general"), /0\.0%\/年以上/);

  const failures = rules.systemConstraintFailures(
    "general",
    { investment: 2_300_000, subsidy: 700_000 },
    { companyPaySchedule: -0.1, employeePayCagr: 5 },
  );
  assert.ok(failures.some((failure) => failure.includes("全社") && failure.includes("0.0%")));

  const valid = rules.systemConstraintFailures(
    "general",
    { investment: 2_300_000, subsidy: 700_000 },
    { companyPaySchedule: 0, employeePayCagr: 5 },
  );
  assert.ok(!valid.some((failure) => failure.includes("全社") && failure.includes("0.0%")));
});

test("pay growth can be compared with an entered inflation reference", () => {
  assert.deepEqual(rules.comparePayGrowthWithInflation(2.5, 2), {
    difference: 0.5,
    status: "above",
  });
  assert.deepEqual(rules.comparePayGrowthWithInflation(2, 2), {
    difference: 0,
    status: "equal",
  });
  assert.deepEqual(rules.comparePayGrowthWithInflation(1.8, 2), {
    difference: -0.2,
    status: "below",
  });
});

test("drivers without a statutory floor keep their entered values", () => {
  assert.equal(rules.driverRequirementFloor("projectSalesGrowthToBase"), undefined);
  assert.deepEqual(
    rules.normalizeDriverRangeForRequirements("projectSalesGrowthToBase", [-0.01, 0.05]),
    [-0.01, 0.05],
  );
});

test("forecast range ordering is rejected only when both bounds exist and lower exceeds upper", () => {
  assert.equal(rules.driverRangeOrderingFailure(null, 0.1), null);
  assert.equal(rules.driverRangeOrderingFailure(0.1, null), null);
  assert.equal(rules.driverRangeOrderingFailure(0.1, 0.1), null);
  assert.equal(rules.driverRangeOrderingFailure(0.1, 0.2), null);
  assert.equal(
    rules.driverRangeOrderingFailure(0.2, 0.1),
    "下限は上限以下にしてください",
  );
});
