import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const compile = async (relativePath) => {
  const source = await readFile(path.join(projectDirectory, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
  return commonJsModule.exports;
};

const money = await compile("app/money.ts");

test("monetary amounts are stored as integer yen values", () => {
  assert.equal(money.INTERNAL_MONEY_UNIT, "円");
  assert.equal(money.fromDisplayMoney(1.23456, "億円"), 123_456_000);
  assert.equal(money.fromDisplayMoney(12.3456, "百万円"), 12_345_600);
  assert.equal(money.fromDisplayMoney(12345.6, "千円"), 12_345_600);
  assert.ok(Number.isInteger(money.fromDisplayMoney(1.23456, "億円")));
});

test("display conversion never mutates the canonical yen value", () => {
  const canonical = 123_456_000;
  assert.equal(money.toDisplayMoney(canonical, "千円"), 123456);
  assert.equal(money.toDisplayMoney(canonical, "百万円"), 123.456);
  assert.equal(money.toDisplayMoney(canonical, "億円"), 1.23456);
  assert.equal(canonical, 123_456_000);
});

test("displayed money uses at most two decimals without trailing zeroes", () => {
  assert.equal(money.formatDisplayMoney(4_364_800_000, "百万円"), "4,364.8");
  assert.equal(money.formatDisplayMoney(1_228_817_000, "百万円"), "1,228.82");
  assert.equal(money.formatDisplayMoney(4_364_800_000, "億円"), "43.65");
  assert.equal(money.formatDisplayMoney(4_800_000_000, "億円"), "48");
  assert.equal(money.formatDisplayMoney(4_800_000_000, "千円"), "4,800,000");
});

test("focused money inputs reveal the exact canonical yen value", () => {
  assert.equal(money.formatEditableMoney(1_228_817_345, "百万円"), "1,228.817345");
  assert.equal(money.formatEditableMoney(1_228_817_345, "億円"), "12.28817345");
  assert.equal(money.formatEditableMoney(1_228_817_345, "千円"), "1,228,817.345");
});

test("billion-yen constants become canonical integer yen", () => {
  assert.equal(money.okuToInternalMoney(80), 8_000_000_000);
  assert.equal(money.okuToInternalMoney(0.01), 1_000_000);
  assert.equal(money.normalizeInternalMoney(34.855999999999995), 35);
});

test("money inputs use grouped thousands without losing editable decimals", () => {
  assert.equal(money.formatNumericInput(13_640_000, 0), "13,640,000");
  assert.equal(money.formatNumericInput(1234.5678, 3), "1,234.568");
  assert.equal(money.formatNumericInput("1234."), "1,234.");
  assert.equal(money.formatNumericInput("-1234.50"), "-1,234.50");
});

test("grouped money input text parses back to a number", () => {
  assert.equal(money.parseNumericInput("13,640,000"), 13_640_000);
  assert.equal(money.parseNumericInput("-1,234.50"), -1234.5);
  assert.equal(money.parseNumericInput(""), null);
  assert.equal(money.parseNumericInput("-"), null);
});

test("unit switching keeps the exact yen amount through display, focus, and editing", () => {
  let canonical = money.fromDisplayMoney(
    money.parseNumericInput("1,228,817.345"),
    "千円",
  );

  assert.equal(canonical, 1_228_817_345);
  assert.equal(money.formatDisplayMoney(canonical, "千円"), "1,228,817");
  assert.equal(money.formatEditableMoney(canonical, "千円"), "1,228,817.345");

  assert.equal(money.formatDisplayMoney(canonical, "百万円"), "1,228.82");
  assert.equal(money.formatEditableMoney(canonical, "百万円"), "1,228.817345");

  assert.equal(money.formatDisplayMoney(canonical, "億円"), "12.29");
  assert.equal(money.formatEditableMoney(canonical, "億円"), "12.28817345");

  canonical = money.fromDisplayMoney(
    money.parseNumericInput("12.28918345"),
    "億円",
  );

  assert.equal(canonical, 1_228_918_345);
  assert.equal(money.formatDisplayMoney(canonical, "百万円"), "1,228.92");
  assert.equal(money.formatEditableMoney(canonical, "百万円"), "1,228.918345");
  assert.equal(money.formatDisplayMoney(canonical, "千円"), "1,228,918");
  assert.equal(money.formatEditableMoney(canonical, "千円"), "1,228,918.345");
});
