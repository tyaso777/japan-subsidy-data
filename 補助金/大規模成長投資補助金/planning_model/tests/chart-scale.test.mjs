import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.resolve(testDirectory, "../app/chart-scale.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const { niceChartScale } = commonJsModule.exports;

test("positive values away from zero use the data range instead of wasting half the chart", () => {
  const scale = niceChartScale([90, 100, 118, 130]);
  assert.deepEqual(scale.ticks, [80, 90, 100, 110, 120, 130, 140]);
  assert.equal(scale.min, 80);
  assert.equal(scale.max, 140);
});

test("small decimal values receive readable decimal ticks without forcing zero", () => {
  const scale = niceChartScale([0.1, 0.15, 0.2, 0.3]);
  assert.deepEqual(scale.ticks, [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
  assert.equal(scale.decimals, 2);
});

test("series close to zero keep zero as a meaningful baseline", () => {
  const scale = niceChartScale([0.01, 0.1, 0.3]);
  assert.equal(scale.min, 0);
  assert.ok(scale.ticks.length >= 4);
  assert.ok(scale.ticks.length <= 8);
});
