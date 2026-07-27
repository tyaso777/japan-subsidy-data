import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { unzipSync, strFromU8 } from "fflate";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const fixture = JSON.parse(
  fs.readFileSync(path.join(here, "fixtures", "sixth-round-official-golden.json"), "utf8"),
);

const xmlDecode = (value) =>
  value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const workbookFormulaAnchors = (xlsxPath, sheetName) => {
  const files = unzipSync(new Uint8Array(fs.readFileSync(xlsxPath)));
  const workbookXml = strFromU8(files["xl/workbook.xml"]);
  const relsXml = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const sheetMatch = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
    .find(([, name]) => xmlDecode(name) === sheetName);
  assert.ok(sheetMatch, `公式Excelにシート「${sheetName}」がありません`);

  const relationship = [...relsXml.matchAll(/<Relationship\b([^>]+)\/>/g)]
    .map(([, attrs]) => ({
      id: attrs.match(/\bId="([^"]+)"/)?.[1],
      target: attrs.match(/\bTarget="([^"]+)"/)?.[1],
    }))
    .find(({ id }) => id === sheetMatch[2]);
  assert.ok(relationship?.target, `シート「${sheetName}」のXMLを解決できません`);

  const target = relationship.target.replace(/^\/?xl\//, "");
  const sheetXml = strFromU8(files[`xl/${target}`]);
  const formulas = {};
  for (const match of sheetXml.matchAll(/<c\b[^>]*\br="([^"]+)"[^>]*>([\s\S]*?)<\/c>/g)) {
    const formula = match[2].match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];
    if (formula !== undefined) formulas[match[1]] = xmlDecode(formula);
  }
  return formulas;
};

const officialPath = path.join(projectRoot, ...fixture.source.file.split("/"));
if (fs.existsSync(officialPath)) {
  const officialHash = crypto.createHash("sha256").update(fs.readFileSync(officialPath)).digest("hex").toUpperCase();
  assert.equal(officialHash, fixture.source.sha256, "第6次公式Excelがゴールデンテスト作成時の版から変わっています");

  const actualAnchors = workbookFormulaAnchors(officialPath, fixture.source.sheet);
  for (const [cell, expectedFormula] of Object.entries(fixture.source.formulaAnchors)) {
    assert.equal(actualAnchors[cell], expectedFormula, `公式Excel ${fixture.source.sheet}!${cell} の数式が変わっています`);
  }
} else {
  console.warn(
    `第6次公式Excel本体がないためブック整合性確認を省略し、コミット済みの正解値・数式スナップショットで比較します: ${officialPath}`,
  );
}

const compiled = (await build({
  entryPoints: [path.join(projectRoot, "app", "report-data.ts")],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  target: "node22",
  logLevel: "silent",
})).outputFiles[0].text;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const { buildCompanyPlRows } = commonJsModule.exports;

const zeroSegment = {
  sales: 0,
  cogs: 0,
  employeePay: 0,
  officerPay: 0,
  depreciation: 0,
  otherSga: 0,
  headcount: 0,
  officerCount: 0,
  employeeSalary: 0,
  employeeBonus: 0,
  officerCompensation: 0,
  officerBonus: 0,
  cogsDepreciation: 0,
  sgaDepreciation: 0,
  researchDevelopment: 0,
  ordinaryIncome: 0,
  preTaxIncome: 0,
  netIncome: 0,
};
const plans = fixture.periods.map(({ year, input }) => ({
  year,
  role: "actual",
  project: input,
  other: zeroSegment,
}));
const rows = buildCompanyPlRows(plans);
const rowByCode = new Map(rows.map((row) => [row.code, row]));

for (const [periodIndex, period] of fixture.periods.entries()) {
  for (const [code, expected] of Object.entries(period.expected)) {
    const row = rowByCode.get(code);
    assert.ok(row, `HTML側に公式項目 ${code} がありません`);
    const actual = row.values[periodIndex];
    if (expected === null) {
      assert.ok(actual === null || actual === undefined, `${code} ${period.year}年は空欄であるべきです`);
    } else {
      assert.ok(
        Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
        `${code} ${period.year}年: 公式数式期待値=${expected}, HTML計算値=${actual}`,
      );
    }
  }
}

console.log("official sixth-round Excel golden tests passed");
