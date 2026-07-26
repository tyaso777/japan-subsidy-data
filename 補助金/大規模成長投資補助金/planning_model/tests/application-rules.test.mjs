import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const compiled = (await build({
  absWorkingDir: projectDirectory,
  entryPoints: ["./app/application-rules.ts"],
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
  assert.equal(rules.maximumSubsidyAmount(2_300_000), 766_666);
  assert.match(rules.driverRequirementLabel("subsidy", "general", 2_300_000), /現在上限7\.67億円/);

  const drivers = { investment: 2_300_000, subsidy: 766_666 };
  assert.equal(rules.driverConstraintFailure("subsidy", "general", drivers), null);
  assert.match(rules.driverConstraintFailure("subsidy", "general", { ...drivers, subsidy: 766_667 }), /7\.67億円以下/);
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

test("post-base project pay growth explains the examination risk separately from the statutory floor", () => {
  assert.equal(
    rules.driverReviewNote("projectPayGrowth"),
    "審査項目。最低でも物価上昇率を上回る程度でないと、審査上大幅に不利",
  );
  assert.equal(rules.driverReviewNote("projectPayGrowthToBase"), "");
  assert.equal(rules.driverReviewNote("projectSalesGrowth"), "");
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
