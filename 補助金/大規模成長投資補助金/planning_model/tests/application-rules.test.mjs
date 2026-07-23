import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.resolve(testDirectory, "../app/application-rules.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const rules = commonJsModule.exports;

test("subsidy ceiling is truncated to the entered two-decimal monetary precision", () => {
  assert.equal(rules.maximumSubsidyAmount(23), 7.66);
  assert.match(rules.driverRequirementLabel("subsidy", "general", 23), /現在上限7\.66億円/);

  const drivers = { investment: 23, subsidy: 7.66 };
  assert.equal(rules.driverConstraintFailure("subsidy", "general", drivers), null);
  assert.match(rules.driverConstraintFailure("subsidy", "general", { ...drivers, subsidy: 7.67 }), /7\.66億円以下/);
});
