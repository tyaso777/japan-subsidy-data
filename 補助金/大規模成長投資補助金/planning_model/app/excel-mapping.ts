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
const xmlEncode = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");
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
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const attrs = match[1];
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) relationships.set(id, normalizeZipPath("xl", xmlDecode(target)));
  }
  const sheets = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const attrs = match[1];
    const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
    const relationshipId = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    const path = relationshipId ? relationships.get(relationshipId) : undefined;
    if (name && path) sheets.set(xmlDecode(name), path);
  }
  const sharedStringsXml = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  const sharedStrings = [...sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => xmlDecode(text[1])).join(""),
  );
  return { files, sheets, sharedStrings };
}

function readCell(xml: string, address: string, sharedStrings: string[]): number | string | boolean | null {
  const cell = new RegExp(`<c\\b([^>]*\\br="${address.toUpperCase()}"[^>]*)>([\\s\\S]*?)<\\/c>`, "i").exec(xml);
  if (!cell) return null;
  const type = /\bt="([^"]+)"/.exec(cell[1])?.[1];
  const body = cell[2];
  if (type === "inlineStr") {
    return [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => xmlDecode(match[1])).join("");
  }
  const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
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

const conversionSamplePeriods = [
  { id: "project1", label: "補助事業期間1年目" },
  { id: "beforeBase", label: "基準年前年" },
  { id: "baseYear", label: "基準年" },
  { id: "report1", label: "事業化報告1年目" },
  { id: "report2", label: "事業化報告2年目" },
  { id: "report3", label: "事業化報告3年目" },
] as const;

type ConversionSampleRow = {
  code: string;
  label: string;
  unit: "百万円" | "人";
  values: number[];
};

const conversionCompanyRows: ConversionSampleRow[] = [
  { code: "2-1", label: "売上高", unit: "百万円", values: [3000, 3200, 3400, 3600, 3800, 4000] },
  { code: "2-3", label: "売上原価", unit: "百万円", values: [1800, 1900, 2000, 2100, 2200, 2300] },
  { code: "2-4", label: "うち減価償却費", unit: "百万円", values: [80, 85, 90, 95, 100, 105] },
  { code: "2-7", label: "販売費及び一般管理費", unit: "百万円", values: [700, 740, 780, 820, 860, 900] },
  { code: "2-9", label: "うち役員報酬", unit: "百万円", values: [30, 31, 32, 33, 34, 35] },
  { code: "2-10", label: "うち役員賞与", unit: "百万円", values: [5, 5, 6, 6, 7, 7] },
  { code: "2-12", label: "うち従業員の給与", unit: "百万円", values: [400, 420, 440, 460, 480, 500] },
  { code: "2-13", label: "うち従業員の賞与", unit: "百万円", values: [50, 52, 54, 56, 58, 60] },
  { code: "2-14", label: "うち減価償却費", unit: "百万円", values: [50, 52, 54, 56, 58, 60] },
  { code: "2-15", label: "うち研究開発費", unit: "百万円", values: [30, 32, 34, 36, 38, 40] },
  { code: "2-18", label: "経常利益", unit: "百万円", values: [480, 535, 590, 645, 700, 755] },
  { code: "2-19", label: "税引前当期純利益", unit: "百万円", values: [470, 525, 580, 635, 690, 745] },
  { code: "2-20", label: "当期純利益", unit: "百万円", values: [330, 368, 406, 445, 483, 522] },
  { code: "2-27", label: "常時使用する従業員数", unit: "人", values: [120, 124, 128, 132, 136, 140] },
  { code: "2-28", label: "役員数", unit: "人", values: [6, 6, 6, 6, 6, 6] },
];

const conversionProjectRows: ConversionSampleRow[] = [
  { code: "7-1", label: "売上高", unit: "百万円", values: [500, 600, 700, 800, 900, 1000] },
  { code: "7-4", label: "売上総利益", unit: "百万円", values: [200, 240, 280, 320, 360, 400] },
  { code: "7-6", label: "営業利益", unit: "百万円", values: [60, 80, 100, 120, 140, 160] },
  { code: "7-8", label: "従業員給与支給総額", unit: "百万円", values: [80, 90, 100, 110, 120, 130] },
  { code: "7-9", label: "役員給与支給総額", unit: "百万円", values: [10, 11, 12, 13, 14, 15] },
  { code: "7-10", label: "減価償却費（合計）", unit: "百万円", values: [20, 25, 30, 35, 40, 45] },
  { code: "7-13", label: "常時使用する従業員数", unit: "人", values: [20, 24, 28, 32, 36, 40] },
  { code: "7-14", label: "役員数", unit: "人", values: [2, 2, 2, 2, 2, 2] },
];

const sampleColumn = (index: number) => String.fromCharCode("B".charCodeAt(0) + index);
const conversionBindings = (
  dataset: "companyPL" | "projectPL",
  sheet: string,
  rows: ConversionSampleRow[],
): ExcelMappingBinding[] => rows.flatMap((row, rowIndex) =>
  conversionSamplePeriods.map((period, periodIndex) => ({
    id: `sample-${dataset}-${period.id}-${row.code}`,
    target: `${dataset}.${period.id}.${row.code}`,
    excel: { sheet, cell: `${sampleColumn(periodIndex)}${rowIndex + 4}`, unit: row.unit },
    direction: "both",
    transform: row.unit === "百万円" ? { round: 2 } : { round: 0 },
  })),
);

export const EXCEL_CONVERSION_SAMPLE_MAPPING: ExcelMappingDefinition = {
  format: EXCEL_MAPPING_FORMAT,
  name: "全社将来PLからベース事業へ変換するサンプル",
  description: "同梱のサンプルExcelと組み合わせ、「全社－補助事業をベース事業へ変換」を選んで使用します。",
  bindings: [
    ...conversionBindings("companyPL", "全社PL", conversionCompanyRows),
    ...conversionBindings("projectPL", "補助事業PL", conversionProjectRows),
    ...conversionSamplePeriods.map((period, periodIndex) => ({
      id: `sample-futureCapex-${period.id}`,
      target: `futureCapex.${period.id}.1-24`,
      excel: { sheet: "設備投資", cell: `${sampleColumn(periodIndex)}4`, unit: "百万円" as const },
      direction: "both" as const,
      transform: { round: 2 },
    })),
  ],
};

const sampleInlineCell = (address: string, value: string, style = 0) =>
  `<c r="${address}" t="inlineStr" s="${style}"><is><t>${xmlEncode(value)}</t></is></c>`;
const sampleNumericCell = (address: string, value: number, style = 0) =>
  `<c r="${address}" s="${style}"><v>${value}</v></c>`;
const sampleRowXml = (rowNumber: number, cells: string[]) =>
  `<row r="${rowNumber}">${cells.join("")}</row>`;
const sampleWorksheet = (rows: string[], widths: number[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A2:G${rows.length}"/></worksheet>`;

const samplePlRows = (title: string, rows: ConversionSampleRow[]) => [
  sampleRowXml(1, [sampleInlineCell("A1", title, 1), sampleInlineCell("B1", "金額単位：百万円／人数単位：人", 1)]),
  sampleRowXml(2, [
    sampleInlineCell("A2", "項目", 2),
    ...conversionSamplePeriods.map((period, index) => sampleInlineCell(`${sampleColumn(index)}2`, period.label, 2)),
  ]),
  sampleRowXml(3, [sampleInlineCell("A3", "入力例です。値を変更してマッピング取込・出力を試せます。", 3)]),
  ...rows.map((row, rowIndex) => sampleRowXml(rowIndex + 4, [
    sampleInlineCell(`A${rowIndex + 4}`, `${row.code} ${row.label}（${row.unit}）`),
    ...row.values.map((value, periodIndex) => sampleNumericCell(`${sampleColumn(periodIndex)}${rowIndex + 4}`, value, row.unit === "人" ? 5 : 4)),
  ])),
];

export function buildExcelConversionSampleWorkbook() {
  const sheetNames = ["使い方", "全社PL", "補助事業PL", "設備投資"];
  const instructionRows = [
    sampleRowXml(1, [sampleInlineCell("A1", "任意Excel変換サンプル", 1)]),
    sampleRowXml(2, [sampleInlineCell("A2", "1. このExcelと「任意Excel変換サンプル_マッピング.json」を画面で選択します。")]),
    sampleRowXml(3, [sampleInlineCell("A3", "2. 取込範囲を「①過去＋③将来データ」にします。")]),
    sampleRowXml(4, [sampleInlineCell("A4", "3. 「全社－補助事業をベース事業へ変換」を選び、取込内容を確認して反映します。")]),
    sampleRowXml(5, [sampleInlineCell("A5", "4. 全社PL－補助事業PLがベース事業PLの固定値になります。")]),
    sampleRowXml(7, [sampleInlineCell("A7", "注意：期は年度の絶対値ではなく、補助事業期間・基準年・事業化報告年の相対位置で対応します。", 3)]),
  ];
  const capexRows = [
    sampleRowXml(1, [sampleInlineCell("A1", "将来設備投資", 1), sampleInlineCell("B1", "金額単位：百万円", 1)]),
    sampleRowXml(2, [
      sampleInlineCell("A2", "項目", 2),
      ...conversionSamplePeriods.map((period, index) => sampleInlineCell(`${sampleColumn(index)}2`, period.label, 2)),
    ]),
    sampleRowXml(3, [sampleInlineCell("A3", "設備投資額も同時に取り込めます。", 3)]),
    sampleRowXml(4, [
      sampleInlineCell("A4", "1-24 新規設備投資による支出（百万円）"),
      ...[100, 200, 500, 150, 100, 80].map((value, index) => sampleNumericCell(`${sampleColumn(index)}4`, value, 4)),
    ]),
  ];
  const sheetRows = [
    instructionRows,
    samplePlRows("会社全体の将来PL入力例", conversionCompanyRows),
    samplePlRows("補助事業の将来PL入力例", conversionProjectRows),
    capexRows,
  ];
  const workbookSheets = sheetNames.map((name, index) =>
    `<sheet name="${xmlEncode(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join("");
  const workbookRelationships = sheetNames.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  const contentOverrides = sheetNames.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Yu Gothic"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B52"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CD"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD8D2C4"/></left><right style="thin"><color rgb="FFD8D2C4"/></right><top style="thin"><color rgb="FFD8D2C4"/></top><bottom style="thin"><color rgb="FFD8D2C4"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheetRows.forEach((rows, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sampleWorksheet(rows, index === 0 ? [110] : [48, 20, 20, 20, 20, 20, 20]));
  });
  return zipSync(files, { level: 6 });
}

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
画面の「変換サンプルExcel」と「対応JSON」を両方ダウンロードしてください。2ファイルをそれぞれ対象Excel・マッピング定義書として選び、取込範囲を「①過去＋③将来データ」、全社将来値の反映方法を「全社－補助事業をベース事業へ変換」にして確認・反映します。
サンプルExcelには全社PL、補助事業PL、設備投資の将来6期が入力済みです。会社全体－補助事業の差額が、ツール内のベース事業PLになります。

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
\`companyPL\` の将来期は、画面で「全社PLとして取り込む」か「全社－補助事業をベース事業へ変換」かを選べます。後者では、同じExcelから取り込んだ \`projectPL\`（未指定項目は現在の補助事業予測）を差し引き、\`basePL\` の固定値へ変換します。
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
