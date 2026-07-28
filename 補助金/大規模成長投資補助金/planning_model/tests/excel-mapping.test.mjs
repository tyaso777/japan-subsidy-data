import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  buildMappedExcel,
  EXCEL_CONVERSION_SAMPLE_MAPPING,
  EXCEL_MAPPING_FORMAT,
  EXCEL_MAPPING_MANUAL,
  filterExcelMappingImportPreviews,
  futureExcelMappingPeriods,
  futureInputBasisForMappedTargets,
  MAX_MAPPED_EXCEL_FILE_BYTES,
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

test("provides a ready-to-use company-to-base conversion workbook and matching mapping", () => {
  assert.equal(validateExcelMappingDefinition(EXCEL_CONVERSION_SAMPLE_MAPPING).length, 0);
  assert.equal(EXCEL_CONVERSION_SAMPLE_MAPPING.bindings.length, 270);
  assert.equal(
    EXCEL_CONVERSION_SAMPLE_MAPPING.bindings.every((binding) => binding.excel.sheet === "②補助事業情報"),
    true,
  );
  const workbook = new Uint8Array(readFileSync(path.resolve(
    "public",
    "examples",
    "任意Excel変換サンプル_第6次公式A002.xlsx",
  )));
  assert.equal(Buffer.from(workbook.subarray(0, 2)).toString("ascii"), "PK");

  const targets = new Map(EXCEL_CONVERSION_SAMPLE_MAPPING.bindings.map((binding) => {
    const count = binding.excel.unit === "人";
    return [binding.target, {
      id: binding.target,
      label: binding.target,
      unit: count ? "人" : "円",
      writable: true,
      value: null,
    }];
  }));
  const previews = previewExcelImport(workbook, EXCEL_CONVERSION_SAMPLE_MAPPING, targets);

  assert.equal(previews.length, EXCEL_CONVERSION_SAMPLE_MAPPING.bindings.length);
  assert.equal(
    previews.every((item) => item.status === "ready"),
    true,
    JSON.stringify(previews.filter((item) => item.status !== "ready").slice(0, 10), null, 2),
  );
  assert.equal(
    previews.find((item) => item.target === "companyPL.baseYear.2-1")?.value,
    3_400_000_000,
  );
  assert.equal(
    previews.find((item) => item.target === "projectPL.baseYear.7-1")?.value,
    700_000_000,
  );
  assert.equal(
    previews.find((item) => item.target === "balanceSheet.latest.1-1")?.value,
    2_200_000_000,
  );
  assert.equal(
    previews.find((item) => item.target === "balanceSheet.latest.1-24")?.value,
    200_000_000,
  );
  assert.equal(
    previews
      .filter((item) => ["futureCapex.project1.1-24", "futureCapex.beforeBase.1-24", "futureCapex.baseYear.1-24"].includes(item.target))
      .reduce((sum, item) => sum + (item.value ?? 0), 0),
    2_000_000_000,
  );

  const exportTargets = new Map(previews.map((item) => {
    const sourceTarget = targets.get(item.target);
    return [item.target, { ...sourceTarget, value: item.value }];
  }));
  const exported = buildMappedExcel(workbook, EXCEL_CONVERSION_SAMPLE_MAPPING, exportTargets);
  assert.ok(exported.bytes);
  const roundTrip = previewExcelImport(exported.bytes, EXCEL_CONVERSION_SAMPLE_MAPPING, targets);
  assert.deepEqual(
    roundTrip.map((item) => item.value),
    previews.map((item) => item.value),
    "公式A002の全マッピング値が取込→出力→再取込で一致する",
  );
});

test("assigns reusable relative names to every future planning period", () => {
  assert.deepEqual(
    futureExcelMappingPeriods({ latestYear: 2025, baseYear: 2028 }),
    [
      { id: "project1", year: 2026, label: "補助事業期間1年目" },
      { id: "beforeBase", year: 2027, label: "基準年前年" },
      { id: "baseYear", year: 2028, label: "基準年" },
      { id: "report1", year: 2029, label: "事業化報告1年目" },
      { id: "report2", year: 2030, label: "事業化報告2年目" },
      { id: "report3", year: 2031, label: "事業化報告3年目" },
    ],
  );
  assert.deepEqual(
    futureExcelMappingPeriods({ latestYear: 2025, baseYear: 2031 }).slice(0, 4),
    [
      { id: "project1", year: 2026, label: "補助事業期間1年目" },
      { id: "project2", year: 2027, label: "補助事業期間2年目" },
      { id: "project3", year: 2028, label: "補助事業期間3年目" },
      { id: "project4", year: 2029, label: "補助事業期間4年目" },
    ],
  );
});

test("selects the future PL input basis from mapped targets and rejects mixed bases", () => {
  assert.equal(
    futureInputBasisForMappedTargets([
      "companyPL.baseYear.2-1",
      "projectPL.report1.7-1",
      "futureCapex.report1.1-24",
    ]),
    "company",
  );
  assert.equal(
    futureInputBasisForMappedTargets([
      "basePL.beforeBase.M2-1",
      "projectPL.report3.7-10",
    ]),
    "other",
  );
  assert.equal(
    futureInputBasisForMappedTargets([
      "companyPL.latest.2-1",
      "projectPL.latest.7-1",
    ]),
    null,
    "過去3期だけのマッピングでは将来PL入力方式を変更しない",
  );
  assert.throws(
    () => futureInputBasisForMappedTargets([
      "companyPL.baseYear.2-1",
      "basePL.baseYear.M2-1",
    ]),
    /全社PLとベース事業PL/,
  );
});

test("limits mapped imports to historical data unless future data is explicitly included", () => {
  const previews = [
    { target: "companyPL.latest.2-1" },
    { target: "balanceSheet.previous.1-1" },
    { target: "futureCapex.baseYear.1-24" },
    { target: "projectPL.report1.7-1" },
  ];
  assert.deepEqual(
    filterExcelMappingImportPreviews(previews, "history").map((item) => item.target),
    ["companyPL.latest.2-1", "balanceSheet.previous.1-1"],
  );
  assert.deepEqual(
    filterExcelMappingImportPreviews(previews, "history-and-future").map((item) => item.target),
    previews.map((item) => item.target),
  );
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
  const workbook = strFromU8(output["xl/workbook.xml"]);
  assert.match(sheet, /<c r="B5"><v>2125<\/v><\/c>/);
  assert.match(sheet, /<c r="C5"><v>0<\/v><\/c>/);
  assert.match(sheet, /<c r="D5"><v>2750<\/v><\/c>/);
  assert.match(sheet, /<c r="E5"><f>SUM\(B5:D5\)<\/f><v>4250<\/v><\/c>/);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.match(workbook, /forceFullCalc="1"/);
  assert.equal(result.previews.find((item) => item.target.endsWith("latest.2-1"))?.status, "empty");
});

test("exports into an official-style self-closing empty input cell", () => {
  const parts = unzipSync(workbookBytes());
  parts["xl/worksheets/sheet1.xml"] = strToU8(
    strFromU8(parts["xl/worksheets/sheet1.xml"]).replace('<c r="B5" t="s"><v>0</v></c>', '<c r="B5" s="73"/>'),
  );
  const targets = new Map([
    ["companyPL.prePrevious.2-1", target("companyPL.prePrevious.2-1", 21.25)],
    ["companyPL.previous.2-1", target("companyPL.previous.2-1", null)],
    ["companyPL.latest.2-1", target("companyPL.latest.2-1", null)],
  ]);

  const result = buildMappedExcel(zipSync(parts), mapping, targets);
  assert.ok(result.bytes);
  const sheet = strFromU8(unzipSync(result.bytes)["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /<c r="B5" s="73"><v>2125<\/v><\/c>/);
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
    if (path !== targetPath && path !== "xl/workbook.xml") {
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

test("stops import from a formula cell because its cached value may be stale", () => {
  const formulaMapping = {
    format: EXCEL_MAPPING_FORMAT,
    name: "formula-import",
    bindings: [{ id: "formula", target: "companyPL.latest.2-1", excel: { sheet: "損益計算書", cell: "E5", unit: "百万円" }, direction: "import" }],
  };
  const targets = new Map([["companyPL.latest.2-1", target("companyPL.latest.2-1")]]);
  const result = previewExcelImport(workbookBytes(), formulaMapping, targets);
  assert.equal(result[0].status, "error");
  assert.match(result[0].message, /数式セル/);
});

test("rejects an oversized workbook before attempting to unzip it", () => {
  const oversized = new Uint8Array(MAX_MAPPED_EXCEL_FILE_BYTES + 1);
  assert.throws(
    () => previewExcelImport(oversized, mapping, new Map()),
    /50MB以下/,
  );
});

test("documents blank-cell, macro, and dynamic company-to-base behavior", () => {
  assert.match(EXCEL_MAPPING_MANUAL, /空欄は既存値を消去しません/);
  assert.match(EXCEL_MAPPING_MANUAL, /\.xlsmの既存マクロは保持されます/);
  assert.match(EXCEL_MAPPING_MANUAL, /ベース事業は差額として自動計算/);
  assert.doesNotMatch(EXCEL_MAPPING_MANUAL, /basePL.*固定値へ変換/);
});
