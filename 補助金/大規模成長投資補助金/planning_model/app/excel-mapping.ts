import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const EXCEL_MAPPING_FORMAT = "growth-investment-excel-mapping/v1";

export type ExcelMappingDirection = "import" | "export" | "both";
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
  const style = /\bs="([^"]+)"/.exec(existing[1])?.[1];
  const replacement = `<c r="${address.toUpperCase()}"${style ? ` s="${xmlEncode(style)}"` : ""}><v>${Number.isInteger(value) ? value : String(value)}</v></c>`;
  return xml.replace(pattern, replacement);
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
  name: "任意Excel・過去3期入力例",
  description: "シート名とセル番地を対象Excelに合わせて変更してください。",
  bindings: [
    { id: "company-sales-pre-previous", target: "companyPL.prePrevious.2-1", excel: { sheet: "損益計算書", cell: "B5", unit: "百万円" }, direction: "both", required: true, transform: { round: 2 } },
    { id: "company-sales-previous", target: "companyPL.previous.2-1", excel: { sheet: "損益計算書", cell: "C5", unit: "百万円" }, direction: "both", required: true, transform: { round: 2 } },
    { id: "company-sales-latest", target: "companyPL.latest.2-1", excel: { sheet: "損益計算書", cell: "D5", unit: "百万円" }, direction: "both", required: true, transform: { round: 2 } },
    { id: "bs-assets-pre-previous", target: "balanceSheet.prePrevious.1-1", excel: { sheet: "貸借対照表", cell: "B4", unit: "百万円" }, direction: "both", transform: { round: 2 } },
    { id: "bs-assets-previous", target: "balanceSheet.previous.1-1", excel: { sheet: "貸借対照表", cell: "C4", unit: "百万円" }, direction: "both", transform: { round: 2 } },
    { id: "bs-assets-latest", target: "balanceSheet.latest.1-1", excel: { sheet: "貸借対照表", cell: "D4", unit: "百万円" }, direction: "both", transform: { round: 2 } },
  ],
};

export const EXCEL_MAPPING_MANUAL = `# Excelマッピング定義書 作成マニュアル

## 目的
このシミュレーターと任意形式のExcel（.xlsx / .xlsm）のセルを、JSONのマッピング定義書で結びます。マクロ・書式・数式・非対象セルは保持し、出力時は元ファイルを上書きせず別Excelとして保存します。

## Copilotへの依頼方法
対象Excelとこのマニュアルを渡し、「入力に使う数値セルを確認し、下記形式のJSONを作成してください。計算式セルではなく入力セルを指定し、金額単位とパーセントの格納形式も明記してください」と依頼します。

## 定義書の基本形
\`\`\`json
${JSON.stringify(EXCEL_MAPPING_EXAMPLE, null, 2)}
\`\`\`

## target
安定識別子は \`データ区分.期.第6次様式番号\` です。
- データ区分: \`balanceSheet\` / \`companyPL\` / \`projectPL\`
- 期: \`prePrevious\`（前々期）/ \`previous\`（前期）/ \`latest\`（最新決算期）
- 第6次様式番号: 例 \`1-1\`、\`2-1\`、\`7-1\`

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
