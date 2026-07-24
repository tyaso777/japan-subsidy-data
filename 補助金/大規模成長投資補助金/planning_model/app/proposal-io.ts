import { strToU8, unzipSync, zipSync } from "fflate";
import { isSixthRoundReferenceMetric, operatingProfit, total, valueAdded, type BalanceSheetPlan, type Drivers, type MetricKey, type SegmentPlan, type Target, type TimelineSettings, type YearPlan } from "./model";
import { buildBalanceSheetRows, buildCompanyPlRows, buildDiagnosticGroups, buildProjectPlRows, periodLabels, type ReportRow } from "./report-data";
import { hasInputValue, inputKey, type InputValues } from "./input-values";
import { type MetricGroupBasis, type MetricGroupKey } from "./metric-groups";
import { applicationCategoryLabels, defaultApplicationCategory, driverRequirementLabel, metricRequirementLabel, type ApplicationCategory } from "./application-rules";
import { niceChartScale } from "./chart-scale";

export const PROPOSAL_FORMAT = "growth-investment-proposal/v1";

export type ProposalData = {
  format: typeof PROPOSAL_FORMAT;
  title: string;
  exportedAt: string;
  timeline: TimelineSettings;
  historicalPlan: YearPlan[];
  balanceSheets: BalanceSheetPlan[];
  futureCapex: { year: number; value: number }[];
  drivers: Drivers;
  /** Optional saved optimization result. `drivers` remains the pre-optimization planning input. */
  adjustedDrivers?: Drivers;
  driverRanges: Record<keyof Drivers, [number, number]>;
  targets: Record<MetricKey, Target>;
  forecastOverrides: Record<string, number>;
  futureInputBasis: "company" | "other";
  /** Optional for compatibility with proposal files created before null/zero separation. */
  inputValues?: InputValues;
  metricGroupBases?: Record<MetricGroupKey, MetricGroupBasis>;
  /** Optional for compatibility with files created before sixth-round application categories. */
  applicationCategory?: ApplicationCategory;
};

export type ProposalExportContext = {
  proposal: ProposalData;
  effectivePlan: YearPlan[];
  metricRows: { key: MetricKey; label: string; round6Formula: string; unit: string; actual: number; target: number; max?: number; policy: string }[];
};

const xmlEscape = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const htmlEscape = (value: unknown) => xmlEscape(value);

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const columnName = (column: number) => {
  let value = column;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

const inlineCell = (reference: string, value: unknown, style = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
};

const worksheet = (rows: string[], widths: number[], freezeRows = 2) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${columnName(widths.length)}${Math.max(1, rows.length)}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0">${freezeRows ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : ""}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>
  <sheetData>${rows.join("")}</sheetData>
</worksheet>`;

const rowXml = (row: number, values: unknown[], style: "normal" | "header" | "title" | "emphasis" = "normal") => {
  const styleId = style === "header" ? 1 : style === "title" ? 3 : style === "emphasis" ? 4 : undefined;
  return `<row r="${row}">${values.map((value, index) => inlineCell(`${columnName(index + 1)}${row}`, value, styleId ?? (typeof value === "number" ? 2 : 0))).join("")}</row>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="10"/><name val="Yu Gothic"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Yu Gothic"/></font><font><b/><color rgb="FF173D2D"/><sz val="14"/><name val="Yu Gothic"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF244A3A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F0EA"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFC9D2CD"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const roleLabels: Record<string, string> = { prePrevious: "前々期決算期", previous: "前期決算期", latest: "最新決算期", projectPeriod: "補助事業期間", beforeBase: "基準年前年／補助事業期間", base: "基準年（完了年度）", report1: "事業化報告1年目", report2: "事業化報告2年目", report3: "事業化報告3年目" };
const driverNames: Partial<Record<keyof Drivers, string>> = {
  projectCogsRateWhenSalesZero: "補助事業 原価率（売上実績が0の場合の開始水準）",
  otherCogsRateWhenSalesZero: "ベース事業 原価率（売上実績が0の場合の開始水準）",
  projectEmployeeSalaryShare: "補助事業 従業員給与総額に占める給与の割合",
  otherEmployeeSalaryShare: "ベース事業 従業員給与総額に占める給与の割合",
  projectOfficerCompensationShare: "補助事業 役員給与総額に占める役員報酬の割合",
  otherOfficerCompensationShare: "ベース事業 役員給与総額に占める役員報酬の割合",
  projectCogsDepreciationShare: "補助事業 減価償却費のうち売上原価に含める割合",
  otherCogsDepreciationShare: "ベース事業 減価償却費のうち売上原価に含める割合",
  projectResearchDevelopmentRate: "補助事業 研究開発費の売上高比率",
  otherResearchDevelopmentRate: "ベース事業 研究開発費の売上高比率",
  projectNonOperatingRate: "補助事業 営業外損益の売上高比率",
  otherNonOperatingRate: "ベース事業 営業外損益の売上高比率",
  projectExtraordinaryRate: "補助事業 特別損益の売上高比率",
  otherExtraordinaryRate: "ベース事業 特別損益の売上高比率",
  effectiveTaxRate: "実効税率（当期純利益割合＝100%－実効税率）",
  otherOfficerPayGrowthToBase: "ベース事業 役員1人当たり給与支給総額上昇率（設備導入期間）",
  otherOfficerPayGrowth: "ベース事業 役員1人当たり給与支給総額上昇率（基準年度後）",
  projectMarketGrowth: "7-20 市場伸び率（年あたり）", projectSalesGrowthToBase: "補助事業 売上成長率（設備導入期間）", projectCogsImprovementToBase: "補助事業 原価率改善ポイント（設備導入期間）", projectPayGrowthToBase: "補助事業 1人当たり給与支給総額上昇率（設備導入期間）", projectHeadcountGrowthToBase: "補助事業 常時使用する従業員数の成長率（設備導入期間）", projectSgaImprovementToBase: "補助事業 その他販管費率改善ポイント（設備導入期間）", projectOfficerPayGrowthToBase: "役員1人当たり給与支給総額上昇率（設備導入期間）", otherSalesGrowthToBase: "ベース事業 売上成長率（設備導入期間）", otherCogsImprovementToBase: "ベース事業 原価率改善ポイント（設備導入期間）", otherPayGrowthToBase: "ベース事業1人当たり給与支給総額の年平均上昇率（設備導入期間）", otherHeadcountGrowthToBase: "ベース事業 常時使用する従業員数の成長率（設備導入期間）", otherSgaImprovementToBase: "ベース事業 その他販管費率改善ポイント（設備導入期間）", projectSalesGrowth: "補助事業 売上成長率（基準年度後）", otherSalesGrowth: "ベース事業 売上成長率（基準年度後）", projectCogsImprovementAfterBase: "補助事業 原価率改善ポイント（基準年度後）", otherCogsImprovement: "ベース事業 原価率改善ポイント（基準年度後）", projectPayGrowth: "補助事業1人当たり給与支給総額の年平均上昇率", otherPayGrowth: "ベース事業1人当たり給与支給総額の年平均上昇率（基準年度後）", projectHeadcountGrowth: "補助事業 常時使用する従業員数の成長率", otherHeadcountGrowth: "ベース事業 常時使用する従業員数の成長率（基準年度後）", projectSgaRateEnd: "補助事業 その他販管費率（事業化報告3年目）", otherSgaRateEnd: "ベース事業 その他販管費率（事業化報告3年目）", projectOfficerPayGrowth: "役員1人当たり給与支給総額の年平均上昇率", investment: "補助事業投資額", subsidy: "申請補助金額", localBenchmark: "ローカルベンチマーク",
};
const hiddenLegacyDriverKeys = new Set<keyof Drivers>([
  "projectCogsDepreciationShare",
  "otherCogsDepreciationShare",
]);

const fixedOutputDriverKeys = new Set<keyof Drivers>([
  "investment", "subsidy", "projectMarketGrowth",
  "projectCogsRateWhenSalesZero", "otherCogsRateWhenSalesZero",
  "projectEmployeeSalaryShare", "otherEmployeeSalaryShare",
  "projectOfficerCompensationShare", "otherOfficerCompensationShare",
  "projectCogsDepreciationShare", "otherCogsDepreciationShare",
  "projectResearchDevelopmentRate", "otherResearchDevelopmentRate",
  "projectNonOperatingRate", "otherNonOperatingRate",
  "projectExtraordinaryRate", "otherExtraordinaryRate", "effectiveTaxRate",
  "otherOfficerPayGrowthToBase", "otherOfficerPayGrowth",
]);

const display = (value: number | undefined, unit: string) => value === undefined || !Number.isFinite(value) ? "—" : `${value.toLocaleString("ja-JP", { maximumFractionDigits: unit === "億円/人" ? 3 : 2, minimumFractionDigits: 0 })}${unit ? ` ${unit}` : ""}`;
const htmlPeriodHeader = (plan: YearPlan[]) => plan.map((row) => `<th>${row.year}<small>${htmlEscape(roleLabels[row.role] ?? row.role)}</small></th>`).join("");
const htmlReportRows = (rows: ReportRow[]) => rows.map((row) => `<tr class="${row.emphasis ? "emphasis" : ""}"><th>${row.code} ${htmlEscape(row.label)}<small>${htmlEscape(row.unit)}</small></th>${row.values.map((value) => `<td>${display(value, row.unit)}</td>`).join("")}</tr>`).join("");
const htmlSection = (title: string, columns: string, rows: string, note = "") => `<section class="table-section"><h2>${htmlEscape(title)}</h2><div class="table-wrap"><table><thead><tr>${columns}</tr></thead><tbody>${rows}</tbody></table></div>${note ? `<p class="note">${htmlEscape(note)}</p>` : ""}</section>`;

type HtmlChartSeries = {
  label: string;
  color: string;
  values: (number | undefined)[];
};

const htmlTrendChart = (title: string, subtitle: string, unit: string, plan: YearPlan[], series: HtmlChartSeries[]) => {
  const width = 720;
  const height = 270;
  const margin = { top: 22, right: 22, bottom: 42, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const latestIndex = Math.max(0, plan.findIndex((row) => row.role === "latest"));
  const baseIndex = plan.findIndex((row) => row.role === "base");
  const finiteValues = series.flatMap((item) => item.values).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const scale = niceChartScale(finiteValues, { zeroBaseline: true });
  const minValue = scale.min;
  const maxValue = scale.max;
  const span = maxValue > minValue ? maxValue - minValue : 1;
  const x = (index: number) => margin.left + (plan.length === 1 ? plotWidth / 2 : plotWidth * index / (plan.length - 1));
  const y = (value: number) => margin.top + plotHeight * (1 - (value - minValue) / span);
  const pathFor = (values: (number | undefined)[], start: number, end: number) => {
    let open = false;
    return values.slice(start, end + 1).map((value, offset) => {
      if (value === undefined || !Number.isFinite(value)) {
        open = false;
        return "";
      }
      const command = open ? "L" : "M";
      open = true;
      return `${command}${x(start + offset).toFixed(1)},${y(value).toFixed(1)}`;
    }).join(" ");
  };
  const axisLabel = (value: number) => value.toLocaleString("ja-JP", { minimumFractionDigits: scale.decimals, maximumFractionDigits: scale.decimals });
  const grids = [...scale.ticks].reverse().map((gridValue) => {
    const gridY = y(gridValue);
    return `<g><line class="chart-gridline" x1="${margin.left}" y1="${gridY}" x2="${width - margin.right}" y2="${gridY}"/><text class="chart-axis-label" x="${margin.left - 9}" y="${gridY + 4}" text-anchor="end">${htmlEscape(axisLabel(gridValue))}</text></g>`;
  }).join("");
  const lines = series.map((item) => `<g><path class="chart-line actual" d="${pathFor(item.values, 0, latestIndex)}" stroke="${item.color}"/><path class="chart-line forecast" d="${pathFor(item.values, latestIndex, plan.length - 1)}" stroke="${item.color}"/>${item.values.map((value, index) => value === undefined || !Number.isFinite(value) ? "" : `<circle class="chart-point ${index <= latestIndex ? "actual" : "forecast"}" cx="${x(index)}" cy="${y(value)}" r="3.3" stroke="${item.color}" fill="${index <= latestIndex ? item.color : "#fff"}"/>`).join("")}</g>`).join("");
  const years = plan.map((row, index) => `<text class="chart-year" x="${x(index)}" y="${height - 15}" text-anchor="middle">${row.year}</text>`).join("");
  const legend = series.map((item) => {
    const lastValue = [...item.values].reverse().find((value) => value !== undefined && Number.isFinite(value));
    return `<span><i style="background:${item.color}"></i>${htmlEscape(item.label)}<strong>${lastValue === undefined ? "—" : display(lastValue, "")}</strong></span>`;
  }).join("");
  return `<article class="chart-card"><div class="chart-title"><div><h3>${htmlEscape(title)}</h3><p>${htmlEscape(subtitle)}</p></div><span>${htmlEscape(unit)}</span></div><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${htmlEscape(`${title}の年度推移。実線は過去実績、破線は将来予測。`)}"><rect class="chart-future-area" x="${x(latestIndex)}" y="${margin.top}" width="${Math.max(0, width - margin.right - x(latestIndex))}" height="${plotHeight}"/>${grids}${baseIndex >= 0 ? `<g><line class="chart-base-line" x1="${x(baseIndex)}" y1="${margin.top}" x2="${x(baseIndex)}" y2="${margin.top + plotHeight}"/><text class="chart-boundary-label" x="${x(baseIndex)}" y="${margin.top + 12}" text-anchor="middle">基準年</text></g>` : ""}<text class="chart-boundary-label" x="${x(latestIndex) + 7}" y="${margin.top + plotHeight - 8}">予測</text>${lines}${years}</svg><div class="chart-legend">${legend}</div></article>`;
};

const htmlDiagnosticCharts = (plan: YearPlan[]) => {
  const company = plan.map((row) => total(row.project, row.other));
  const chartRate = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : undefined;
  const perEmployee = (segment: SegmentPlan) => segment.headcount ? segment.employeePay / segment.headcount : undefined;
  const productivity = (segment: SegmentPlan) => segment.headcount + segment.officerCount ? valueAdded(segment) / (segment.headcount + segment.officerCount) : undefined;
  const latestIndex = Math.max(0, plan.findIndex((row) => row.role === "latest"));
  const indexed = (values: (number | undefined)[]) => {
    const base = values[latestIndex];
    return base && Number.isFinite(base) ? values.map((value) => value === undefined ? undefined : value / base * 100) : values.map(() => undefined);
  };
  const colors = { company: "#1f6f54", project: "#d88b15", other: "#56738f" };
  const charts = [
    htmlTrendChart("売上高", "全社と事業別の規模・成長ペース", "億円", plan, [
      { label: "全社", color: colors.company, values: company.map((segment) => segment.sales) },
      { label: "補助事業", color: colors.project, values: plan.map((row) => row.project.sales) },
      { label: "ベース事業", color: colors.other, values: plan.map((row) => row.other.sales) },
    ]),
    htmlTrendChart("収益性（全社）", "原価・その他販管費・営業利益の率", "%", plan, [
      { label: "売上原価率", color: colors.project, values: company.map((segment) => chartRate(segment.cogs, segment.sales)) },
      { label: "その他販管費率", color: colors.other, values: company.map((segment) => chartRate(segment.otherSga, segment.sales)) },
      { label: "営業利益率", color: colors.company, values: company.map((segment) => chartRate(operatingProfit(segment), segment.sales)) },
    ]),
    htmlTrendChart("人員・1人当たり給与", "最新決算期を100とした全社指数", "指数", plan, [
      { label: "従業員数", color: colors.other, values: indexed(company.map((segment) => segment.headcount)) },
      { label: "従業員1人当たり給与", color: colors.company, values: indexed(company.map(perEmployee)) },
    ]),
    htmlTrendChart("労働生産性", "付加価値額÷（従業員数＋役員数）", "億円/人", plan, [
      { label: "全社", color: colors.company, values: company.map(productivity) },
      { label: "補助事業", color: colors.project, values: plan.map((row) => productivity(row.project)) },
      { label: "ベース事業", color: colors.other, values: plan.map((row) => productivity(row.other)) },
    ]),
  ].join("");
  return `<section class="chart-section"><h2>主要指標の推移チャート</h2><p class="chart-intro">過去実績から将来予測へのつながり、基準年の段差、事業間の乖離を視覚的に確認します。</p><div class="chart-grid">${charts}</div><p class="chart-note"><span class="solid-sample"></span>実線：過去実績 <span class="dash-sample"></span>破線：将来予測</p></section>`;
};

function reportParts(context: ProposalExportContext) {
  const { proposal, effectivePlan } = context;
  const historical = effectivePlan.slice(0, proposal.balanceSheets.length);
  return {
    periods: periodLabels(effectivePlan),
    balancePeriods: periodLabels(historical),
    balanceRows: buildBalanceSheetRows(proposal.balanceSheets, historical),
    companyRows: buildCompanyPlRows(effectivePlan),
    projectRows: buildProjectPlRows(effectivePlan, proposal.drivers.projectMarketGrowth),
    diagnostics: buildDiagnosticGroups(effectivePlan, proposal.balanceSheets, proposal.futureCapex),
  };
}

const proposalInput = (proposal: ProposalData, key: string, legacyValue: number | undefined) =>
  proposal.inputValues
    ? hasInputValue(proposal.inputValues, key) ? proposal.inputValues[key] : undefined
    : legacyValue;

const inputAuditRows = (proposal: ProposalData) =>
  Object.entries(proposal.inputValues ?? {}).sort(([left], [right]) => left.localeCompare(right, "ja"));

const proposalHtmlStyles = `
:root{--ink:#173126;--muted:#607169;--green:#244a3a;--soft:#e7f0ea;--line:#d7dfda;--paper:#f7f5ef;--sans:"Hiragino Sans","Yu Gothic UI","Noto Sans JP",system-ui,sans-serif;--serif:"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP",Georgia,serif}
*{box-sizing:border-box}
html{scroll-padding-top:74px}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans)}
.report{max-width:1500px;margin:auto;padding:42px 34px 96px}
.cover{padding:30px 34px;background:var(--green);color:#fff;border-radius:18px}
.cover h1{margin:5px 0 12px;font-family:var(--serif);font-size:32px;font-weight:600;letter-spacing:.01em}
.cover p{margin:0;color:#dbe8e1}
.meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:20px;font-size:13px}
section{position:relative;margin-top:26px;padding:24px;background:#fff;border:1px solid var(--line);border-radius:14px;page-break-inside:avoid}
section>h2{position:sticky;top:0;z-index:30;margin:-1px -1px 15px;padding:13px 1px 11px;background:#fff;border-bottom:1px solid var(--line);font-family:var(--serif);font-size:22px;font-weight:600;letter-spacing:.01em}
.table-wrap{max-width:100%;overflow-x:auto;overflow-y:visible;scrollbar-width:none}
.table-wrap::-webkit-scrollbar{height:0}
table{border-collapse:separate;border-spacing:0;width:100%;min-width:max-content;font-size:12px}
th,td{padding:9px 11px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;background:#fff}
th:first-child{text-align:left}
tbody th:first-child{position:sticky;left:0;z-index:4;min-width:250px;max-width:430px;white-space:normal;background:#fff}
thead th{background:var(--green);color:#fff}
thead th:first-child{position:sticky;left:0;z-index:6;min-width:250px}
.emphasis th,.emphasis td{background:var(--soft);font-weight:700}
.emphasis th:first-child{background:var(--soft)}
small{display:block;font-weight:400;color:inherit;opacity:.75;margin-top:2px}
.copy{min-width:260px;white-space:normal;text-align:left;line-height:1.5}
.diagnostic-value{display:block;min-width:105px}
.diagnostic-value small{display:inline;margin-right:8px}
.note{color:var(--muted);font-size:11px;line-height:1.6}
.sticky-table-header{position:fixed;z-index:29;display:none;overflow:hidden;background:var(--green);box-shadow:0 2px 5px rgba(23,49,38,.16);pointer-events:none}
.sticky-table-header.is-visible{display:block}
.sticky-table-header-scroll{width:100%;overflow:hidden}
.sticky-table-header table{margin:0}
.sticky-table-header th{border-bottom:0}
.floating-table-scrollbar{position:fixed;bottom:0;z-index:60;display:none;height:18px;overflow-x:auto;overflow-y:hidden;background:#f1eee5;border:1px solid #c8c6bf;border-radius:9px 9px 0 0;box-shadow:0 -2px 7px rgba(23,49,38,.14)}
.floating-table-scrollbar.is-visible{display:block}
.floating-table-scrollbar-inner{height:1px}
.chart-section{padding-bottom:28px}
.chart-intro{margin:-5px 0 20px;color:var(--muted);font-size:13px}
.chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.chart-card{min-width:0;padding:18px;border:1px solid var(--line);border-radius:12px;background:#fcfdfa}
.chart-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.chart-title h3{margin:0;font-size:16px}
.chart-title p{margin:4px 0 0;color:var(--muted);font-size:11px}
.chart-title>span{color:var(--muted);font-size:11px;white-space:nowrap}
.chart-svg{display:block;width:100%;height:auto;margin-top:8px;overflow:visible}
.chart-future-area{fill:#f0f4f1}
.chart-gridline{stroke:#d7dfda;stroke-width:1}
.chart-base-line{stroke:#8da397;stroke-width:1.2;stroke-dasharray:3 4}
.chart-axis-label,.chart-year,.chart-boundary-label{fill:#607169;font-size:10px}
.chart-line{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.chart-line.forecast{stroke-dasharray:7 5}
.chart-point{stroke-width:2}
.chart-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:5px;color:var(--muted);font-size:11px}
.chart-legend span{display:flex;align-items:center;gap:5px}
.chart-legend i{display:inline-block;width:9px;height:9px;border-radius:50%}
.chart-legend strong{color:var(--ink);font-variant-numeric:tabular-nums}
.chart-note{margin:16px 0 0;color:var(--muted);font-size:11px}
.solid-sample,.dash-sample{display:inline-block;width:25px;margin:0 6px 3px 12px;border-top:2px solid var(--green);vertical-align:middle}
.dash-sample{border-top-style:dashed}
@media(max-width:820px){
  .report{padding:18px 12px 80px}
  .cover{padding:22px 20px;border-radius:12px}
  .cover h1{font-size:25px}
  section{padding:14px 12px}
  section>h2{font-size:18px}
  .chart-grid{grid-template-columns:1fr}
  tbody th:first-child,thead th:first-child{min-width:210px;max-width:280px}
}
@media print{
  body{background:#fff}
  .report{max-width:none;padding:0}
  .cover{border-radius:0}
  section{border:0;border-radius:0;padding:16px 0;page-break-before:always}
  section>h2{position:static}
  .table-wrap{overflow:visible}
  table{font-size:8px;min-width:0}
  tbody th:first-child,thead th:first-child{position:static;min-width:0}
  .sticky-table-header,.floating-table-scrollbar{display:none!important}
  .chart-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;

const proposalHtmlInteractionScript = `
(() => {
  const wrappers = Array.from(document.querySelectorAll(".table-wrap"));
  if (!wrappers.length) return;
  const sticky = document.createElement("div");
  sticky.className = "sticky-table-header";
  const stickyScroll = document.createElement("div");
  stickyScroll.className = "sticky-table-header-scroll";
  sticky.appendChild(stickyScroll);
  document.body.appendChild(sticky);
  const floating = document.createElement("div");
  floating.className = "floating-table-scrollbar";
  const floatingInner = document.createElement("div");
  floatingInner.className = "floating-table-scrollbar-inner";
  floating.appendChild(floatingInner);
  document.body.appendChild(floating);
  let stickyWrapper = null;
  let floatingWrapper = null;
  let syncing = false;

  const tableNeedsHorizontalScroll = (wrapper) => wrapper.scrollWidth > wrapper.clientWidth + 2;
  const setHeaderWidths = (source, clone) => {
    const sourceCells = source.querySelectorAll("th");
    const cloneCells = clone.querySelectorAll("th");
    sourceCells.forEach((cell, index) => {
      const width = cell.getBoundingClientRect().width;
      if (cloneCells[index]) {
        cloneCells[index].style.width = width + "px";
        cloneCells[index].style.minWidth = width + "px";
        cloneCells[index].style.maxWidth = width + "px";
      }
    });
  };
  const mountStickyHeader = (wrapper) => {
    const table = wrapper.querySelector("table");
    const head = table && table.querySelector("thead");
    if (!table || !head) return;
    const cloneTable = document.createElement("table");
    cloneTable.style.width = table.scrollWidth + "px";
    const cloneHead = head.cloneNode(true);
    cloneTable.appendChild(cloneHead);
    stickyScroll.replaceChildren(cloneTable);
    setHeaderWidths(head, cloneHead);
    stickyWrapper = wrapper;
  };
  const visibleOverflowWrapper = () => {
    const candidates = wrappers.filter((wrapper) => {
      const rect = wrapper.getBoundingClientRect();
      return tableNeedsHorizontalScroll(wrapper) && rect.bottom > 24 && rect.top < window.innerHeight - 18;
    });
    if (!candidates.length) return null;
    return candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftDistance = Math.abs(Math.max(leftRect.top, 0));
      const rightDistance = Math.abs(Math.max(rightRect.top, 0));
      return leftDistance - rightDistance;
    })[0];
  };
  const update = () => {
    let activeHeader = null;
    for (const wrapper of wrappers) {
      const section = wrapper.closest(".table-section");
      const title = section && section.querySelector(":scope > h2");
      const head = wrapper.querySelector("thead");
      const table = wrapper.querySelector("table");
      if (!section || !title || !head || !table) continue;
      const titleRect = title.getBoundingClientRect();
      const headRect = head.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      if (headRect.top < titleRect.bottom && tableRect.bottom > titleRect.bottom + headRect.height) activeHeader = { wrapper, titleRect, headRect };
    }
    if (activeHeader) {
      if (stickyWrapper !== activeHeader.wrapper) mountStickyHeader(activeHeader.wrapper);
      const rect = activeHeader.wrapper.getBoundingClientRect();
      sticky.style.left = Math.max(0, rect.left) + "px";
      sticky.style.width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(0, rect.left)) + "px";
      sticky.style.top = activeHeader.titleRect.bottom + "px";
      stickyScroll.scrollLeft = activeHeader.wrapper.scrollLeft;
      sticky.classList.add("is-visible");
    } else {
      sticky.classList.remove("is-visible");
      stickyWrapper = null;
    }

    const nextFloating = visibleOverflowWrapper();
    if (nextFloating) {
      const rect = nextFloating.getBoundingClientRect();
      floatingWrapper = nextFloating;
      floating.style.left = Math.max(0, rect.left) + "px";
      floating.style.width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(0, rect.left)) + "px";
      floatingInner.style.width = nextFloating.scrollWidth + "px";
      if (!syncing) floating.scrollLeft = nextFloating.scrollLeft;
      floating.classList.add("is-visible");
    } else {
      floating.classList.remove("is-visible");
      floatingWrapper = null;
    }
  };
  wrappers.forEach((wrapper) => wrapper.addEventListener("scroll", () => {
    if (!syncing && floatingWrapper === wrapper) {
      syncing = true;
      floating.scrollLeft = wrapper.scrollLeft;
      syncing = false;
    }
    if (stickyWrapper === wrapper) stickyScroll.scrollLeft = wrapper.scrollLeft;
  }, { passive: true }));
  floating.addEventListener("scroll", () => {
    if (!floatingWrapper || syncing) return;
    syncing = true;
    floatingWrapper.scrollLeft = floating.scrollLeft;
    if (stickyWrapper === floatingWrapper) stickyScroll.scrollLeft = floating.scrollLeft;
    syncing = false;
  }, { passive: true });
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", () => {
    stickyWrapper = null;
    update();
  }, { passive: true });
  new ResizeObserver(update).observe(document.documentElement);
  update();
})();
`;

export function buildProposalHtml({ proposal, effectivePlan, metricRows }: ProposalExportContext) {
  const payload = encodeBase64(JSON.stringify(proposal));
  const parts = reportParts({ proposal, effectivePlan, metricRows });
  const planHeader = htmlPeriodHeader(effectivePlan);
  const balanceHeader = htmlPeriodHeader(effectivePlan.slice(0, proposal.balanceSheets.length));
  const category = proposal.applicationCategory ?? defaultApplicationCategory;
  const categoryLabel = category ? applicationCategoryLabels[category] : "未選択";
  const metricBody = metricRows.map((row) => row.key === "localBenchmark"
    ? `<tr><th>${htmlEscape(row.label)}<small>第6次定義：${htmlEscape(row.round6Formula)}</small></th><td>${display(proposalInput(proposal, inputKey.driver("localBenchmark"), row.actual), row.unit)}</td><td>—</td><td>—</td><td>固定入力・判定対象外</td></tr>`
    : isSixthRoundReferenceMetric(row.key)
      ? `<tr><th>${htmlEscape(row.label)}<small>第6次定義：${htmlEscape(row.round6Formula)}</small><small>第6次評価対象外・参考値</small></th><td>${display(row.actual, row.unit)}</td><td>—</td><td>—</td><td>参考値・判定対象外</td></tr>`
    : (() => { const target = proposalInput(proposal, inputKey.target(row.key, "value"), row.target); const achieved = target === undefined ? "目標未設定" : row.actual >= target ? "目標達成" : "目標未達"; return `<tr><th>${htmlEscape(row.label)}<small>第6次定義：${htmlEscape(row.round6Formula)}</small></th><td>${Number.isFinite(row.actual) ? row.actual.toFixed(2) : "—"} ${htmlEscape(row.unit)}</td><td>${htmlEscape(metricRequirementLabel(row.key, category))}</td><td>${display(target, row.unit)}</td><td>${achieved}</td></tr>`; })()).join("");
  const diagnosticSections = parts.diagnostics.map((group) => htmlSection(`基本指標による妥当性チェック｜${group.title}`, `<th>指標名</th><th>計算式</th><th>主な確認点</th>${planHeader}`, group.rows.map((row) => `<tr><th>${htmlEscape(row.name)}<small>${htmlEscape(row.unit)}</small></th><td class="copy">${htmlEscape(row.formula)}</td><td class="copy">${htmlEscape(row.check)}</td>${row.values.map((period) => `<td>${period.map((entry) => `<span class="diagnostic-value"><small>${htmlEscape(entry.label)}</small>${display(entry.value, row.unit)}</span>`).join("")}</td>`).join("")}</tr>`).join(""))).join("");
  const diagnosticCharts = htmlDiagnosticCharts(effectivePlan);
  const auditRows = inputAuditRows(proposal).map(([key, value]) => `<tr><th>${htmlEscape(key)}</th><td>${display(value, "")}</td><td>${value === 0 ? "明示的な0" : "入力済み"}</td><td>—</td><td>—</td></tr>`).join("");
  const driverRows = (Object.keys(proposal.drivers) as (keyof Drivers)[]).filter((key) => key !== "localBenchmark" && !hiddenLegacyDriverKeys.has(key)).map((key) => { const percent = !["investment", "subsidy"].includes(key); const factor = percent ? 100 : 1; const range = fixedOutputDriverKeys.has(key) ? undefined : proposal.driverRanges[key]; const value = proposalInput(proposal, inputKey.driver(key), proposal.drivers[key]); const lower = range ? proposalInput(proposal, inputKey.driverRange(key, 0), range[0]) : undefined; const upper = range ? proposalInput(proposal, inputKey.driverRange(key, 1), range[1]) : undefined; return `<tr><th>${htmlEscape(driverNames[key] ?? key)}</th><td>${display(value === undefined ? undefined : value * factor, percent ? "%" : "億円")}</td><td>${htmlEscape(driverRequirementLabel(key, category, proposal.drivers.investment))}</td><td>${display(lower === undefined ? undefined : lower * factor, percent ? "%" : "")}</td><td>${display(upper === undefined ? undefined : upper * factor, percent ? "%" : "")}</td></tr>`; }).join("") + `<tr class="emphasis"><th colspan="5">入力データ監査（一覧にないキーは未設定／Null）</th></tr>${auditRows}`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(proposal.title)}</title><style>${proposalHtmlStyles}</style></head><body><main class="report"><header class="cover"><p>大規模成長投資補助金 6次公募対応</p><h1>${htmlEscape(proposal.title)}</h1><p>入力実績、将来計画、目標、妥当性診断を一体で整理した提案計画書</p><div class="meta"><span>申請区分 ${htmlEscape(categoryLabel)}</span><span>最新決算期 ${proposal.timeline.latestYear}</span><span>基準年度 ${proposal.timeline.baseYear}</span><span>出力日時 ${htmlEscape(proposal.exportedAt)}</span></div></header>${htmlSection("15指標・目標", "<th>指標・第6次定義</th><th>計画値</th><th>制度上の必須条件</th><th>目標値</th><th>判定</th>", metricBody)}${htmlSection("1-1～1-25 貸借対照表等（入力結果）", `<th>第6次様式項目</th>${balanceHeader}`, htmlReportRows(parts.balanceRows))}${htmlSection("会社全体にかかる損益計算書（P/L）", `<th>第6次様式項目</th>${planHeader}`, htmlReportRows(parts.companyRows))}${htmlSection("補助事業にかかる収支計画", `<th>第6次様式項目</th>${planHeader}`, htmlReportRows(parts.projectRows))}${diagnosticCharts}${diagnosticSections}${htmlSection("将来予測・調整水準", "<th>調整項目</th><th>計画初期値</th><th>制度上の必須条件</th><th>許容下限</th><th>許容上限</th>", driverRows)}<p class="note">このファイルは「成長投資計画シミュレーター（Ver. 大規模成長投資補助金 6次公募）」に再取込できます。</p><script id="growth-proposal-data" type="application/json">${payload}</script><script>${proposalHtmlInteractionScript}</script></main></body></html>`;
}

export function buildProposalXlsx({ proposal, effectivePlan, metricRows }: ProposalExportContext) {
  const parts = reportParts({ proposal, effectivePlan, metricRows });
  const category = proposal.applicationCategory ?? defaultApplicationCategory;
  const reportSheet = (title: string, periods: string[], rows: ReportRow[]) => [
    rowXml(1, [title, ...Array(periods.length).fill("")], "title"),
    rowXml(2, ["第6次様式項目", ...periods], "header"),
    ...rows.map((item, index) => rowXml(index + 3, [`${item.code} ${item.label}（${item.unit}）`, ...item.values], item.emphasis ? "emphasis" : "normal")),
  ];
  const summaryRows = [
    rowXml(1, [proposal.title, "値"], "title"),
    rowXml(2, ["最新決算期", String(proposal.timeline.latestYear)]),
    rowXml(3, ["基準年", String(proposal.timeline.baseYear)]),
    rowXml(4, ["出力日時", proposal.exportedAt]),
    rowXml(5, ["申請区分", category ? applicationCategoryLabels[category] : "未選択"]),
    rowXml(7, ["15指標・目標（指標名に第6次定義を併記）", "計画値", "単位", "制度上の必須条件", "目標値", "判定"], "header"),
    ...metricRows.map((item, index) => { const definedLabel = `${item.label}（第6次定義：${item.round6Formula}）`; const target = proposalInput(proposal, inputKey.target(item.key, "value"), item.target); return rowXml(index + 8, item.key === "localBenchmark" ? [definedLabel, proposalInput(proposal, inputKey.driver("localBenchmark"), item.actual), item.unit, undefined, undefined, "固定入力・判定対象外"] : isSixthRoundReferenceMetric(item.key) ? [definedLabel, item.actual, item.unit, undefined, undefined, "参考値・第6次評価対象外"] : [definedLabel, item.actual, item.unit, metricRequirementLabel(item.key, category), target, target === undefined ? "目標未設定" : item.actual >= target ? "目標達成" : "目標未達"]); }),
  ];
  const diagnosticRows: string[] = [rowXml(1, ["基本指標によるシミュレーション妥当性チェック", "計算式", "主な確認点", ...parts.periods], "title"), rowXml(2, ["指標名", "計算式", "主な確認点", ...parts.periods], "header")];
  let diagnosticRow = 3;
  for (const group of parts.diagnostics) {
    diagnosticRows.push(rowXml(diagnosticRow++, [group.title, ...Array(parts.periods.length + 2).fill("")], "header"));
    for (const item of group.rows) diagnosticRows.push(rowXml(diagnosticRow++, [`${item.name}（${item.unit}）`, item.formula, item.check, ...item.values.map((period) => period.map((entry) => `${entry.label} ${display(entry.value, item.unit)}`).join(" / "))]));
  }
  const assumptionRows = [rowXml(1, ["将来予測・調整水準", "計画初期値", "制度上の必須条件", "許容下限", "許容上限"], "title"), rowXml(2, ["調整項目", "計画初期値", "制度上の必須条件", "許容下限", "許容上限"], "header"), ...(Object.keys(proposal.drivers) as (keyof Drivers)[]).filter((key) => key !== "localBenchmark" && !hiddenLegacyDriverKeys.has(key)).map((key, index) => { const percent = !["investment", "subsidy"].includes(key); const factor = percent ? 100 : 1; const range = fixedOutputDriverKeys.has(key) ? undefined : proposal.driverRanges[key]; const value = proposalInput(proposal, inputKey.driver(key), proposal.drivers[key]); const lower = range ? proposalInput(proposal, inputKey.driverRange(key, 0), range[0]) : undefined; const upper = range ? proposalInput(proposal, inputKey.driverRange(key, 1), range[1]) : undefined; return rowXml(index + 3, [driverNames[key] ?? key, value === undefined ? undefined : value * factor, driverRequirementLabel(key, category, proposal.drivers.investment), lower === undefined ? undefined : lower * factor, upper === undefined ? undefined : upper * factor]); })];
  const auditSheetRows = [rowXml(1, ["入力データ監査（Null／0区別）", "保存値", "状態"], "title"), rowXml(2, ["入力キー", "保存値", "状態"], "header"), ...inputAuditRows(proposal).map(([key, value], index) => rowXml(index + 3, [key, value, value === 0 ? "明示的な0" : "入力済み"]))];
  const chunks = encodeBase64(JSON.stringify(proposal)).match(/.{1,30000}/g) ?? [];
  const dataRows = [rowXml(1, [PROPOSAL_FORMAT], "header"), ...chunks.map((chunk, index) => rowXml(index + 2, [chunk]))];

  const sheetNames = ["提案計画サマリー", "貸借対照表等", "会社全体PL", "補助事業収支", "妥当性診断", "前提・目標", "入力データ監査", "モデルデータ"];
  const sheetRows = [summaryRows, reportSheet("1-1～1-25 貸借対照表等（入力結果）", parts.balancePeriods, parts.balanceRows), reportSheet("会社全体にかかる損益計算書（P/L）", parts.periods, parts.companyRows), reportSheet("補助事業にかかる収支計画", parts.periods, parts.projectRows), diagnosticRows, assumptionRows, auditSheetRows, dataRows];
  const sheetWidths = [[68, 18, 14, 34, 16, 18], [54, ...Array(parts.balancePeriods.length).fill(18)], [54, ...Array(parts.periods.length).fill(18)], [58, ...Array(parts.periods.length).fill(18)], [42, 42, 48, ...Array(parts.periods.length).fill(22)], [68, 18, 38, 18, 18], [72, 18, 18], [120]];
  const contentOverrides = sheetNames.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const workbookSheets = sheetNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}"${name === "モデルデータ" ? ' state="hidden"' : ""} r:id="rId${index + 1}"/>`).join("");
  const workbookRelationships = sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(proposal.title)}</dc:title><dc:creator>成長投資計画シミュレーター（Ver. 大規模成長投資補助金 6次公募）</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(proposal.exportedAt)}</dcterms:created></cp:coreProperties>`),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>成長投資計画シミュレーター（Ver. 大規模成長投資補助金 6次公募）</Application><AppVersion>1.0</AppVersion></Properties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(stylesXml),
  };
  sheetRows.forEach((rows, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheet(rows, sheetWidths[index], index === sheetRows.length - 1 ? 0 : 2)); });
  return zipSync(files, { level: 6 });
}

export async function parseProposalFile(file: File): Promise<ProposalData> {
  let json: string;
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const modelSheet = Object.entries(archive)
      .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .map(([, bytes]) => new TextDecoder().decode(bytes))
      .find((xml) => xml.includes(PROPOSAL_FORMAT));
    if (!modelSheet) throw new Error("このExcelには再取込用のモデルデータがありません。");
    const xml = modelSheet;
    const values = [...xml.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1].replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'"));
    if (values.shift() !== PROPOSAL_FORMAT) throw new Error("対応していないExcel形式です。");
    json = decodeBase64(values.join(""));
  } else {
    const html = await file.text();
    const match = html.match(/<script id="growth-proposal-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) throw new Error("このHTMLには再取込用のモデルデータがありません。");
    json = decodeBase64(match[1]);
  }
  const proposal = JSON.parse(json) as ProposalData;
  if (proposal.format !== PROPOSAL_FORMAT || !proposal.timeline || !Array.isArray(proposal.historicalPlan)) throw new Error("提案計画データの形式が正しくありません。");
  return proposal;
}

export function downloadBlob(content: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
