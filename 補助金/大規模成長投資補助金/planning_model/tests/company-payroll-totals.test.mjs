import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFile } from "node:fs/promises";
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

const segment = {
  sales: 100,
  cogs: 50,
  employeePay: 10,
  officerPay: 2,
  depreciation: 3,
  otherSga: 5,
  headcount: 10,
  officerCount: 2,
};

test("official payroll totals are independent from SGA breakdowns and drive value added", () => {
  assert.equal(model.employeePayrollTotal(segment), 10);
  assert.equal(model.officerPayrollTotal(segment), 2);
  assert.equal(model.valueAdded(segment), 48);

  const withOfficialTotals = {
    ...segment,
    employeePayrollTotal: 18,
    officerPayrollTotal: 4,
  };
  assert.equal(model.employeePayrollTotal(withOfficialTotals), 18);
  assert.equal(model.officerPayrollTotal(withOfficialTotals), 4);
  assert.equal(model.valueAdded(withOfficialTotals), 58);
});

test("company totals preserve independently entered 2-21 and 2-22 values", () => {
  const company = model.total(
    { ...segment, employeePayrollTotal: 11, officerPayrollTotal: 3 },
    { ...segment, employeePayrollTotal: 17, officerPayrollTotal: 5 },
  );
  assert.equal(company.employeePay, 20);
  assert.equal(company.officerPay, 4);
  assert.equal(company.employeePayrollTotal, 28);
  assert.equal(company.officerPayrollTotal, 8);
});

test("historical 2-21 and 2-22 are independent inputs without automatic proposals", async () => {
  const pageSource = await readFile(path.join(projectDirectory, "app", "page.tsx"), "utf8");
  assert.match(pageSource, /code:\s*"2-21"[\s\S]{0,500}noAutoProposal:\s*true/);
  assert.match(pageSource, /code:\s*"2-22"[\s\S]{0,500}noAutoProposal:\s*true/);
  assert.match(pageSource, /2-11（販管費内訳）と差額があります/);
  assert.match(pageSource, /2-8（販管費内訳）と差額があります/);
});

test("official report rows use the independent payroll totals", async () => {
  const reportSource = await readFile(path.join(projectDirectory, "app", "report-data.ts"), "utf8");
  assert.match(reportSource, /code:\s*"2-21"[\s\S]{0,250}employeePayrollTotal/);
  assert.match(reportSource, /code:\s*"2-22"[\s\S]{0,250}officerPayrollTotal/);
});
