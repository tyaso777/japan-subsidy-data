import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(projectDirectory, "app", "metric-groups.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const groups = commonJsModule.exports;

test("a metric group activates only the selected optimization basis", () => {
  const bases = structuredClone(groups.defaultMetricGroupBases);
  assert.equal(groups.metricBasisRole("companySalesCagr", bases), "basis");
  assert.equal(groups.metricBasisRole("companySalesIncrease", bases), "result");

  bases.companySales = "amount";
  assert.equal(groups.metricBasisRole("companySalesCagr", bases), "result");
  assert.equal(groups.metricBasisRole("companySalesIncrease", bases), "basis");

  bases.companySales = "both";
  assert.equal(groups.metricBasisRole("companySalesCagr", bases), "basis");
  assert.equal(groups.metricBasisRole("companySalesIncrease", bases), "basis");
  assert.equal(groups.metricBasisRole("projectSalesShare", bases), "independent");
});
