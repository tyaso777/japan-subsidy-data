import { strToU8, zipSync } from 'fflate';
import { buildForecastPl } from './forecast-engine';
import { calculatePlSeries, combinePlInputs } from './financials';
import { applyProgramNumericDefinitions } from './program-pl-definitions';
import { buildProgramPlRows, forecastPlRows } from './rows';
import type { ModelSnapshot } from '../store/model-store';
import { moneyUnitLabel, toDisplayFinancialValue, type MoneyDisplayUnit, type ValueKind } from './value-units';
import type { HistoricalPlCalculated, HistoricalPlInput } from './types';

export type CaseResultRow = {
  code: string;
  label: string;
  kind: ValueKind;
  values: Array<number | null>;
};

export type CaseResultTable = {
  name: string;
  years: number[];
  rows: CaseResultRow[];
};

export type CaseResultReport = {
  title: string;
  unit: MoneyDisplayUnit;
  tables: CaseResultTable[];
};

function timeline(actuals: HistoricalPlInput[], snapshot: ModelSnapshot, scope: 'base' | 'subsidy') {
  const future = buildForecastPl(snapshot.forecast, scope, actuals.at(-1)!);
  const years = [
    ...actuals.map((_record, index) => snapshot.program.timeline.historical.startYear + index),
    ...future.map((record) => record.year),
  ];
  const records = [...calculatePlSeries(actuals), ...future.map((record) => record.calculated)];
  return {
    years,
    records: applyProgramNumericDefinitions(records, years, snapshot.program.definitions.commonNumericDefinitions),
  };
}

function table(name: string, years: number[], records: HistoricalPlCalculated[], snapshot: ModelSnapshot, unit: MoneyDisplayUnit): CaseResultTable {
  const rows = buildProgramPlRows(forecastPlRows, snapshot.program.definitions.commonNumericDefinitions);
  return {
    name,
    years,
    rows: rows.map((row) => ({
      code: row.displayCode ?? row.code,
      label: row.label,
      kind: row.valueKind ?? 'money',
      values: records.map((record, index) => {
        const value = row.calculated ? row.value?.(record, index, records) : row.field ? record[row.field] : null;
        return value === null || value === undefined || !Number.isFinite(Number(value))
          ? null
          : toDisplayFinancialValue(Number(value), row.valueKind ?? 'money', unit);
      }),
    })),
  };
}

export function buildCaseResultReport(snapshot: ModelSnapshot, unit: MoneyDisplayUnit): CaseResultReport {
  const base = timeline(snapshot.actuals.basePl, snapshot, 'base');
  const subsidy = timeline(snapshot.actuals.subsidyPl, snapshot, 'subsidy');
  const companyInputs = base.records.map((record, index) => combinePlInputs(record, subsidy.records[index]));
  const companyRecords = applyProgramNumericDefinitions(calculatePlSeries(companyInputs), base.years, snapshot.program.definitions.commonNumericDefinitions);
  return {
    title: `${snapshot.program.program.name} 個社案件結果`,
    unit,
    tables: [
      table('全社合算 P/L', base.years, companyRecords, snapshot, unit),
      table('ベース事業 P/L', base.years, base.records, snapshot, unit),
      table('補助事業 P/L', subsidy.years, subsidy.records, snapshot, unit),
    ],
  };
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function columnName(index: number) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function inlineCell(reference: string, value: string, style = 0) {
  return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t>${escapeXml(value)}</t></is></c>`;
}

function numericStyle(kind: ValueKind) {
  if (kind === 'percent') return 4;
  if (kind === 'point') return 5;
  if (kind === 'fte' || kind === 'count') return 6;
  if (kind === 'multiple') return 7;
  return 3;
}

function worksheetXml(table: CaseResultTable) {
  const header = ['科目番号', '科目名', ...table.years.map((year) => `${year}年`)];
  const rows = [
    `<row r="1" ht="24" customHeight="1">${header.map((value, index) => inlineCell(`${columnName(index)}1`, value, 1)).join('')}</row>`,
    ...table.rows.map((row, rowIndex) => {
      const excelRow = rowIndex + 2;
      const values = [inlineCell(`A${excelRow}`, row.code, 2), inlineCell(`B${excelRow}`, row.label, 2)];
      row.values.forEach((value, index) => {
        const ref = `${columnName(index + 2)}${excelRow}`;
        values.push(value === null ? `<c r="${ref}" s="${numericStyle(row.kind)}"/>` : `<c r="${ref}" s="${numericStyle(row.kind)}"><v>${value}</v></c>`);
      });
      return `<row r="${excelRow}">${values.join('')}</row>`;
    }),
  ];
  const lastColumn = columnName(header.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${table.rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="11" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/><col min="3" max="${header.length}" width="14" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:${lastColumn}${table.rows.length + 1}"/></worksheet>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="5"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.00&quot;%&quot;"/><numFmt numFmtId="166" formatCode="0.00&quot;pt&quot;"/><numFmt numFmtId="167" formatCode="0.00&quot;人&quot;"/><numFmt numFmtId="168" formatCode="0.00&quot;倍&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Yu Gothic"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF183B56"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD2DBE2"/></left><right style="thin"><color rgb="FFD2DBE2"/></right><top style="thin"><color rgb="FFD2DBE2"/></top><bottom style="thin"><color rgb="FFD2DBE2"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="168" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function createCaseResultXlsx(report: CaseResultReport): Uint8Array {
  const sheetEntries = report.tables.map((table, index) => `<sheet name="${escapeXml(table.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const relationshipEntries = report.tables.map((_table, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${report.tables.map((_table, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationshipEntries}<Relationship Id="rId${report.tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(stylesXml),
  };
  report.tables.forEach((table, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(table)); });
  return zipSync(files, { level: 6 });
}

function formatDisplayValue(value: number | null, kind: ValueKind) {
  if (value === null) return '—';
  const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value);
  if (kind === 'percent') return `${number}%`;
  if (kind === 'point') return `${number}pt`;
  if (kind === 'fte' || kind === 'count') return `${number}人`;
  if (kind === 'multiple') return `${number}倍`;
  return number;
}

export function createCaseResultHtml(report: CaseResultReport): string {
  const sections = report.tables.map((table) => `<section><h2>${escapeXml(table.name)}</h2><div class="scroll"><table><thead><tr><th>科目番号</th><th>科目名</th>${table.years.map((year) => `<th>${year}年</th>`).join('')}</tr></thead><tbody>${table.rows.map((row) => `<tr><td>${escapeXml(row.code)}</td><th>${escapeXml(row.label)}</th>${row.values.map((value) => `<td>${escapeXml(formatDisplayValue(value, row.kind))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(report.title)}</title><style>body{margin:24px;background:#f4f6f7;color:#102a43;font-family:"Yu Gothic",sans-serif}header,section{margin:0 auto 20px;max-width:1500px;background:#fff;border:1px solid #d2dbe2;padding:18px}h1,h2{margin:0 0 8px}.meta{color:#667085}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #d2dbe2;padding:7px 9px;white-space:nowrap}thead th{position:sticky;top:0;background:#183b56;color:#fff}tbody th{text-align:left}td{text-align:right}td:first-child{text-align:left}@media print{body{background:#fff;margin:0}header,section{border:0;break-after:page}}</style></head><body><header><h1>${escapeXml(report.title)}</h1><p class="meta">金額単位：${escapeXml(moneyUnitLabel(report.unit))}</p></header>${sections}</body></html>`;
}
