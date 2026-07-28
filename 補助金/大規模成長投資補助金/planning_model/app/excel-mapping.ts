import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const EXCEL_MAPPING_FORMAT = "growth-investment-excel-mapping/v1";

export type ExcelMappingDirection = "import" | "export" | "both";
export type ExcelMappingImportScope = "history" | "history-and-future";
export type ExcelMappingUnit = "raw" | "円" | "千円" | "百万円" | "億円" | "%" | "人" | "年" | "倍";
export type ExcelPercentMode = "display" | "fraction";

export type ExcelMappingBinding = {
  id: string;
  target: string;
  excel: {
    sheet: string;
    cell: string;
    unit?: ExcelMappingUnit;
    percentMode?: ExcelPercentMode;
  };
  direction?: ExcelMappingDirection;
  required?: boolean;
  transform?: {
    scale?: number;
    offset?: number;
    invertSign?: boolean;
    round?: number;
  };
};

export type ExcelMappingDefinition = {
  format: typeof EXCEL_MAPPING_FORMAT;
  name: string;
  description?: string;
  bindings: ExcelMappingBinding[];
};

export type ExcelMappingTarget = {
  id: string;
  label: string;
  unit: ExcelMappingUnit;
  writable: boolean;
  value: number | null;
};

export type ExcelMappingPreview = {
  bindingId: string;
  target: string;
  targetLabel: string;
  sheet: string;
  cell: string;
  rawValue: number | string | boolean | null;
  value: number | null;
  status: "ready" | "empty" | "warning" | "error";
  message: string;
};

export type FutureExcelMappingPeriod = {
  id: string;
  year: number;
  label: string;
};

type WorkbookParts = {
  files: Record<string, Uint8Array>;
  sheets: Map<string, string>;
  sharedStrings: string[];
};

const supportedUnits = new Set<ExcelMappingUnit>(["raw", "円", "千円", "百万円", "億円", "%", "人", "年", "倍"]);
const moneyScale: Partial<Record<ExcelMappingUnit, number>> = { 円: 1, 千円: 1_000, 百万円: 1_000_000, 億円: 100_000_000 };
const xmlDecode = (value: string) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");
const normalizeZipPath = (base: string, target: string) => {
  const parts = `${base}/${target}`.replaceAll("\\", "/").split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
};
const targetDirectionAllows = (binding: ExcelMappingBinding, direction: "import" | "export") =>
  (binding.direction ?? "both") === "both" || (binding.direction ?? "both") === direction;
const roundTo = (value: number, digits?: number) => digits === undefined
  ? value
  : Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;

export function futureExcelMappingPeriods(timeline: { latestYear: number; baseYear: number }): FutureExcelMappingPeriod[] {
  const latestYear = Math.round(timeline.latestYear);
  const baseYear = Math.max(latestYear + 1, Math.round(timeline.baseYear));
  const periods: FutureExcelMappingPeriod[] = [];
  let projectPeriod = 1;
  for (let year = latestYear + 1; year <= baseYear + 3; year += 1) {
    if (year < baseYear - 1) {
      periods.push({ id: `project${projectPeriod}`, year, label: `補助事業期間${projectPeriod}年目` });
      projectPeriod += 1;
    } else if (year === baseYear - 1) {
      periods.push({ id: "beforeBase", year, label: "基準年前年" });
    } else if (year === baseYear) {
      periods.push({ id: "baseYear", year, label: "基準年" });
    } else {
      const reportYear = year - baseYear;
      periods.push({ id: `report${reportYear}`, year, label: `事業化報告${reportYear}年目` });
    }
  }
  return periods;
}

const futurePeriodPattern = /^(?:project[1-4]|beforeBase|baseYear|report[1-3])$/;

export function futureInputBasisForMappedTargets(targets: string[]): "company" | "other" | null {
  let company = false;
  let other = false;
  for (const target of targets) {
    const [dataset, period] = target.split(".");
    if (!futurePeriodPattern.test(period ?? "")) continue;
    if (dataset === "companyPL") company = true;
    if (dataset === "basePL") other = true;
  }
  if (company && other) throw new Error("将来の全社PLとベース事業PLを同時には取り込めません。どちらか一方のマッピングにしてください。");
  return company ? "company" : other ? "other" : null;
}

const historicalPeriodNames = new Set(["prePrevious", "previous", "latest"]);

export function filterExcelMappingImportPreviews<T extends { target: string }>(
  previews: T[],
  scope: ExcelMappingImportScope,
): T[] {
  if (scope === "history-and-future") return previews;
  return previews.filter((preview) => historicalPeriodNames.has(preview.target.split(".")[1] ?? ""));
}

export function validateExcelMappingDefinition(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["マッピング定義はJSONオブジェクトで指定してください。"];
  const definition = value as Partial<ExcelMappingDefinition>;
  if (definition.format !== EXCEL_MAPPING_FORMAT) errors.push(`format は "${EXCEL_MAPPING_FORMAT}" としてください。`);
  if (!definition.name || typeof definition.name !== "string") errors.push("name を指定してください。");
  if (!Array.isArray(definition.bindings) || definition.bindings.length === 0) {
    errors.push("bindings を1件以上指定してください。");
    return errors;
  }
  const ids = new Set<string>();
  const exportCells = new Set<string>();
  const importTargets = new Set<string>();
  definition.bindings.forEach((binding, index) => {
    const prefix = `bindings[${index}]`;
    if (!binding || typeof binding !== "object") {
      errors.push(`${prefix} が正しくありません。`);
      return;
    }
    if (!binding.id || typeof binding.id !== "string") errors.push(`${prefix}.id を指定してください。`);
    else if (ids.has(binding.id)) errors.push(`${prefix}.id "${binding.id}" が重複しています。`);
    else ids.add(binding.id);
    if (!binding.target || typeof binding.target !== "string") errors.push(`${prefix}.target を指定してください。`);
    if (!binding.excel?.sheet || typeof binding.excel.sheet !== "string") errors.push(`${prefix}.excel.sheet を指定してください。`);
    if (!binding.excel?.cell || !/^[A-Z]{1,3}[1-9]\d*$/i.test(binding.excel.cell)) errors.push(`${prefix}.excel.cell はA1形式で指定してください。`);
    if (binding.excel?.unit && !supportedUnits.has(binding.excel.unit)) errors.push(`${prefix}.excel.unit が未対応です。`);
    if (binding.direction && !["import", "export", "both"].includes(binding.direction)) errors.push(`${prefix}.direction が正しくありません。`);
    if (binding.excel?.percentMode && binding.excel.unit !== "%") errors.push(`${prefix}.excel.percentMode は単位が%の場合だけ指定できます。`);
    if (binding.transform?.scale === 0) errors.push(`${prefix}.transform.scale に0は指定できません。`);
    if (binding.transform?.round !== undefined && (!Number.isInteger(binding.transform.round) || binding.transform.round < 0 || binding.transform.round > 10)) errors.push(`${prefix}.transform.round は0～10の整数で指定してください。`);
    if (binding.excel?.sheet && binding.excel?.cell && targetDirectionAllows(binding, "export")) {
      const key = `${binding.excel.sheet}!${binding.excel.cell.toUpperCase()}`;
      if (exportCells.has(key)) errors.push(`${prefix} の出力先 ${key} が重複しています。`);
      exportCells.add(key);
    }
    if (binding.target && targetDirectionAllows(binding, "import")) {
      if (importTargets.has(binding.target)) errors.push(`${prefix}.target "${binding.target}" の取込先が重複しています。`);
      importTargets.add(binding.target);
    }
  });
  return errors;
}

export function parseExcelMappingDefinition(text: string): ExcelMappingDefinition {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("マッピング定義書をJSONとして読み取れません。");
  }
  const errors = validateExcelMappingDefinition(value);
  if (errors.length) throw new Error(errors.join("\n"));
  return value as ExcelMappingDefinition;
}

function workbookParts(bytes: Uint8Array): WorkbookParts {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Excelファイルを開けません。.xlsx または .xlsm のOOXMLファイルを指定してください。");
  }
  const workbookXml = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const relationshipsXml = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  if (!workbookXml || !relationshipsXml) throw new Error(".xlsx または .xlsm のOOXMLファイルではありません。");
  const relationships = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
    const attrs = match[1];
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) {
      const decodedTarget = xmlDecode(target);
      relationships.set(
        id,
        decodedTarget.startsWith("/") ? decodedTarget.replace(/^\/+/, "") : normalizeZipPath("xl", decodedTarget),
      );
    }
  }
  const sheets = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const attrs = match[1];
    const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
    const relationshipId = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    const path = relationshipId ? relationships.get(relationshipId) : undefined;
    if (name && path) sheets.set(xmlDecode(name), path);
  }
  const sharedStringsXml = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  const sharedStrings = [...sharedStringsXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((item) =>
    [...item[1].matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((text) => xmlDecode(text[1])).join(""),
  );
  return { files, sheets, sharedStrings };
}

function readCell(xml: string, address: string, sharedStrings: string[]): number | string | boolean | null {
  const cell = new RegExp(`<(?:\\w+:)?c\\b([^>]*\\br="${address.toUpperCase()}"[^>]*)>([\\s\\S]*?)<\\/(?:\\w+:)?c>`, "i").exec(xml);
  if (!cell) return null;
  const type = /\bt="([^"]+)"/.exec(cell[1])?.[1];
  const body = cell[2];
  if (type === "inlineStr") {
    return [...body.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => xmlDecode(match[1])).join("");
  }
  const raw = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
  if (raw === undefined) return null;
  if (type === "s") return sharedStrings[Number(raw)] ?? null;
  if (type === "b") return raw === "1";
  if (type === "str" || type === "e") return xmlDecode(raw);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : xmlDecode(raw);
}

function parseNumericCell(value: number | string | boolean | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = /^[-−△▲]|^\(.*\)$/.test(trimmed);
  const normalized = trimmed
    .replace(/[,\s￥¥円%％]/g, "")
    .replace(/[()△▲−]/g, "")
    .replace(/^\+/, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : null;
}

function convertUnit(value: number, from: ExcelMappingUnit, to: ExcelMappingUnit, percentMode: ExcelPercentMode = "display") {
  if (from === "%" && to === "%") return percentMode === "fraction" ? value * 100 : value;
  if (moneyScale[from] && moneyScale[to]) return value * moneyScale[from]! / moneyScale[to]!;
  if (from === "raw" || to === "raw" || from === to) return value;
  throw new Error(`単位 ${from} から ${to} への変換には対応していません。`);
}

function applyImportTransform(value: number, binding: ExcelMappingBinding, targetUnit: ExcelMappingUnit) {
  const excelUnit = binding.excel.unit ?? targetUnit;
  let result = convertUnit(value, excelUnit, targetUnit, binding.excel.percentMode);
  if (binding.transform?.invertSign) result *= -1;
  result = result * (binding.transform?.scale ?? 1) + (binding.transform?.offset ?? 0);
  return roundTo(result, binding.transform?.round);
}

function applyExportTransform(value: number, binding: ExcelMappingBinding, targetUnit: ExcelMappingUnit) {
  const scale = binding.transform?.scale ?? 1;
  let result = (value - (binding.transform?.offset ?? 0)) / scale;
  if (binding.transform?.invertSign) result *= -1;
  const excelUnit = binding.excel.unit ?? targetUnit;
  if (targetUnit === "%" && excelUnit === "%" && binding.excel.percentMode === "fraction") result /= 100;
  else result = convertUnit(result, targetUnit, excelUnit, "display");
  return roundTo(result, binding.transform?.round);
}

export function previewExcelImport(
  bytes: Uint8Array,
  definition: ExcelMappingDefinition,
  targets: Map<string, ExcelMappingTarget>,
): ExcelMappingPreview[] {
  const workbook = workbookParts(bytes);
  return definition.bindings.filter((binding) => targetDirectionAllows(binding, "import")).map((binding) => {
    const target = targets.get(binding.target);
    if (!target) return { bindingId: binding.id, target: binding.target, targetLabel: binding.target, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: null, value: null, status: "error", message: "シミュレーター側の対象項目が見つかりません。" };
    if (!target.writable) return { bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: null, value: null, status: "error", message: "自動計算項目には取り込めません。" };
    const path = workbook.sheets.get(binding.excel.sheet);
    if (!path || !workbook.files[path]) return { bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: null, value: null, status: "error", message: "指定シートが見つかりません。" };
    const rawValue = readCell(strFromU8(workbook.files[path]), binding.excel.cell, workbook.sharedStrings);
    if (rawValue === null || rawValue === "") {
      return { bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue, value: null, status: binding.required ? "error" : "empty", message: binding.required ? "必須セルが空欄です。" : "空欄のため変更しません。" };
    }
    const numeric = parseNumericCell(rawValue);
    if (numeric === null) return { bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue, value: null, status: "error", message: "数値として読み取れません。" };
    try {
      const value = applyImportTransform(numeric, binding, target.unit);
      return { bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue, value, status: "ready", message: target.value === null ? "新規入力" : `現在値 ${target.value} から変更` };
    } catch (error) {
      return { bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue, value: null, status: "error", message: error instanceof Error ? error.message : "単位変換に失敗しました。" };
    }
  });
}

function replaceCellValue(xml: string, address: string, value: number) {
  const selfClosingPattern = new RegExp(`<((?:\\w+:)?c)\\b([^>]*\\br="${address.toUpperCase()}"[^>]*)\\/>`, "i");
  const selfClosing = selfClosingPattern.exec(xml);
  if (selfClosing) {
    const attributes = selfClosing[2].replace(/\s+t="[^"]*"/i, "").trimEnd();
    return xml.replace(selfClosingPattern, `<${selfClosing[1]}${attributes}><v>${String(value)}</v></${selfClosing[1]}>`);
  }
  const pattern = new RegExp(`<c\\b([^>]*\\br="${address.toUpperCase()}"[^>]*)>([\\s\\S]*?)<\\/c>`, "i");
  const existing = pattern.exec(xml);
  if (!existing) throw new Error(`出力先セル ${address.toUpperCase()} がテンプレート内にありません。`);
  if (/<f(?:\s[^>]*)?>/.test(existing[2])) throw new Error(`出力先セル ${address.toUpperCase()} は数式セルです。入力セルを指定してください。`);
  const attributes = existing[1].replace(/\s+t="[^"]*"/i, "");
  const encodedValue = String(value);
  const body = /<v(?:\s[^>]*)?>[\s\S]*?<\/v>/i.test(existing[2])
    ? existing[2].replace(/<v(?:\s[^>]*)?>[\s\S]*?<\/v>/i, `<v>${encodedValue}</v>`)
    : `<v>${encodedValue}</v>`;
  const replacement = `<c${attributes}>${body}</c>`;
  return xml.replace(pattern, replacement);
}

export function mappedExcelOutputFileName(sourceFileName: string) {
  const extension = sourceFileName.toLowerCase().endsWith(".xlsm") ? "xlsm" : "xlsx";
  const stem = sourceFileName.replace(/\.(xlsx|xlsm)$/i, "");
  return `${stem}_シミュレーター出力.${extension}`;
}

export function buildMappedExcel(
  bytes: Uint8Array,
  definition: ExcelMappingDefinition,
  targets: Map<string, ExcelMappingTarget>,
) {
  const workbook = workbookParts(bytes);
  const previews: ExcelMappingPreview[] = [];
  for (const binding of definition.bindings.filter((item) => targetDirectionAllows(item, "export"))) {
    const target = targets.get(binding.target);
    if (!target) {
      previews.push({ bindingId: binding.id, target: binding.target, targetLabel: binding.target, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: null, value: null, status: "error", message: "シミュレーター側の対象項目が見つかりません。" });
      continue;
    }
    if (target.value === null) {
      previews.push({ bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: null, value: null, status: binding.required ? "error" : "empty", message: binding.required ? "必須項目が未入力です。" : "未入力のため変更しません。" });
      continue;
    }
    const path = workbook.sheets.get(binding.excel.sheet);
    if (!path || !workbook.files[path]) {
      previews.push({ bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: null, value: target.value, status: "error", message: "指定シートが見つかりません。" });
      continue;
    }
    try {
      const outputValue = applyExportTransform(target.value, binding, target.unit);
      const xml = strFromU8(workbook.files[path]);
      workbook.files[path] = strToU8(replaceCellValue(xml, binding.excel.cell, outputValue));
      previews.push({ bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: outputValue, value: target.value, status: "ready", message: "別Excelへ出力" });
    } catch (error) {
      previews.push({ bindingId: binding.id, target: binding.target, targetLabel: target.label, sheet: binding.excel.sheet, cell: binding.excel.cell, rawValue: null, value: target.value, status: "error", message: error instanceof Error ? error.message : "出力に失敗しました。" });
    }
  }
  if (previews.some((item) => item.status === "error")) return { bytes: null, previews };
  return { bytes: zipSync(workbook.files, { level: 6 }), previews };
}

export const EXCEL_MAPPING_EXAMPLE: ExcelMappingDefinition = {
  format: EXCEL_MAPPING_FORMAT,
  name: "任意Excel・過去3期／将来入力例",
  description: "シート名とセル番地を対象Excelに合わせて変更してください。",
  bindings: [
    { id: "company-sales-pre-previous", target: "companyPL.prePrevious.2-1", excel: { sheet: "損益計算書", cell: "B5", unit: "百万円" }, direction: "both", required: true, transform: { round: 2 } },
    { id: "company-sales-previous", target: "companyPL.previous.2-1", excel: { sheet: "損益計算書", cell: "C5", unit: "百万円" }, direction: "both", required: true, transform: { round: 2 } },
    { id: "company-sales-latest", target: "companyPL.latest.2-1", excel: { sheet: "損益計算書", cell: "D5", unit: "百万円" }, direction: "both", required: true, transform: { round: 2 } },
    { id: "bs-assets-pre-previous", target: "balanceSheet.prePrevious.1-1", excel: { sheet: "貸借対照表", cell: "B4", unit: "百万円" }, direction: "both", transform: { round: 2 } },
    { id: "bs-assets-previous", target: "balanceSheet.previous.1-1", excel: { sheet: "貸借対照表", cell: "C4", unit: "百万円" }, direction: "both", transform: { round: 2 } },
    { id: "bs-assets-latest", target: "balanceSheet.latest.1-1", excel: { sheet: "貸借対照表", cell: "D4", unit: "百万円" }, direction: "both", transform: { round: 2 } },
    { id: "capex-base-year", target: "futureCapex.baseYear.1-24", excel: { sheet: "設備投資", cell: "G4", unit: "百万円" }, direction: "both", transform: { round: 2 } },
    { id: "company-sales-base-year", target: "companyPL.baseYear.2-1", excel: { sheet: "損益計算書", cell: "G5", unit: "百万円" }, direction: "both", transform: { round: 2 } },
    { id: "project-sales-base-year", target: "projectPL.baseYear.7-1", excel: { sheet: "補助事業PL", cell: "G5", unit: "百万円" }, direction: "both", transform: { round: 2 } },
  ],
};

const officialSampleSheet = "②補助事業情報";
const officialHistoricalPeriods = [
  { id: "prePrevious", column: "G" },
  { id: "previous", column: "H" },
  { id: "latest", column: "I" },
] as const;
const officialFuturePeriods = [
  { id: "project1", column: "J" },
  { id: "beforeBase", column: "K" },
  { id: "baseYear", column: "L" },
  { id: "report1", column: "M" },
  { id: "report2", column: "N" },
  { id: "report3", column: "O" },
] as const;
const officialSamplePeriods = [...officialHistoricalPeriods, ...officialFuturePeriods];

type OfficialSampleRow = {
  code: string;
  row: number;
  unit: "千円" | "人";
};

const officialCompanyRows: OfficialSampleRow[] = [
  { code: "2-1", row: 53, unit: "千円" },
  { code: "2-3", row: 55, unit: "千円" },
  { code: "2-4", row: 56, unit: "千円" },
  { code: "2-7", row: 59, unit: "千円" },
  { code: "2-9", row: 61, unit: "千円" },
  { code: "2-10", row: 62, unit: "千円" },
  { code: "2-12", row: 64, unit: "千円" },
  { code: "2-13", row: 65, unit: "千円" },
  { code: "2-14", row: 66, unit: "千円" },
  { code: "2-15", row: 67, unit: "千円" },
  { code: "2-18", row: 70, unit: "千円" },
  { code: "2-19", row: 71, unit: "千円" },
  { code: "2-20", row: 72, unit: "千円" },
  { code: "2-27", row: 79, unit: "人" },
  { code: "2-28", row: 80, unit: "人" },
];

const officialProjectRows: OfficialSampleRow[] = [
  { code: "7-1", row: 150, unit: "千円" },
  { code: "7-4", row: 153, unit: "千円" },
  { code: "7-6", row: 155, unit: "千円" },
  { code: "7-8", row: 157, unit: "千円" },
  { code: "7-9", row: 158, unit: "千円" },
  { code: "7-10", row: 159, unit: "千円" },
  { code: "7-13", row: 162, unit: "人" },
  { code: "7-14", row: 163, unit: "人" },
];

const officialBalanceSheetRows: OfficialSampleRow[] = [
  { code: "1-1", row: 20, unit: "千円" },
  { code: "1-2", row: 21, unit: "千円" },
  { code: "1-3", row: 22, unit: "千円" },
  { code: "1-4", row: 23, unit: "千円" },
  { code: "1-5", row: 24, unit: "千円" },
  { code: "1-6", row: 25, unit: "千円" },
  { code: "1-7", row: 26, unit: "千円" },
  { code: "1-8", row: 27, unit: "千円" },
  { code: "1-9", row: 28, unit: "千円" },
  { code: "1-10", row: 29, unit: "千円" },
  { code: "1-13", row: 32, unit: "千円" },
  { code: "1-14", row: 33, unit: "千円" },
  { code: "1-15", row: 34, unit: "千円" },
  { code: "1-16", row: 35, unit: "千円" },
  { code: "1-17", row: 36, unit: "千円" },
  { code: "1-19", row: 38, unit: "千円" },
  { code: "1-20", row: 39, unit: "千円" },
  { code: "1-21", row: 40, unit: "千円" },
  { code: "1-24", row: 43, unit: "千円" },
];

const officialBindings = (
  dataset: "companyPL" | "projectPL",
  rows: OfficialSampleRow[],
): ExcelMappingBinding[] => rows.flatMap((row) =>
  officialSamplePeriods.map((period) => ({
    id: `official-sixth-${dataset}-${period.id}-${row.code}`,
    target: `${dataset}.${period.id}.${row.code}`,
    excel: { sheet: officialSampleSheet, cell: `${period.column}${row.row}`, unit: row.unit },
    direction: "both",
    transform: { round: row.unit === "人" ? 0 : 2 },
  })),
);

const officialBalanceSheetBindings: ExcelMappingBinding[] = officialBalanceSheetRows.flatMap((row) =>
  officialHistoricalPeriods.map((period) => ({
    id: `official-sixth-balanceSheet-${period.id}-${row.code}`,
    target: `balanceSheet.${period.id}.${row.code}`,
    excel: { sheet: officialSampleSheet, cell: `${period.column}${row.row}`, unit: row.unit },
    direction: "both",
    transform: { round: 2 },
  })),
);

export const EXCEL_CONVERSION_SAMPLE_MAPPING: ExcelMappingDefinition = {
  format: EXCEL_MAPPING_FORMAT,
  name: "第6次公式A002・過去3期／将来PL変換サンプル",
  description: "第6次公募の公式A002様式に入力したサンプルです。過去B/S・過去PLを含む①と、③将来データをまとめて取り込めます。",
  bindings: [
    ...officialBalanceSheetBindings,
    ...officialBindings("companyPL", officialCompanyRows),
    ...officialBindings("projectPL", officialProjectRows),
    ...officialFuturePeriods.map((period) => ({
      id: `official-sixth-futureCapex-${period.id}`,
      target: `futureCapex.${period.id}.1-24`,
      excel: { sheet: officialSampleSheet, cell: `${period.column}43`, unit: "千円" as const },
      direction: "both" as const,
      transform: { round: 2 },
    })),
  ],
};

export const EXCEL_MAPPING_COPILOT_PROMPT = `添付したExcelを確認し、添付した「Excelマッピング定義書 作成マニュアル」とJSONサンプルに従って、成長投資計画シミュレーター用のマッピング定義書を作成してください。

要件:
1. 出力は growth-investment-excel-mapping/v1 形式のJSONファイルとしてください。
2. 対象Excelのシート名とセル番地を実際に確認し、計算式セルではなく入力セルを指定してください。
3. 各セルの金額単位と、パーセントがExcel内部で0.05と保持されるか5と保持されるかを確認してください。
4. 空欄と数値の0を区別してください。
5. 読み込みだけなら direction を import、書き出しだけなら export、両方なら both としてください。
6. 対応関係を推測した項目、候補が複数ある項目、対応できない項目は、JSONとは別に一覧で報告してください。
7. 元のExcelは変更しないでください。

最初に、対象Excelで確認できたシート名と候補セルの一覧を示してください。その後に完成したJSONを提示してください。`;

export const EXCEL_MAPPING_MANUAL = `# Excelマッピング定義書 作成マニュアル

## 目的
このシミュレーターと任意形式のExcel（.xlsx / .xlsm）のセルを、JSONのマッピング定義書で結びます。マクロ・書式・数式・非対象セルは保持し、出力時は元ファイルを上書きせず別Excelとして保存します。

## まず変換サンプルを試す
画面の「第6次公式A002サンプル」と「公式対応JSON」を両方ダウンロードしてください。2ファイルをそれぞれ対象Excel・マッピング定義書として選び、取込範囲を「①過去＋③将来データ」、将来PLの入力方式を「ベース事業＋補助事業」にして確認・反映します。
サンプルは第6次公募の公式A002様式を保ったまま、過去B/S、全社PLと補助事業PLの過去3期・将来6期、将来設備投資を入力済みです。会社全体－補助事業の差額が、ツール内のベース事業PLになります。
③では取り込んだ固定値をすぐに確認できます。会計内訳・利益前提が未設定の場合は、③に表示される「過去3期から会計前提を設定」を実行してください。取り込んだ固定値を保ったまま、空欄の自動予測と会計計算が有効になります。

## Copilotへの依頼方法
対象Excel、このマニュアル、JSONサンプルを渡し、次のプロンプトで依頼します。

\`\`\`text
${EXCEL_MAPPING_COPILOT_PROMPT}
\`\`\`

## 定義書の基本形
\`\`\`json
${JSON.stringify(EXCEL_MAPPING_EXAMPLE, null, 2)}
\`\`\`

## target
安定識別子は \`データ区分.期.項目番号\` です。
- データ区分:
  - \`balanceSheet\`: 過去B/S
  - \`futureCapex\`: 将来の1-24 新規設備投資による支出
  - \`companyPL\`: 会社全体PL
  - \`projectPL\`: 補助事業PL
  - \`basePL\`: ベース事業PL
- 過去の期: \`prePrevious\`（前々期）/ \`previous\`（前期）/ \`latest\`（最新決算期）
- 将来の期:
  - \`project1\`～\`project4\`: 基準年前々年以前の補助事業期間（存在する期だけ使用）
  - \`beforeBase\`: 基準年前年
  - \`baseYear\`: 基準年
  - \`report1\`～\`report3\`: 事業化報告1～3年目
- 項目番号:
  - B/S・設備投資: \`1-1\`、\`1-24\`など
  - 会社全体PL: \`2-1\`など
  - 補助事業PL: \`7-1\`など
  - ベース事業PL: \`M2-1\`など

将来PLの数値は手入力固定値として反映し、Excelの空欄は自動予測のまま残します。
\`companyPL\` の将来期は、画面の「将来PLの入力方式（③と共通）」で「全社＋補助事業」か「ベース事業＋補助事業」かを選べます。後者では、同じExcelから取り込んだ \`projectPL\`（未指定項目は現在の補助事業予測）を差し引き、\`basePL\` の固定値へ変換します。この選択は③将来データ入力の方式と相互に同期します。
\`basePL\` の将来期を直接取り込むと「ベース事業PLを入力」へ切り替わります。\`companyPL\` と \`basePL\` を同じ取込定義へ混在させることはできません。\`projectPL\` と \`futureCapex\` はどちらの入力方式でも使用できます。
取込実行前に、画面で「①過去データのみ」または「①過去＋③将来データ」を選択します。初期値は「①過去データのみ」です。
出力では、手入力固定値だけでなく、現在画面に反映されている自動予測・調整後の全社PL、補助事業PL、ベース事業PLも書き出します。

## excel
- sheet: Excelの正確なシート名
- cell: A1形式のセル番地
- unit: raw / 円 / 千円 / 百万円 / 億円 / % / 人 / 年 / 倍
- percentMode: Excel内部値が5%を0.05で保持する場合は \`fraction\`、5で保持する場合は \`display\`

## direction
- import: Excelからシミュレーターへの取込のみ
- export: シミュレーターから別Excelへの出力のみ
- both: 双方向（省略時）

## transform
単位変換後に \`値 × scale + offset\` を適用します。符号を逆転する場合は \`invertSign: true\`、丸めは \`round\` で指定します。

## 安全上の制約
- JSON以外のスクリプトや数式は実行しません。
- 空欄と0は区別します。空欄は変更せず、0は明示的な0として反映します。
- 出力先に数式がある場合は停止します。
- 出力先セルはテンプレート内にあらかじめ存在する必要があります。
- 同じ出力セルを複数定義できません。
- .xls（旧バイナリ形式）は対象外です。.xlsx または .xlsm に変換してください。
`;
