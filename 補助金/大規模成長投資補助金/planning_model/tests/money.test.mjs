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

test("monetary amounts are stored as integer thousand-yen values", () => {
  assert.equal(money.INTERNAL_MONEY_UNIT, "千円");
  assert.equal(money.fromDisplayMoney(1.23456, "億円"), 123456);
  assert.equal(money.fromDisplayMoney(12.3456, "百万円"), 12346);
  assert.equal(money.fromDisplayMoney(12345.6, "千円"), 12346);
  assert.ok(Number.isInteger(money.fromDisplayMoney(1.23456, "億円")));
});

test("display conversion never mutates the canonical thousand-yen value", () => {
  const canonical = 123456;
  assert.equal(money.toDisplayMoney(canonical, "千円"), 123456);
  assert.equal(money.toDisplayMoney(canonical, "百万円"), 123.456);
  assert.equal(money.toDisplayMoney(canonical, "億円"), 1.23456);
  assert.equal(canonical, 123456);
});

test("legacy billion-yen proposal amounts migrate exactly once", () => {
  assert.equal(money.legacyOkuToInternalMoney(80), 8_000_000);
  assert.equal(money.legacyOkuToInternalMoney(0.01), 1_000);
  assert.equal(money.normalizeInternalMoney(34.855999999999995), 35);
});
