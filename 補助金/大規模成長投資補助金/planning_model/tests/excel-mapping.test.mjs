import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  buildMappedExcel,
  EXCEL_MAPPING_FORMAT,
  mappedExcelOutputFileName,
  parseExcelMappingDefinition,
  previewExcelImport,
  validateExcelMappingDefinition,
} from "../.excel-mapping-test-runtime.mjs";

const workbookBytes = () => zipSync({
  "[Content_Types].xml": strToU8("keep-content-types"),
  "custom/keep.bin": new Uint8Array([1, 2, 3, 4]),
  "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="損益計算書" sheetId="1" r:id="rId1"/><sheet name="貸借対照表" sheetId="2" r:id="rId2"/></sheets></workbook>`),
  "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`),
  "xl/sharedStrings.xml": strToU8(`<?xml version="1.0"?><sst><si><t>1,500</t></si></sst>`),
  "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0"?><worksheet><sheetData><row r="5"><c r="B5" t="s"><v>0</v></c><c r="C5"><v>0</v></c><c r="D5"><v>2750</v></c><c r="E5"><f>SUM(B5:D5)</f><v>4250</v></c></row></sheetData></worksheet>`),
  "xl/worksheets/sheet2.xml": strToU8(`<?xml version="1.0"?><worksheet><sheetData><row r="4"><c r="B4" s="3" cm="4" vm="2" ph="1"><v>13200</v></c><c r="C4" s="3"><v>14300</v></c><c r="D4" s="3"><v>15600</v></c></row></sheetData></worksheet>`),
});

const target = (id, value = null) => ({ id, label: id, unit: "億円", writable: true, value });
const mapping = {
  format: EXCEL_MAPPING_FORMAT,
  name: "test",
  bindings: [
    { id: "sales-a", target: "companyPL.prePrevious.2-1", excel: { sheet: "損益計算書", cell: "B5", unit: "百万円" }, required: true },
    { id: "sales-b", target: "companyPL.previous.2-1", excel: { sheet: "損益計算書", cell: "C5", unit: "百万円" } },
    { id: "sales-c", target: "companyPL.latest.2-1", excel: { sheet: "損益計算書", cell: "D5", unit: "百万円" } },
  ],
};

test("validates and parses declarative mapping definitions", () => {
  assert.equal(validateExcelMappingDefinition(mapping).length, 0);
  assert.equal(parseExcelMappingDefinition(JSON.stringify(mapping)).name, "test");
  assert.throws(() => parseExcelMappingDefinition("{bad json"), /JSON/);
  const duplicate = { ...mapping, bindings: [...mapping.bindings, { ...mapping.bindings[0], id: "duplicate", excel: { ...mapping.bindings[0].excel, cell: "F5" } }] };
  assert.match(validateExcelMappingDefinition(duplicate).join("\n"), /取込先が重複/);
});

test("imports shared strings, explicit zero, and unit conversions without confusing blank and zero", () => {
  const targets = new Map([
    ["companyPL.prePrevious.2-1", target("companyPL.prePrevious.2-1")],
    ["companyPL.previous.2-1", target("companyPL.previous.2-1")],
    ["companyPL.latest.2-1", target("companyPL.latest.2-1")],
  ]);
  const preview = previewExcelImport(workbookBytes(), mapping, targets);
  assert.deepEqual(preview.map((item) => item.value), [15, 0, 27.5]);
  assert.deepEqual(preview.map((item) => item.status), ["ready", "ready", "ready"]);
  assert.equal(preview[1].rawValue, 0);
});

test("exports into a copied workbook while preserving styles, formulas, and unrelated parts", () => {
  const targets = new Map([
    ["companyPL.prePrevious.2-1", target("companyPL.prePrevious.2-1", 21.25)],
    ["companyPL.previous.2-1", target("companyPL.previous.2-1", 0)],
    ["companyPL.latest.2-1", target("companyPL.latest.2-1", null)],
  ]);
  const result = buildMappedExcel(workbookBytes(), mapping, targets);
  assert.ok(result.bytes);
  const output = unzipSync(result.bytes);
  assert.deepEqual([...output["custom/keep.bin"]], [1, 2, 3, 4]);
  const sheet = strFromU8(output["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /<c r="B5"><v>2125<\/v><\/c>/);
  assert.match(sheet, /<c r="C5"><v>0<\/v><\/c>/);
  assert.match(sheet, /<c r="D5"><v>2750<\/v><\/c>/);
  assert.match(sheet, /<c r="E5"><f>SUM\(B5:D5\)<\/f><v>4250<\/v><\/c>/);
  assert.equal(result.previews.find((item) => item.target.endsWith("latest.2-1"))?.status, "empty");
});

test("changes only the mapped cell value without mutating the source workbook", () => {
  const source = workbookBytes();
  const sourceSnapshot = source.slice();
  const sourceParts = unzipSync(source);
  const valueOnlyMapping = {
    format: EXCEL_MAPPING_FORMAT,
    name: "value-only",
    bindings: [
      {
        id: "styled-cell",
        target: "balanceSheet.prePrevious.1-1",
        excel: { sheet: "貸借対照表", cell: "B4", unit: "raw" },
        direction: "export",
      },
    ],
  };
  const targets = new Map([
    [
      "balanceSheet.prePrevious.1-1",
      { id: "balanceSheet.prePrevious.1-1", label: "assets", unit: "raw", writable: true, value: 21250 },
    ],
  ]);

  const result = buildMappedExcel(source, valueOnlyMapping, targets);
  assert.ok(result.bytes);

  assert.deepEqual(source, sourceSnapshot, "入力された元Excelのバイト列を変更しない");
  assert.notStrictEqual(result.bytes, source, "出力は元Excelとは別のバイト列として生成する");

  const sourceAfterExport = unzipSync(source);
  for (const [path, bytes] of Object.entries(sourceParts)) {
    assert.deepEqual(sourceAfterExport[path], bytes, `元Excel内の ${path} を変更しない`);
  }

  const outputParts = unzipSync(result.bytes);
  const targetPath = "xl/worksheets/sheet2.xml";
  for (const [path, bytes] of Object.entries(sourceParts)) {
    if (path !== targetPath) {
      assert.deepEqual(outputParts[path], bytes, `出力Excel内の対象外ファイル ${path} を変更しない`);
    }
  }
  assert.equal(
    strFromU8(outputParts[targetPath]),
    strFromU8(sourceParts[targetPath]).replace(
      '<c r="B4" s="3" cm="4" vm="2" ph="1"><v>13200</v></c>',
      '<c r="B4" s="3" cm="4" vm="2" ph="1"><v>21250</v></c>',
    ),
    "対象セルは値だけを書き換え、書式・メタデータ属性を保持する",
  );
});

test("uses a distinct output file name instead of the source file name", () => {
  assert.equal(mappedExcelOutputFileName("申請資料.xlsx"), "申請資料_シミュレーター出力.xlsx");
  assert.equal(mappedExcelOutputFileName("申請資料.XLSM"), "申請資料_シミュレーター出力.xlsm");
  assert.notEqual(mappedExcelOutputFileName("申請資料.xlsx"), "申請資料.xlsx");
});

test("stops export when a mapped destination is a formula cell", () => {
  const formulaMapping = {
    format: EXCEL_MAPPING_FORMAT,
    name: "formula",
    bindings: [{ id: "formula", target: "companyPL.latest.2-1", excel: { sheet: "損益計算書", cell: "E5", unit: "百万円" }, direction: "export" }],
  };
  const targets = new Map([["companyPL.latest.2-1", target("companyPL.latest.2-1", 42)]]);
  const result = buildMappedExcel(workbookBytes(), formulaMapping, targets);
  assert.equal(result.bytes, null);
  assert.match(result.previews[0].message, /数式セル/);
});
