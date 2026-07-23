"use client";

import { useEffect, useMemo, useState } from "react";
import {
  basePlan,
  balanceSheetDerived,
  BalanceSheetPlan,
  calculateHistoricalDriverSeries,
  calculateHistoricalMetricSeries,
  calculateMetrics,
  calculateScaleDependentTargetDefaults,
  cogsDepreciation,
  createForecastProjectPeriodInputs,
  createHistoricalPlan,
  DEFAULT_TIMELINE,
  defaultDrivers,
  defaultBalanceSheets,
  driverBounds,
  defaultTargets,
  Drivers,
  employeeBonus,
  employeeSalary,
  generatePlan,
  hardTargetSummary,
  isOptimizationExcludedMetric,
  isSixthRoundReferenceMetric,
  MetricKey,
  metrics,
  operatingProfit,
  officerBonus,
  officerCompensation,
  normalizeTimeline,
  retimeHistoricalPlan,
  retimeBalanceSheets,
  researchDevelopment,
  SegmentKey,
  SegmentPlan,
  sgaDepreciation,
  Target,
  targetStatus,
  TimelineSettings,
  total,
  validatePlan,
  valueAdded,
  YEAR_ROLE_LABELS,
  YearPlan,
} from "./model";
import { buildProposalHtml, buildProposalXlsx, downloadBlob, parseProposalFile, PROPOSAL_FORMAT, ProposalData } from "./proposal-io";
import { createBaseYearLaunchHistoricalOnlySampleProposal, createHistoricalOnlySampleProposal, createPartiallyUnmetSampleProposal, createStandardSampleProposal } from "./sample-proposals";
import { getInputValue, hasInputValue, inputKey, setInputValue, type InputValues } from "./input-values";
import { defaultMetricGroupBases, metricBasisRole, metricLinkGroups, type MetricGroupBasis, type MetricGroupKey } from "./metric-groups";
import {
  applicationCategoryLabels,
  applicationRequirements,
  defaultApplicationCategory,
  driverConstraintFailure,
  driverRequirementLabel,
  maximumSubsidyAmount,
  metricRequirementLabel,
  systemConstraintFailures,
  type ApplicationCategory,
} from "./application-rules";
import { createOptimizationTargets, runPlanningOptimization } from "./proposal-optimization";

type View = "summary" | "history" | "future" | "pl" | "targets" | "logic" | "io";

type DriverRangeSuggestion = {
  key: keyof Drivers;
  boundIndex: 0 | 1;
  value: number;
  text: string;
};

const driverRangeSuggestionId = (metricKey: MetricKey, suggestion: DriverRangeSuggestion) =>
  `${metricKey}:${suggestion.key}:${suggestion.boundIndex}:${suggestion.value}`;

const adjustableDriverKeys: (keyof Drivers)[] = [
  "projectSalesGrowthToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase",
  "otherSalesGrowthToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase",
  "projectSalesGrowth", "otherSalesGrowth", "projectCogsImprovementAfterBase", "otherCogsImprovement",
  "projectPayGrowth", "otherPayGrowth", "projectHeadcountGrowth", "otherHeadcountGrowth",
  "projectSgaRateEnd", "otherSgaRateEnd", "projectOfficerPayGrowth",
];

const driverLabels: Partial<Record<keyof Drivers, { label: string; unit: string; step: number }>> = {
  projectMarketGrowth: { label: "7-20 市場伸び率（年あたり）", unit: "%/年", step: 0.5 },
  projectSalesGrowthToBase: { label: "補助事業 売上成長率（設備導入期間）", unit: "%/年", step: 0.5 },
  projectCogsImprovementToBase: { label: "補助事業 原価率改善ポイント（設備導入期間）", unit: "pt", step: 0.5 },
  projectPayGrowthToBase: { label: "補助事業に関わる従業員1人当たり給与支給総額の年平均上昇率（設備導入期間・モデル内管理）", unit: "%/年", step: 0.25 },
  projectHeadcountGrowthToBase: { label: "補助事業 常時使用する従業員数（就業時間換算）の成長率（設備導入期間）", unit: "%/年", step: 0.5 },
  projectSgaImprovementToBase: { label: "補助事業 その他販管費率改善ポイント（設備導入期間）", unit: "pt", step: 0.5 },
  projectOfficerPayGrowthToBase: { label: "役員1人当たり給与支給総額の年平均上昇率（設備導入期間・モデル内管理）", unit: "%/年", step: 0.25 },
  otherSalesGrowthToBase: { label: "その他事業 売上成長率（最新決算期→基準年）", unit: "%/年", step: 0.5 },
  otherCogsImprovementToBase: { label: "その他事業 原価率改善ポイント（最新決算期→基準年）", unit: "pt", step: 0.5 },
  otherPayGrowthToBase: { label: "その他事業の従業員1人当たり給与支給総額の年平均上昇率（最新決算期→基準年・モデル内管理）", unit: "%/年", step: 0.25 },
  otherHeadcountGrowthToBase: { label: "その他事業 常時使用する従業員数（就業時間換算）の成長率（最新決算期→基準年）", unit: "%/年", step: 0.5 },
  otherSgaImprovementToBase: { label: "その他事業 その他販管費率改善ポイント（最新決算期→基準年）", unit: "pt", step: 0.5 },
  projectSalesGrowth: { label: "補助事業 売上成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  otherSalesGrowth: { label: "その他事業 売上成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  projectCogsImprovementAfterBase: { label: "補助事業 原価率改善ポイント（基準年→事業化報告3年目）", unit: "pt", step: 0.5 },
  otherCogsImprovement: { label: "その他事業 原価率改善ポイント（基準年→事業化報告3年目）", unit: "pt", step: 0.5 },
  projectPayGrowth: { label: "補助事業1人当たり給与支給総額の年平均上昇率（基準年→事業化報告3年目）", unit: "%/年", step: 0.25 },
  otherPayGrowth: { label: "その他事業の従業員1人当たり給与支給総額の年平均上昇率（基準年→事業化報告3年目・モデル内管理）", unit: "%/年", step: 0.25 },
  projectHeadcountGrowth: { label: "補助事業 常時使用する従業員数（就業時間換算）の成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  otherHeadcountGrowth: { label: "その他事業 常時使用する従業員数（就業時間換算）の成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  projectSgaRateEnd: { label: "補助事業 その他販管費率（事業化報告3年目到達値）", unit: "%", step: 0.5 },
  otherSgaRateEnd: { label: "その他事業 その他販管費率（事業化報告3年目到達値）", unit: "%", step: 0.5 },
  projectOfficerPayGrowth: { label: "役員1人当たり給与支給総額の年平均上昇率（基準年→事業化報告3年目・モデル内管理）", unit: "%/年", step: 0.25 },
  usefulLife: { label: "新規投資の耐用年数", unit: "年", step: 1 },
  investment: { label: "補助事業投資額", unit: "億円", step: 1 },
  subsidy: { label: "申請補助金額", unit: "億円", step: 0.01 },
  localBenchmark: { label: "ローカルベンチマーク", unit: "点", step: 1 },
};

const driverGroups: { label: string; detail: string; keys: (keyof Drivers)[] }[] = [
  {
    label: "補助事業｜設備導入期間",
    detail: "最新決算期 → 基準年",
    keys: ["projectSalesGrowthToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase", "investment", "subsidy", "usefulLife"],
  },
  {
    label: "補助事業｜基準年後",
    detail: "基準年度 → 事業化報告3年目",
    keys: ["projectSalesGrowth", "projectCogsImprovementAfterBase", "projectPayGrowth", "projectHeadcountGrowth", "projectSgaRateEnd", "projectOfficerPayGrowth"],
  },
  {
    label: "その他事業｜設備導入期間",
    detail: "最新決算期 → 基準年",
    keys: ["otherSalesGrowthToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase"],
  },
  {
    label: "その他事業｜基準年後",
    detail: "基準年度 → 事業化報告3年目",
    keys: ["otherSalesGrowth", "otherCogsImprovement", "otherPayGrowth", "otherHeadcountGrowth", "otherSgaRateEnd"],
  },
  {
    label: "共通・固定前提",
    detail: "申請・外部前提",
    keys: ["projectMarketGrowth"],
  },
];

const forecastDriverKeys = driverGroups.flatMap((group) => group.keys);
const fixedForecastDriverKeys = new Set<keyof Drivers>(["investment", "subsidy", "usefulLife", "projectMarketGrowth"]);

const driverItemCodes = Object.fromEntries(
  forecastDriverKeys.map((key, index) => [key, String.fromCharCode(65 + index)]),
) as Partial<Record<keyof Drivers, string>>;

const equipmentPeriodStatisticalKeys = new Set<keyof Drivers>([
  "projectSalesGrowthToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase",
  "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase",
  "otherSalesGrowthToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase",
  "otherHeadcountGrowthToBase", "otherSgaImprovementToBase",
]);

const improvementDriverKeys: (keyof Drivers)[] = [
  "projectCogsImprovementToBase", "projectSgaImprovementToBase",
  "otherCogsImprovementToBase", "otherSgaImprovementToBase",
  "projectCogsImprovementAfterBase", "otherCogsImprovement",
];

const scaleDependentMetricKeys = new Set<MetricKey>([
  "companySalesIncrease", "projectSalesIncrease", "valueAddedIncrease",
  "employeePayIncrease", "officerPayIncrease",
]);

type Round5Benchmark = { applicant: number; accepted: number; statistic: "中央値" | "平均値" };

const round5Benchmarks: Partial<Record<MetricKey, Round5Benchmark>> = {
  companySalesCagr: { applicant: 20, accepted: 21, statistic: "中央値" },
  companySalesIncrease: { applicant: 67.1, accepted: 82.4, statistic: "中央値" },
  companyPaySchedule: { applicant: 2.3, accepted: 2.5, statistic: "中央値" },
  projectSalesShare: { applicant: 80, accepted: 89, statistic: "平均値" },
  projectSalesCagr: { applicant: 22, accepted: 22, statistic: "中央値" },
  projectSalesIncrease: { applicant: 57.4, accepted: 74.8, statistic: "中央値" },
  laborProductivityCagr: { applicant: 21, accepted: 21, statistic: "中央値" },
  valueAddedIncrease: { applicant: 19.9, accepted: 28.1, statistic: "中央値" },
  employeePayCagr: { applicant: 6.5, accepted: 7, statistic: "中央値" },
  employeePayIncrease: { applicant: 2.8, accepted: 3.9, statistic: "中央値" },
  investmentSalesRatio: { applicant: 64, accepted: 61, statistic: "中央値" },
  valueAddedSubsidyRatio: { applicant: 171, accepted: 213, statistic: "中央値" },
  localBenchmark: { applicant: 23, accepted: 23, statistic: "中央値" },
};

const postBaseBenchmarkDefaults: Partial<Record<keyof Drivers, { initial: number; lower: number; upper: number }>> = {
  projectSalesGrowth: { initial: 0.22, lower: 0.15, upper: 0.30 },
  projectCogsImprovementAfterBase: { initial: 0.015, lower: 0, upper: 0.03 },
  projectPayGrowth: { initial: 0.07, lower: 0.05, upper: 0.10 },
  projectHeadcountGrowth: { initial: 0.04, lower: 0, upper: 0.08 },
  projectOfficerPayGrowth: { initial: 0.07, lower: 0.05, upper: 0.10 },
};

const historicalFallbackDefaults: Partial<Record<keyof Drivers, { initial: number; lower: number; upper: number }>> = {
  projectSalesGrowthToBase: { initial: 0.05, lower: -0.05, upper: 0.15 },
  projectCogsImprovementToBase: { initial: 0, lower: 0, upper: 0.02 },
  projectPayGrowthToBase: { initial: 0.03, lower: 0, upper: 0.06 },
  projectHeadcountGrowthToBase: { initial: 0.02, lower: -0.03, upper: 0.08 },
  projectSgaImprovementToBase: { initial: 0, lower: 0, upper: 0.02 },
  projectOfficerPayGrowthToBase: { initial: 0.03, lower: 0, upper: 0.06 },
  otherSalesGrowthToBase: { initial: 0.03, lower: -0.03, upper: 0.08 },
  otherCogsImprovementToBase: { initial: 0, lower: 0, upper: 0.02 },
  otherPayGrowthToBase: { initial: 0.03, lower: 0, upper: 0.06 },
  otherHeadcountGrowthToBase: { initial: 0.01, lower: -0.03, upper: 0.05 },
  otherSgaImprovementToBase: { initial: 0, lower: 0, upper: 0.02 },
  otherSalesGrowth: { initial: 0.05, lower: -0.01, upper: 0.10 },
  otherCogsImprovement: { initial: 0, lower: 0, upper: 0.03 },
  otherPayGrowth: { initial: 0.03, lower: 0, upper: 0.06 },
  otherHeadcountGrowth: { initial: 0.01, lower: -0.03, upper: 0.05 },
  projectSgaRateEnd: { initial: 0.10, lower: 0.06, upper: 0.15 },
  otherSgaRateEnd: { initial: 0.10, lower: 0.06, upper: 0.15 },
};

const plFields: { key: keyof SegmentPlan; modelCode: string; label: string; unit: string; digits?: number }[] = [
  { key: "sales", modelCode: "M-1", label: "売上高", unit: "億円" },
  { key: "cogs", modelCode: "M-2", label: "売上原価", unit: "億円" },
  { key: "employeePay", modelCode: "M-3", label: "従業員給与支給総額", unit: "億円" },
  { key: "officerPay", modelCode: "M-4", label: "役員給与支給総額", unit: "億円" },
  { key: "depreciation", modelCode: "M-5", label: "減価償却費", unit: "億円" },
  { key: "otherSga", modelCode: "M-6", label: "その他販管費", unit: "億円" },
  { key: "headcount", modelCode: "M-7", label: "常時使用する従業員数（就業時間換算）", unit: "人", digits: 0 },
  { key: "officerCount", modelCode: "M-8", label: "役員数", unit: "人", digits: 0 },
];

const percentDriver = (key: keyof Drivers) =>
  !["usefulLife", "investment", "subsidy", "localBenchmark"].includes(key);

function number(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
}

function Round5BenchmarkCell({ metricKey, unit }: { metricKey: MetricKey; unit: string }) {
  const benchmark = round5Benchmarks[metricKey];
  if (!benchmark) return <td className="round5-benchmark unavailable">—<small>第5次公表なし</small></td>;
  return <td className="round5-benchmark"><strong>採択者 {number(benchmark.accepted)} {unit}</strong><small>申請者 {number(benchmark.applicant)} {unit}</small><small>{benchmark.statistic}</small></td>;
}

function roundedInput(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

const integerPriority = (value: number) => Math.min(10, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));

function clone<T>(value: T): T {
  return structuredClone(value);
}

const createFutureCapex = (settings: TimelineSettings, totalInvestment: number) => {
  const projectYears = settings.baseYear - settings.latestYear;
  return Array.from({ length: settings.baseYear + 3 - settings.latestYear }, (_, index) => ({
    year: settings.latestYear + index + 1,
    value: index < projectYears ? totalInvestment / projectYears : 0,
  }));
};

type ForecastOverrides = Record<string, number>;
type FutureInputBasis = "company" | "other";
type ForecastSegment = SegmentKey | "company";
const forecastOverrideKey = (year: number, segment: ForecastSegment, item: string) => `${year}:${segment}:${item}`;

function createInitialInputValues(): InputValues {
  let values: InputValues = {};
  for (const definition of metrics) {
    if (isOptimizationExcludedMetric(definition.key) || scaleDependentMetricKeys.has(definition.key)) continue;
    values = setInputValue(values, inputKey.target(definition.key, "value"), defaultTargets[definition.key].value);
    if (defaultTargets[definition.key].max !== undefined) values = setInputValue(values, inputKey.target(definition.key, "max"), defaultTargets[definition.key].max!);
  }
  return values;
}

function applyForecastOverrides(plan: YearPlan[], overrides: ForecastOverrides, inputBasis: FutureInputBasis) {
  const result = clone(plan);
  const projectAnchors = new Set<string>();
  const otherAnchors = new Set<keyof SegmentPlan>();
  const companyAnchors = new Set<string>();
  const cascade = (previousEffective: number, previousAuto: number, currentAuto: number) => {
    const value = Math.abs(previousAuto) > 1e-9
      ? previousEffective * (currentAuto / previousAuto)
      : previousEffective + (currentAuto - previousAuto);
    return roundedInput(value);
  };

  for (let index = 3; index < result.length; index += 1) {
    const autoRow = plan[index];
    const previousAuto = plan[index - 1];
    const row = result[index];
    const previousEffective = result[index - 1];

    if (inputBasis === "other") {
      for (const item of plFields) {
        const key = forecastOverrideKey(row.year, "other", item.key);
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          row.other[item.key] = roundedInput(overrides[key]);
          otherAnchors.add(item.key);
        } else if (otherAnchors.has(item.key)) {
          row.other[item.key] = cascade(previousEffective.other[item.key], previousAuto.other[item.key], autoRow.other[item.key]);
        }
      }
    }

    for (const item of projectOfficialInputRows) {
      const key = forecastOverrideKey(row.year, "project", item.code);
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        const patch = item.set(row.project, overrides[key]);
        Object.entries(patch).forEach(([field, value]) => {
          row.project[field as keyof SegmentPlan] = roundedInput(value ?? 0, item.digits ?? 2);
        });
        projectAnchors.add(item.code);
      } else if (projectAnchors.has(item.code)) {
        const projected = cascade(item.get(previousEffective.project), item.get(previousAuto.project), item.get(autoRow.project));
        const patch = item.set(row.project, projected);
        Object.entries(patch).forEach(([field, value]) => {
          row.project[field as keyof SegmentPlan] = roundedInput(value ?? 0, item.digits ?? 2);
        });
      }
    }

    if (inputBasis === "company") {
      for (const item of companyActualInputRows.filter((candidate) => candidate.set)) {
        const key = forecastOverrideKey(row.year, "company", item.code);
        let companyValue: number | undefined;
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          companyValue = roundedInput(overrides[key]);
          companyAnchors.add(item.code);
        } else if (companyAnchors.has(item.code)) {
          companyValue = cascade(item.get(result, index - 1)!, item.get(plan, index - 1)!, item.get(plan, index)!);
        }
        if (companyValue !== undefined) {
          const patch = item.set!(row, companyValue);
          Object.entries(patch).forEach(([field, residual]) => {
            row.other[field as keyof SegmentPlan] = roundedInput(residual ?? 0);
          });
        }
      }
    }
  }
  return result;
}

function normalizePastedNumber(raw: string) {
  const fullWidth = "０１２３４５６７８９．－＋，％";
  const halfWidth = "0123456789.-+,%";
  const normalized = raw.trim().replace(/[０-９．－＋，％]/g, (character) => halfWidth[fullWidth.indexOf(character)])
    .replace(/[￥¥,\s]/g, "").replace(/%$/, "");
  if (normalized === "" || normalized === "-") return "";
  const value = Number(normalized);
  return Number.isFinite(value) ? String(value) : null;
}

function useSpreadsheetGrid() {
  useEffect(() => {
    type CellPoint = { table: HTMLTableElement; row: number; column: number };
    type UndoChange = CellPoint & { value: string };
    let anchor: CellPoint | null = null;
    let current: CellPoint | null = null;
    let dragging = false;
    const undoStack: UndoChange[][] = [];

    const status = (message: string) => {
      const element = document.getElementById("grid-operation-status");
      if (element) element.textContent = message;
    };
    const cellPoint = (target: EventTarget | null): CellPoint | null => {
      const cell = target instanceof Element ? target.closest<HTMLTableCellElement>(".spreadsheet-grid tbody td") : null;
      const table = cell?.closest<HTMLTableElement>("table");
      const row = cell?.parentElement as HTMLTableRowElement | null;
      return cell && table && row ? { table, row: row.rowIndex, column: cell.cellIndex } : null;
    };
    const selectedCells = () => {
      if (!anchor || !current || anchor.table !== current.table) return [] as HTMLTableCellElement[];
      const rowMin = Math.min(anchor.row, current.row);
      const rowMax = Math.max(anchor.row, current.row);
      const columnMin = Math.min(anchor.column, current.column);
      const columnMax = Math.max(anchor.column, current.column);
      const cells: HTMLTableCellElement[] = [];
      for (let row = rowMin; row <= rowMax; row += 1) {
        for (let column = columnMin; column <= columnMax; column += 1) {
          const cell = anchor.table.rows[row]?.cells[column];
          if (cell instanceof HTMLTableCellElement && cell.closest("tbody")) cells.push(cell);
        }
      }
      return cells;
    };
    const paintSelection = () => {
      document.querySelectorAll(".spreadsheet-grid .grid-selected").forEach((cell) => cell.classList.remove("grid-selected"));
      selectedCells().forEach((cell) => cell.classList.add("grid-selected"));
    };
    const clearGridSelection = () => {
      anchor = null;
      current = null;
      dragging = false;
      paintSelection();
    };
    const setInputValue = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const undoChange = (input: HTMLInputElement): UndoChange | null => {
      const point = cellPoint(input);
      return point ? { ...point, value: input.value } : null;
    };
    const remember = (changes: UndoChange[]) => {
      if (!changes.length) return;
      undoStack.push(changes);
      if (undoStack.length > 100) undoStack.shift();
    };
    const displayValue = (cell: HTMLTableCellElement) => {
      const input = cell.querySelector<HTMLInputElement>("input");
      if (input) return input.value !== "" ? input.value : input.placeholder;
      return cell.innerText.trim().replace(/\s+/g, " ");
    };

    const onMouseDown = (event: MouseEvent) => {
      const point = cellPoint(event.target);
      if (!point) {
        clearGridSelection();
        return;
      }
      if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      if (!event.shiftKey || !anchor || anchor.table !== point.table) anchor = point;
      current = point;
      dragging = true;
      paintSelection();
    };
    const onMouseOver = (event: MouseEvent) => {
      if (!dragging || !anchor) return;
      const point = cellPoint(event.target);
      if (!point || point.table !== anchor.table) return;
      current = point;
      paintSelection();
    };
    const onMouseUp = () => { dragging = false; };
    const onSelectionChange = () => {
      const textSelection = window.getSelection();
      if (textSelection && !textSelection.isCollapsed) clearGridSelection();
    };
    const onBeforeInput = (event: InputEvent) => {
      if (!(event.target instanceof HTMLInputElement)) return;
      const change = undoChange(event.target);
      if (change) remember([change]);
    };
    const onCopy = (event: ClipboardEvent) => {
      if (!anchor || !current || anchor.table !== current.table) return;
      const textSelection = window.getSelection();
      if (textSelection && !textSelection.isCollapsed) return;
      const rowMin = Math.min(anchor.row, current.row);
      const rowMax = Math.max(anchor.row, current.row);
      const columnMin = Math.min(anchor.column, current.column);
      const columnMax = Math.max(anchor.column, current.column);
      const rows: string[] = [];
      for (let row = rowMin; row <= rowMax; row += 1) {
        const values: string[] = [];
        for (let column = columnMin; column <= columnMax; column += 1) {
          const cell = anchor.table.rows[row]?.cells[column];
          values.push(cell instanceof HTMLTableCellElement ? displayValue(cell) : "");
        }
        rows.push(values.join("\t"));
      }
      event.clipboardData?.setData("text/plain", rows.join("\n"));
      event.preventDefault();
      status(`${rowMax - rowMin + 1}行×${columnMax - columnMin + 1}列をコピーしました。`);
    };
    const onPaste = (event: ClipboardEvent) => {
      const start = cellPoint(event.target) ?? anchor;
      if (!start) return;
      const text = event.clipboardData?.getData("text/plain");
      if (text === undefined) return;
      const matrix = text.replace(/\r/g, "").split("\n").filter((row, index, rows) => row !== "" || index < rows.length - 1).map((row) => row.split("\t"));
      let updated = 0;
      let skipped = 0;
      const changes: UndoChange[] = [];
      matrix.forEach((values, rowOffset) => values.forEach((raw, columnOffset) => {
        const cell = start.table.rows[start.row + rowOffset]?.cells[start.column + columnOffset];
        const input = cell?.querySelector<HTMLInputElement>("input:not(:disabled):not([readonly])");
        const normalized = normalizePastedNumber(raw);
        if (!input || normalized === null) { skipped += 1; return; }
        const change = undoChange(input);
        if (change) changes.push(change);
        setInputValue(input, normalized);
        updated += 1;
      }));
      remember(changes);
      event.preventDefault();
      status(`${updated}セルを貼り付けました${skipped ? `（${skipped}セルは自動計算欄または数値以外のためスキップ）` : ""}。`);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" && anchor && current) {
        let cleared = 0;
        const changes: UndoChange[] = [];
        selectedCells().forEach((cell) => {
          const input = cell.querySelector<HTMLInputElement>("input:not(:disabled):not([readonly])");
          if (input) {
            const change = undoChange(input);
            if (change) changes.push(change);
            setInputValue(input, "");
            cleared += 1;
          }
        });
        if (cleared) {
          remember(changes);
          event.preventDefault();
          status(`${cleared}セルをクリアしました。青枠は自動予測へ戻ります。`);
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        const changes = undoStack.pop();
        if (!changes) return;
        changes.forEach((change) => {
          const input = change.table.rows[change.row]?.cells[change.column]?.querySelector<HTMLInputElement>("input:not(:disabled):not([readonly])");
          if (input) setInputValue(input, change.value);
        });
        const first = changes[0];
        anchor = current = first;
        paintSelection();
        event.preventDefault();
        status(`${changes.length}セルの直前の変更を元に戻しました。`);
      }
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
        const point = cellPoint(event.target);
        if (!point) return;
        for (let row = point.row + (event.shiftKey ? -1 : 1); row >= 1 && row < point.table.rows.length; row += event.shiftKey ? -1 : 1) {
          const input = point.table.rows[row]?.cells[point.column]?.querySelector<HTMLInputElement>("input:not(:disabled):not([readonly])");
          if (input) { event.preventDefault(); input.focus(); input.select(); anchor = current = { table: point.table, row, column: point.column }; paintSelection(); break; }
        }
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("beforeinput", onBeforeInput);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("beforeinput", onBeforeInput);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

export default function Home() {
  useSpreadsheetGrid();
  const [view, setView] = useState<View>("history");

  function goToView(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
  const [timeline, setTimeline] = useState<TimelineSettings>({ ...DEFAULT_TIMELINE });
  const [historicalPlan, setHistoricalPlan] = useState<YearPlan[]>(() => createHistoricalPlan(basePlan, DEFAULT_TIMELINE));
  const [balanceSheets, setBalanceSheets] = useState<BalanceSheetPlan[]>(() => retimeBalanceSheets(defaultBalanceSheets, DEFAULT_TIMELINE));
  const [futureCapex, setFutureCapex] = useState(() => createFutureCapex(DEFAULT_TIMELINE, defaultDrivers.investment));
  const [drivers, setDrivers] = useState<Drivers>({ ...defaultDrivers });
  const [driverRanges, setDriverRanges] = useState<Record<keyof Drivers, [number, number]>>(() => clone(driverBounds));
  const [targets, setTargets] = useState<Record<MetricKey, Target>>(clone(defaultTargets));
  const [inputValues, setInputValues] = useState<InputValues>(() => createInitialInputValues());
  const forecastSettingsStarted = useMemo(() => forecastDriverKeys.some((key) =>
    hasInputValue(inputValues, inputKey.driver(key))
    || hasInputValue(inputValues, inputKey.driverRange(key, 0))
    || hasInputValue(inputValues, inputKey.driverRange(key, 1)),
  ), [inputValues]);
  const forecastSettingsReady = useMemo(() => forecastDriverKeys.every((key) =>
    hasInputValue(inputValues, inputKey.driver(key))
    && (fixedForecastDriverKeys.has(key)
      || (hasInputValue(inputValues, inputKey.driverRange(key, 0))
        && hasInputValue(inputValues, inputKey.driverRange(key, 1)))),
  ), [inputValues]);
  const [metricGroupBases, setMetricGroupBases] = useState<Record<MetricGroupKey, MetricGroupBasis>>({ ...defaultMetricGroupBases });
  const [applicationCategory, setApplicationCategory] = useState<ApplicationCategory>(defaultApplicationCategory);
  const [forecastOverrides, setForecastOverrides] = useState<ForecastOverrides>({});
  const [futureInputBasis, setFutureInputBasis] = useState<FutureInputBasis>("other");
  const projectPeriodInputs = useMemo(
    () => createForecastProjectPeriodInputs(historicalPlan[2], drivers, timeline),
    [historicalPlan, drivers, timeline],
  );
  const autoPlan = useMemo(() => generatePlan(historicalPlan, drivers, timeline, projectPeriodInputs), [historicalPlan, drivers, timeline, projectPeriodInputs]);
  const [adjustedPlan, setAdjustedPlan] = useState<YearPlan[] | null>(null);
  const [adjustedDrivers, setAdjustedDrivers] = useState<Drivers | null>(null);
  const [selectedAdjustmentSuggestions, setSelectedAdjustmentSuggestions] = useState<Record<string, boolean>>({});
  const [solveNote, setSolveNote] = useState("未実行");
  const [isSolving, setIsSolving] = useState(false);
  const [defaultNote, setDefaultNote] = useState("");
  const [historicalDefaultsApplied, setHistoricalDefaultsApplied] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("成長投資計画 提案計画");
  const [fileNote, setFileNote] = useState("未保存。ここから出力したHTML・Excelは、同じ画面へ再取込できます。");

  useEffect(() => {
    const closeProposalMenus = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      document.querySelectorAll<HTMLDetailsElement>(".proposal-action-menu[open]").forEach((menu) => {
        if (!target || !menu.contains(target)) menu.removeAttribute("open");
      });
    };
    const closeProposalMenusWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>(".proposal-action-menu[open]").forEach((menu) => menu.removeAttribute("open"));
    };
    document.addEventListener("pointerdown", closeProposalMenus);
    document.addEventListener("keydown", closeProposalMenusWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeProposalMenus);
      document.removeEventListener("keydown", closeProposalMenusWithEscape);
    };
  }, []);

  function keepOnlyProposalMenuOpen(openedMenu: HTMLDetailsElement) {
    if (!openedMenu.open) return;
    document.querySelectorAll<HTMLDetailsElement>(".proposal-action-menu[open]").forEach((menu) => {
      if (menu !== openedMenu) menu.removeAttribute("open");
    });
  }
  const sourcePlan = useMemo(() => applyForecastOverrides(autoPlan, forecastOverrides, futureInputBasis), [autoPlan, forecastOverrides, futureInputBasis]);
  const plan = adjustedPlan ?? sourcePlan;
  const calculationDrivers = adjustedDrivers ?? drivers;
  const sourceActual = useMemo(() => calculateMetrics(sourcePlan, drivers), [sourcePlan, drivers]);
  const actual = useMemo(() => calculateMetrics(plan, calculationDrivers), [plan, calculationDrivers]);
  const statutoryRequirements = applicationRequirements(applicationCategory);
  const statutoryFailures = useMemo(
    () => systemConstraintFailures(applicationCategory, calculationDrivers, actual, plan),
    [applicationCategory, calculationDrivers, actual, plan],
  );
  const historicalMetricSeries = useMemo(
    () => calculateHistoricalMetricSeries(historicalPlan, balanceSheets),
    [historicalPlan, balanceSheets],
  );
  const historicalDriverSeries = useMemo(
    () => calculateHistoricalDriverSeries(historicalPlan, balanceSheets),
    [historicalPlan, balanceSheets],
  );
  const validations = useMemo(() => {
    const modelValidations = validatePlan(plan, calculationDrivers);
    const statutoryValidations = statutoryFailures.map((detail) => ({ level: "error" as const, title: "制度上の必須条件に違反", detail }));
    return statutoryValidations.length ? [...statutoryValidations, ...modelValidations.filter((item) => item.level !== "info")] : modelValidations;
  }, [plan, calculationDrivers, statutoryFailures]);
  const optimizationTargets = useMemo(
    () => createOptimizationTargets(targets, inputValues, metricGroupBases),
    [targets, inputValues, metricGroupBases],
  );
  const hardSummary = useMemo(() => hardTargetSummary(actual, optimizationTargets), [actual, optimizationTargets]);
  const targetManagedMetrics = metrics.filter((definition) => !isOptimizationExcludedMetric(definition.key) && metricBasisRole(definition.key, metricGroupBases) !== "result");
  const achieved = targetManagedMetrics.filter((definition) => hasInputValue(inputValues, inputKey.target(definition.key, "value")) && targetStatus(definition, actual[definition.key], targets[definition.key]).ok).length;
  const basePlanYear = plan.find((row) => row.role === "base")!;
  const report3 = plan.find((row) => row.role === "report3")!;
  const targetComparisonYears = Math.max(1, report3.year - basePlanYear.year);
  const targetAdjustmentSuggestions = useMemo(() => {
    const suggestions: Partial<Record<MetricKey, DriverRangeSuggestion[]>> = {};
    if (!adjustedDrivers) return suggestions;
    const sourceHistorical = sourcePlan.slice(0, 3);
    const candidateActual = (candidateDrivers: Drivers) => {
      const period = createForecastProjectPeriodInputs(sourceHistorical[2], candidateDrivers, timeline);
      const candidatePlan = applyForecastOverrides(generatePlan(sourceHistorical, candidateDrivers, timeline, period), forecastOverrides, futureInputBasis);
      return calculateMetrics(candidatePlan, candidateDrivers);
    };
    for (const definition of targetManagedMetrics) {
      const target = optimizationTargets[definition.key];
      if (target.policy !== "hard" || targetStatus(definition, actual[definition.key], target).ok) continue;
      const candidates: { score: number; suggestion: DriverRangeSuggestion }[] = [];
      for (const key of adjustableDriverKeys) {
        const [rangeLower, rangeUpper] = driverRanges[key];
        const rangeSpan = Math.max(rangeUpper - rangeLower, 0.0001);
        const current = adjustedDrivers[key];
        const displayBound = (value: number) => `${number(percentDriver(key) ? value * 100 : value, 2)}${driverLabels[key]!.unit}`;
        const extension = Math.max(rangeSpan * 0.15, Math.abs(current) * 0.05, percentDriver(key) ? 0.005 : 0.1);
        const findRequiredBound = (direction: -1 | 1, boundary: number) => {
          let failedDistance = 0;
          let achievedDistance: number | null = null;
          let distance = extension;
          for (let bracket = 0; bracket < 16; bracket += 1) {
            const value = boundary + direction * distance;
            const probeActual = candidateActual({ ...adjustedDrivers, [key]: value });
            if (!Number.isFinite(probeActual[definition.key])) break;
            if (targetStatus(definition, probeActual[definition.key], target).ok) {
              achievedDistance = distance;
              break;
            }
            failedDistance = distance;
            distance *= 2;
          }
          if (achievedDistance === null) return null;
          for (let iteration = 0; iteration < 24; iteration += 1) {
            const middleDistance = (failedDistance + achievedDistance) / 2;
            const value = boundary + direction * middleDistance;
            const probeActual = candidateActual({ ...adjustedDrivers, [key]: value });
            if (targetStatus(definition, probeActual[definition.key], target).ok) achievedDistance = middleDistance;
            else failedDistance = middleDistance;
          }
          const inputStep = driverLabels[key]!.step / (percentDriver(key) ? 100 : 1);
          const rawValue = boundary + direction * achievedDistance;
          const roundedValue = direction > 0
            ? Math.ceil((rawValue - 1e-10) / inputStep) * inputStep
            : Math.floor((rawValue + 1e-10) / inputStep) * inputStep;
          const roundedActual = candidateActual({ ...adjustedDrivers, [key]: roundedValue })[definition.key];
          if (!targetStatus(definition, roundedActual, target).ok) return null;
          return { value: roundedValue, actual: roundedActual };
        };
        const probes: { value: number; actual: number; text: string }[] = [];
        const currentStatus = targetStatus(definition, actual[definition.key], target);
        const improvesTargetGap = (probeValue: number) => {
          const probeStatus = targetStatus(definition, probeValue, target);
          return Number.isFinite(probeStatus.gap)
            && Math.abs(probeStatus.gap) + 1e-8 < Math.abs(currentStatus.gap);
        };
        const upperProbeActual = candidateActual({ ...adjustedDrivers, [key]: rangeUpper + extension })[definition.key];
        if (improvesTargetGap(upperProbeActual)) {
          const required = findRequiredBound(1, rangeUpper);
          if (required) probes.push({ ...required, text: `${driverItemCodes[key]}：${driverLabels[key]!.label}の許容上限を${displayBound(rangeUpper)}から少なくとも${displayBound(required.value)}へ引き上げる` });
        }
        const lowerProbeActual = candidateActual({ ...adjustedDrivers, [key]: rangeLower - extension })[definition.key];
        if (improvesTargetGap(lowerProbeActual)) {
          const required = findRequiredBound(-1, rangeLower);
          if (required) probes.push({ ...required, text: `${driverItemCodes[key]}：${driverLabels[key]!.label}の許容下限を${displayBound(rangeLower)}から少なくとも${displayBound(required.value)}へ引き下げる` });
        }
        for (const probe of probes) {
          const improvement = probe.actual - actual[definition.key];
          if (Number.isFinite(improvement) && improvement > 1e-8) {
            candidates.push({
              score: improvement / Math.abs(probe.value - current),
              suggestion: {
                key,
                boundIndex: probe.value > current ? 1 : 0,
                value: probe.value,
                text: probe.text,
              },
            });
          }
        }
      }
      suggestions[definition.key] = candidates
        .sort((left, right) => right.score - left.score || left.suggestion.text.localeCompare(right.suggestion.text, "ja"))
        .slice(0, 3)
        .map((candidate) => candidate.suggestion);
    }
    return suggestions;
  }, [adjustedDrivers, actual, driverRanges, forecastOverrides, futureInputBasis, optimizationTargets, sourcePlan, targetManagedMetrics, timeline]);

  function clearAdjustment() {
    setAdjustedPlan(null);
    setAdjustedDrivers(null);
    setSelectedAdjustmentSuggestions({});
    setSolveNote("未実行");
  }

  function currentProposal(): ProposalData {
    return {
      format: PROPOSAL_FORMAT,
      title: proposalTitle.trim() || "成長投資計画 提案計画",
      exportedAt: new Date().toISOString(),
      timeline: clone(timeline),
      historicalPlan: clone(historicalPlan),
      balanceSheets: clone(balanceSheets),
      futureCapex: clone(futureCapex),
      drivers: clone(drivers),
      adjustedDrivers: adjustedDrivers ? clone(adjustedDrivers) : undefined,
      driverRanges: clone(driverRanges),
      targets: clone(targets),
      forecastOverrides: clone(forecastOverrides),
      futureInputBasis,
      inputValues: clone(inputValues),
      metricGroupBases: clone(metricGroupBases),
      applicationCategory,
    };
  }

  function exportContext() {
    return {
      proposal: currentProposal(),
      effectivePlan: clone(plan),
      metricRows: metrics.map((definition) => ({
        key: definition.key,
        label: definition.label,
        round6Formula: definition.round6Formula,
        unit: definition.unit,
        actual: actual[definition.key],
        target: targets[definition.key].value,
        max: targets[definition.key].max,
        policy: targets[definition.key].policy,
      })),
    };
  }

  function safeProposalFileName(extension: string) {
    const stem = (proposalTitle.trim() || "成長投資計画_提案計画").replace(/[\\/:*?"<>|]/g, "_");
    return `${stem}.${extension}`;
  }

  function exportHtml() {
    downloadBlob(buildProposalHtml(exportContext()), safeProposalFileName("html"), "text/html;charset=utf-8");
    setFileNote("HTMLへ出力しました");
  }

  function exportExcel() {
    downloadBlob(buildProposalXlsx(exportContext()), safeProposalFileName("xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setFileNote("Excelへ出力しました");
  }

  function applyProposal(proposal: ProposalData) {
    clearAdjustment();
    const importedDrivers = { ...defaultDrivers, ...clone(proposal.drivers) };
    const importedAdjustedDrivers = proposal.adjustedDrivers
      ? { ...defaultDrivers, ...clone(proposal.adjustedDrivers) }
      : null;
    const importedTimeline = normalizeTimeline(proposal.timeline);
    const importedHistoricalPlan = clone(proposal.historicalPlan);
    const importedForecastOverrides = clone(proposal.forecastOverrides ?? {});
    const importedFutureInputBasis = proposal.futureInputBasis ?? "other";
    const importedRanges = { ...clone(driverBounds), ...clone(proposal.driverRanges) };
    for (const key of Object.keys(driverBounds) as (keyof Drivers)[]) {
      const importedRange = importedRanges[key] ?? driverBounds[key];
      const validRange = importedRange.every(Number.isFinite) ? importedRange : driverBounds[key];
      importedRanges[key] = [Math.min(...validRange), Math.max(...validRange)];
    }
    setProposalTitle(proposal.title || "成長投資計画 提案計画");
    setTimeline(importedTimeline);
    setHistoricalPlan(importedHistoricalPlan);
    setBalanceSheets(clone(proposal.balanceSheets));
    setFutureCapex(clone(proposal.futureCapex));
    setDrivers(importedDrivers);
    setDriverRanges(importedRanges);
    setTargets(Object.fromEntries(Object.entries(proposal.targets).map(([key, target]) => [key, { ...target, max: target.max ?? defaultTargets[key as MetricKey].max, weight: integerPriority(target.weight) }])) as Record<MetricKey, Target>);
    setForecastOverrides(importedForecastOverrides);
    setFutureInputBasis(importedFutureInputBasis);
    setMetricGroupBases({ ...defaultMetricGroupBases, ...(proposal.metricGroupBases ?? {}) });
    setApplicationCategory(proposal.applicationCategory ?? defaultApplicationCategory);
    if (proposal.inputValues) {
      let normalizedInputs = clone(proposal.inputValues);
      proposal.historicalPlan.forEach((row) => {
        const migrateBreakdown = (legacyCode: string, primaryCode: string, secondaryCode: string) => {
          const legacyKey = inputKey.companyActual(row.year, legacyCode);
          const primaryKey = inputKey.companyActual(row.year, primaryCode);
          const secondaryKey = inputKey.companyActual(row.year, secondaryCode);
          if (hasInputValue(normalizedInputs, legacyKey) && !hasInputValue(normalizedInputs, primaryKey) && !hasInputValue(normalizedInputs, secondaryKey)) {
            normalizedInputs = setInputValue(normalizedInputs, primaryKey, Number(normalizedInputs[legacyKey]));
            normalizedInputs = setInputValue(normalizedInputs, secondaryKey, 0);
          }
        };
        migrateBreakdown("2-8", "2-9", "2-10");
        migrateBreakdown("2-11", "2-12", "2-13");
        const cogsDepreciationKey = inputKey.companyActual(row.year, "2-4");
        if (hasInputValue(normalizedInputs, inputKey.companyActual(row.year, "2-14")) && !hasInputValue(normalizedInputs, cogsDepreciationKey)) {
          normalizedInputs = setInputValue(normalizedInputs, cogsDepreciationKey, 0);
        }
      });
      for (const key of Object.keys(driverBounds) as (keyof Drivers)[]) {
        for (const bound of [0, 1] as const) {
          if (hasInputValue(normalizedInputs, inputKey.driverRange(key, bound))) normalizedInputs = setInputValue(normalizedInputs, inputKey.driverRange(key, bound), importedRanges[key][bound]);
        }
      }
      setInputValues(normalizedInputs);
    } else {
      // Legacy v1 files had numeric models only.  Treat their saved cells as
      // explicitly entered because the old format cannot recover blanks.
      let inferred = createInitialInputValues();
      proposal.historicalPlan.forEach((row) => {
        companyActualInputRows.filter((item) => item.set).forEach((item) => { inferred[inputKey.companyActual(row.year, item.code)] = roundedInput(item.get(proposal.historicalPlan, proposal.historicalPlan.indexOf(row)) ?? 0); });
        projectOfficialInputRows.forEach((item) => { inferred[inputKey.projectActual(row.year, item.code)] = roundedInput(item.get(row.project)); });
      });
      proposal.balanceSheets.forEach((row) => {
        (Object.keys(row) as (keyof BalanceSheetPlan)[]).filter((field) => field !== "year").forEach((field) => { inferred[inputKey.balanceSheet(row.year, field)] = roundedInput(row[field]); });
      });
      proposal.futureCapex.forEach((row) => { inferred[inputKey.futureCapex(row.year)] = roundedInput(row.value); });
      (Object.keys(importedDrivers) as (keyof Drivers)[]).forEach((key) => {
        inferred[inputKey.driver(key)] = importedDrivers[key];
        inferred[inputKey.driverRange(key, 0)] = importedRanges[key][0];
        inferred[inputKey.driverRange(key, 1)] = importedRanges[key][1];
      });
      (Object.keys(proposal.targets) as MetricKey[]).forEach((key) => {
        inferred[inputKey.target(key, "value")] = roundedInput(proposal.targets[key].value);
        if (proposal.targets[key].max !== undefined) inferred[inputKey.target(key, "max")] = roundedInput(proposal.targets[key].max!);
      });
      setInputValues(inferred);
    }
    if (importedAdjustedDrivers) {
      const adjustedPeriodInputs = createForecastProjectPeriodInputs(importedHistoricalPlan[2], importedAdjustedDrivers, importedTimeline);
      const adjustedAutoPlan = generatePlan(importedHistoricalPlan, importedAdjustedDrivers, importedTimeline, adjustedPeriodInputs);
      setAdjustedDrivers(importedAdjustedDrivers);
      setAdjustedPlan(applyForecastOverrides(adjustedAutoPlan, importedForecastOverrides, importedFutureInputBasis));
      setSolveNote("保存済みの最適化結果を表示しています。");
    }
    setDefaultNote("");
    setHistoricalDefaultsApplied(false);
    setFileNote("提案計画を取り込みました");
  }

  async function importProposal(file: File | undefined) {
    if (!file) return;
    try {
      applyProposal(await parseProposalFile(file));
    } catch (error) {
      setFileNote(error instanceof Error ? error.message : "取込に失敗しました");
    }
  }

  function loadSampleProposal() {
    const proposal = createStandardSampleProposal(new Date().toISOString());
    applyProposal(proposal);
    setHistoricalDefaultsApplied(true);
    setDefaultNote("過去3期実績から調整水準を設定し、初回最適化後に2029年のその他事業売上高・補助事業の従業員給与支給総額を上書きして、再最適化したサンプルです。");
    setSolveNote("標準提案サンプル：一部将来データ入力後の再最適化まで実行済みです。");
    setFileNote("過去入力・調整水準設定・2段階最適化済みの標準提案を読み込みました");
  }

  function loadPartiallyUnmetSample() {
    applyProposal(createPartiallyUnmetSampleProposal(new Date().toISOString()));
    setHistoricalDefaultsApplied(true);
    setDefaultNote("現実的な許容範囲を維持したため、一部指標が目標に届かなかった最接近案です。未達判定と許容範囲の修正候補を確認できます。");
    setSolveNote("一部目標未達サンプル：許容範囲内で最適化した最接近案を表示しています。");
    setFileNote("最適化後も一部指標が未達となる確認用サンプルを読み込みました");
  }

  function loadHistoricalOnlySample() {
    applyProposal(createHistoricalOnlySampleProposal(new Date().toISOString()));
    setFileNote("過去3期入力済み・将来予測未設定のサンプルを読み込みました");
  }

  function loadBaseYearLaunchSample() {
    applyProposal(createBaseYearLaunchHistoricalOnlySampleProposal(new Date().toISOString()));
    setFileNote("補助事業の過去3期実績が0で、将来予測未設定のサンプルを読み込みました");
  }

  function updateHistorical(yearIndex: number, segment: SegmentKey, field: keyof SegmentPlan, value: number) {
    clearAdjustment();
    const digits = field === "headcount" || field === "officerCount" ? 0 : 2;
    const roundedValue = roundedInput(value, digits);
    setHistoricalPlan((current) => current.map((row, index) => {
      if (index !== yearIndex) return row;
      if (segment === "project") {
        const companyValue = row.project[field] + row.other[field];
        return { ...row, project: { ...row.project, [field]: roundedValue }, other: { ...row.other, [field]: roundedInput(companyValue - roundedValue, digits) } };
      }
      return { ...row, other: { ...row.other, [field]: roundedValue } };
    }));
  }

  function updateHistoricalProjectOfficial(yearIndex: number, item: ProjectOfficialInputRow, inputValue: number | null) {
    clearAdjustment();
    setInputValues((current) => setInputValue(current, inputKey.projectActual(historicalPlan[yearIndex].year, item.code), inputValue === null ? null : roundedInput(inputValue, item.digits ?? 2)));
    setHistoricalPlan((current) => current.map((row, index) => {
      if (index !== yearIndex) return row;
      const patch = item.set(row.project, roundedInput(inputValue ?? 0, item.digits ?? 2));
      const nextProject = { ...row.project };
      const nextOther = { ...row.other };
      Object.entries(patch).forEach(([rawField, rawValue]) => {
        const field = rawField as keyof SegmentPlan;
        const digits = field === "headcount" || field === "officerCount" ? 0 : 2;
        const previousProjectValue = Number(row.project[field] ?? 0);
        const nextProjectValue = roundedInput(rawValue ?? 0, digits);
        nextProject[field] = nextProjectValue;
        nextOther[field] = roundedInput(Number(row.other[field] ?? 0) + previousProjectValue - nextProjectValue, digits);
      });
      return { ...row, project: nextProject, other: nextOther };
    }));
  }

  function updateHistoricalCompanyOfficial(yearIndex: number, item: CompanyActualInputRow, inputValue: number | null) {
    if (!item.set) return;
    clearAdjustment();
    setInputValues((current) => setInputValue(current, inputKey.companyActual(historicalPlan[yearIndex].year, item.code), inputValue === null ? null : roundedInput(inputValue)));
    setHistoricalPlan((current) => current.map((row, index) => {
      if (index !== yearIndex) return row;
      const patch = item.set!(row, roundedInput(inputValue ?? 0));
      return {
        ...row,
        other: {
          ...row.other,
          ...Object.fromEntries(Object.entries(patch).map(([field, residual]) => [field, roundedInput(residual ?? 0)])),
        },
      };
    }));
  }

  function updateBalanceSheet(yearIndex: number, field: keyof BalanceSheetPlan, value: number | null) {
    clearAdjustment();
    setInputValues((current) => setInputValue(current, inputKey.balanceSheet(balanceSheets[yearIndex].year, field), value === null ? null : roundedInput(value)));
    setBalanceSheets((current) => current.map((row, index) => index === yearIndex ? { ...row, [field]: roundedInput(value ?? 0) } : row));
  }

  function updateFutureCapex(yearIndex: number, value: number | null) {
    clearAdjustment();
    setFutureCapex((current) => {
      const next = current.map((row, index) => index === yearIndex ? { ...row, value: roundedInput(value ?? 0) } : row);
      const investment = roundedInput(next.reduce((sum, row) => sum + row.value, 0));
      setDrivers((driver) => ({ ...driver, investment }));
      setInputValues((values) => {
        let updated = setInputValue(values, inputKey.futureCapex(next[yearIndex].year), value === null ? null : roundedInput(value));
        const anyCapexEntered = next.some((row) => hasInputValue(updated, inputKey.futureCapex(row.year)));
        updated = setInputValue(updated, inputKey.driver("investment"), anyCapexEntered ? investment : null);
        return updated;
      });
      return next;
    });
  }

  function updateTimeline(patch: Partial<TimelineSettings>) {
    clearAdjustment();
    const next = normalizeTimeline({ ...timeline, ...patch });
    const nextHistorical = retimeHistoricalPlan(historicalPlan, next);
    const nextBalanceSheets = retimeBalanceSheets(balanceSheets, next);
    const nextFutureCapex = createFutureCapex(next, futureCapex.reduce((sum, row) => sum + row.value, 0));
    setInputValues((current) => {
      const remapped: InputValues = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith("actual:") && !key.startsWith("balance-sheet:") && !key.startsWith("future-capex:")));
      historicalPlan.forEach((oldRow, index) => {
        const newRow = nextHistorical[index];
        companyActualInputRows.filter((item) => item.set).forEach((item) => {
          const oldKey = inputKey.companyActual(oldRow.year, item.code);
          if (hasInputValue(current, oldKey)) remapped[inputKey.companyActual(newRow.year, item.code)] = current[oldKey];
        });
        projectOfficialInputRows.forEach((item) => {
          const oldKey = inputKey.projectActual(oldRow.year, item.code);
          if (hasInputValue(current, oldKey)) remapped[inputKey.projectActual(newRow.year, item.code)] = current[oldKey];
        });
        (Object.keys(balanceSheets[index]) as (keyof BalanceSheetPlan)[]).filter((field) => field !== "year").forEach((field) => {
          const oldKey = inputKey.balanceSheet(balanceSheets[index].year, field);
          if (hasInputValue(current, oldKey)) remapped[inputKey.balanceSheet(nextBalanceSheets[index].year, field)] = current[oldKey];
        });
      });
      futureCapex.forEach((oldRow, index) => {
        if (!nextFutureCapex[index]) return;
        const oldKey = inputKey.futureCapex(oldRow.year);
        if (hasInputValue(current, oldKey)) remapped[inputKey.futureCapex(nextFutureCapex[index].year)] = current[oldKey];
      });
      return remapped;
    });
    setTimeline(next);
    setHistoricalPlan(nextHistorical);
    setBalanceSheets(nextBalanceSheets);
    setFutureCapex(nextFutureCapex);
    setForecastOverrides({});
  }

  function updateForecastOverride(year: number, segment: ForecastSegment, item: string, value: number | null) {
    clearAdjustment();
    const key = forecastOverrideKey(year, segment, item);
    const integerValue = (segment === "project" && (item === "7-13" || item === "7-14"))
      || (segment === "other" && (item === "headcount" || item === "officerCount"));
    setForecastOverrides((current) => {
      const next = { ...current };
      if (value === null) delete next[key];
      else next[key] = roundedInput(value, integerValue ? 0 : 2);
      return next;
    });
  }

  function changeFutureInputBasis(basis: FutureInputBasis) {
    clearAdjustment();
    setFutureInputBasis(basis);
  }

  function updateTarget(key: MetricKey, patch: Partial<Target>) {
    clearAdjustment();
    setTargets((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function updateTargetBound(key: MetricKey, bound: "value" | "max", value: number | null) {
    clearAdjustment();
    setInputValues((current) => setInputValue(current, inputKey.target(key, bound), value === null ? null : roundedInput(value)));
    setTargets((current) => ({
      ...current,
      [key]: { ...current[key], [bound]: value === null ? (bound === "max" ? undefined : 0) : roundedInput(value) },
    }));
  }

  function updateDriver(key: keyof Drivers, value: number | null) {
    clearAdjustment();
    const numericValue = value ?? 0;
    setInputValues((current) => setInputValue(current, inputKey.driver(key), value === null ? null : numericValue));
    setDrivers((current) => ({ ...current, [key]: numericValue }));
    if (key === "investment") {
      const capex = createFutureCapex(timeline, numericValue);
      setFutureCapex(capex);
      setInputValues((current) => capex.reduce((next, row) => setInputValue(next, inputKey.futureCapex(row.year), value === null ? null : roundedInput(row.value)), current));
    }
  }

  function updateDriverRange(key: keyof Drivers, boundIndex: 0 | 1, displayValue: number | null) {
    clearAdjustment();
    const fallback = driverBounds[key][boundIndex];
    const value = displayValue === null ? fallback : percentDriver(key) ? displayValue / 100 : displayValue;
    setInputValues((current) => setInputValue(current, inputKey.driverRange(key, boundIndex), displayValue === null ? null : value));
    setDriverRanges((current) => {
      const next: [number, number] = [...current[key]];
      next[boundIndex] = value;
      return { ...current, [key]: next };
    });
  }

  function toggleDriverRangeSuggestion(metricKey: MetricKey, suggestion: DriverRangeSuggestion, checked: boolean) {
    const id = driverRangeSuggestionId(metricKey, suggestion);
    setSelectedAdjustmentSuggestions((current) => ({ ...current, [id]: checked }));
  }

  function applySelectedDriverRangeSuggestions(metricKey: MetricKey, suggestions: DriverRangeSuggestion[]) {
    const selected = suggestions.filter((suggestion) => selectedAdjustmentSuggestions[driverRangeSuggestionId(metricKey, suggestion)]);
    if (!selected.length) return;
    clearAdjustment();
    setDriverRanges((current) => {
      const next = clone(current);
      for (const suggestion of selected) next[suggestion.key][suggestion.boundIndex] = suggestion.value;
      return next;
    });
    setInputValues((current) => selected.reduce(
      (next, suggestion) => setInputValue(next, inputKey.driverRange(suggestion.key, suggestion.boundIndex), suggestion.value),
      current,
    ));
    setSolveNote(`${selected.length}件の修正候補を一括適用しました。変更後の許容範囲で、再度「設定した目標に近づける」を実行してください。`);
  }

  function applyHistoricalDefaults() {
    const nextDrivers = { ...drivers };
    const nextRanges = clone(driverRanges);
    const clamp = (value: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, value));

    nextDrivers.projectMarketGrowth = hasInputValue(inputValues, inputKey.driver("projectMarketGrowth")) ? drivers.projectMarketGrowth : 0.05;
    nextDrivers.usefulLife = hasInputValue(inputValues, inputKey.driver("usefulLife")) ? drivers.usefulLife : 10;
    const enteredInvestment = futureCapex.reduce((sum, row) => sum + row.value, 0);
    const capexEntered = futureCapex.some((row) => hasInputValue(inputValues, inputKey.futureCapex(row.year)));
    const investmentEntered = capexEntered || hasInputValue(inputValues, inputKey.driver("investment"));
    const historicalCapex = balanceSheets.map((row) => row.capex).filter((value) => Number.isFinite(value) && value > 0);
    const annualHistoricalCapex = historicalCapex.length ? historicalCapex.reduce((sum, value) => sum + value, 0) / historicalCapex.length : 0;
    const estimatedInvestment = annualHistoricalCapex * Math.max(1, timeline.baseYear - timeline.latestYear);
    nextDrivers.investment = investmentEntered ? (capexEntered ? enteredInvestment : drivers.investment) : clamp(estimatedInvestment || 15, driverBounds.investment[0], driverBounds.investment[1]);
    nextDrivers.subsidy = hasInputValue(inputValues, inputKey.driver("subsidy"))
      ? drivers.subsidy
      : clamp(maximumSubsidyAmount(nextDrivers.investment), driverBounds.subsidy[0], driverBounds.subsidy[1]);

    for (const key of adjustableDriverKeys) {
      const history = historicalDriverSeries[key];
      const observed = history.values.filter(Number.isFinite);
      const [defaultLower, defaultUpper] = driverBounds[key];
      if (!observed.length) {
        const fallback = historicalFallbackDefaults[key] ?? postBaseBenchmarkDefaults[key];
        if (fallback) {
          nextDrivers[key] = clamp(fallback.initial, defaultLower, defaultUpper);
          nextRanges[key] = [clamp(fallback.lower, defaultLower, defaultUpper), clamp(fallback.upper, defaultLower, defaultUpper)];
        }
        continue;
      }
      const useMeanAndDeviation = equipmentPeriodStatisticalKeys.has(key);
      const mean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
      const standardDeviation = Math.sqrt(observed.reduce((sum, value) => sum + (value - mean) ** 2, 0) / observed.length);
      const benchmark = postBaseBenchmarkDefaults[key];
      // Officer pay is independently estimated from the historical per-officer
      // pay series.  The benchmark remains only as a fallback when no usable
      // officer history exists.
      if (benchmark && key !== "projectOfficerPayGrowth") {
        nextDrivers[key] = clamp(benchmark.initial, defaultLower, defaultUpper);
        nextRanges[key] = [
          clamp(benchmark.lower, defaultLower, defaultUpper),
          clamp(benchmark.upper, defaultLower, defaultUpper),
        ];
        continue;
      }
      if (key === "projectSgaRateEnd") {
        nextDrivers[key] = clamp(mean - 0.015, defaultLower, defaultUpper);
        nextRanges[key] = [
          clamp(mean - 0.04, defaultLower, defaultUpper),
          clamp(mean + 0.01, defaultLower, defaultUpper),
        ];
        continue;
      }
      const initial = useMeanAndDeviation ? mean : history.mode === "change"
        ? observed.length > 1 ? observed.at(-2)! * 0.4 + observed.at(-1)! * 0.6 : observed[0]
        : observed.length >= 3 ? observed[0] * 0.2 + observed[1] * 0.3 + observed[2] * 0.5 : observed.at(-1)!;
      const observedLower = Math.min(...observed);
      const observedUpper = Math.max(...observed);
      const buffer = Math.max((observedUpper - observedLower) * 0.5, history.mode === "change" ? 0.01 : 0.02);
      const boundedInitial = clamp(initial, defaultLower, defaultUpper);
      const lower = useMeanAndDeviation
        ? clamp(mean - 2 * standardDeviation, defaultLower, defaultUpper)
        : Math.min(boundedInitial, clamp(observedLower - buffer, defaultLower, defaultUpper));
      const upper = useMeanAndDeviation
        ? clamp(mean + 2 * standardDeviation, defaultLower, defaultUpper)
        : Math.max(boundedInitial, clamp(observedUpper + buffer, defaultLower, defaultUpper));
      nextDrivers[key] = boundedInitial;
      nextRanges[key] = [lower, upper];
    }

    const applyOtherSynergyLift = (
      afterBaseKey: keyof Drivers,
      toBaseKey: keyof Drivers,
      lift: number,
    ) => {
      const [defaultLower, defaultUpper] = driverBounds[afterBaseKey];
      nextDrivers[afterBaseKey] = clamp(nextDrivers[toBaseKey] + lift, defaultLower, defaultUpper);
      nextRanges[afterBaseKey] = [
        Math.min(nextDrivers[afterBaseKey], clamp(nextRanges[toBaseKey][0] + lift, defaultLower, defaultUpper)),
        Math.max(nextDrivers[afterBaseKey], clamp(nextRanges[toBaseKey][1] + lift, defaultLower, defaultUpper)),
      ];
    };
    applyOtherSynergyLift("otherSalesGrowth", "otherSalesGrowthToBase", 0.02);
    applyOtherSynergyLift("otherCogsImprovement", "otherCogsImprovementToBase", 0.005);
    applyOtherSynergyLift("otherPayGrowth", "otherPayGrowthToBase", 0.005);
    applyOtherSynergyLift("otherHeadcountGrowth", "otherHeadcountGrowthToBase", 0.005);
    const latestOther = historicalPlan.at(-1)!.other;
    const latestOtherSgaRate = latestOther.sales ? latestOther.otherSga / latestOther.sales : 0.10;
    const otherBaseSgaRate = latestOtherSgaRate - nextDrivers.otherSgaImprovementToBase;
    const postBaseSgaImprovement = Math.max(0, nextDrivers.otherSgaImprovementToBase + 0.005);
    nextDrivers.otherSgaRateEnd = clamp(otherBaseSgaRate - postBaseSgaImprovement, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]);
    nextRanges.otherSgaRateEnd = [
      clamp(nextDrivers.otherSgaRateEnd - 0.02, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]),
      clamp(nextDrivers.otherSgaRateEnd + 0.01, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]),
    ];

    const defaultProjectInputs = createForecastProjectPeriodInputs(historicalPlan[2], nextDrivers, timeline);
    const defaultPlan = generatePlan(historicalPlan, nextDrivers, timeline, defaultProjectInputs);
    const scaleDependentTargets = calculateScaleDependentTargetDefaults(defaultPlan, targets);

    clearAdjustment();
    setDrivers(nextDrivers);
    setDriverRanges(nextRanges);
    setTargets((current) => {
      const next = clone(current);
      for (const [key, values] of Object.entries(scaleDependentTargets) as [MetricKey, { value: number; max: number }][]) {
        next[key] = { ...next[key], ...values };
      }
      return next;
    });
    const nextCapex = investmentEntered ? futureCapex : createFutureCapex(timeline, nextDrivers.investment);
    if (!investmentEntered) setFutureCapex(nextCapex);
    setInputValues((current) => {
      let next = { ...current };
      for (const key of Object.keys(nextDrivers) as (keyof Drivers)[]) {
        if (key !== "localBenchmark") next = setInputValue(next, inputKey.driver(key), nextDrivers[key]);
      }
      for (const key of Object.keys(nextRanges) as (keyof Drivers)[]) {
        next = setInputValue(next, inputKey.driverRange(key, 0), nextRanges[key][0]);
        next = setInputValue(next, inputKey.driverRange(key, 1), nextRanges[key][1]);
      }
      for (const [key, values] of Object.entries(scaleDependentTargets) as [MetricKey, { value: number; max: number }][]) {
        next = setInputValue(next, inputKey.target(key, "value"), roundedInput(values.value));
        next = setInputValue(next, inputKey.target(key, "max"), roundedInput(values.max));
      }
      for (const row of nextCapex) next = setInputValue(next, inputKey.futureCapex(row.year), roundedInput(row.value));
      return next;
    });
    setHistoricalDefaultsApplied(true);
    setDefaultNote("すべての計画初期値を設定しました。過去実績が使える項目は平均・変動幅から推計し、実績不足の項目は保守的な補完値を使用しています。原価率・その他販管費率の改善ポイントは悪化を見込まず、設備導入期間0～2pt、基準年後0～3ptの常識レンジに制限しています。その他事業の基準年後は補助事業とのシナジーを見込み、設備導入期間より売上成長率を2.0pt、原価率改善を0.5pt、給与・人員成長率を0.5pt高く設定しています。15指標の増加額5項目は固定中央値を使わず、対応する成長率目標と基準年の売上高・付加価値・給与・人数から規模連動で換算しています。未入力の投資額は過去の年平均設備投資額×設備導入年数、補助金額は投資額の3分の1、耐用年数は10年、市場伸び率は5%で仮置きしています。");
  }

  function confirmAndApplyHistoricalDefaults() {
    if (forecastSettingsStarted && !window.confirm("将来予測の水準が指定済みです。過去データを基にした推奨値に変更してよろしいですか？")) return;
    applyHistoricalDefaults();
  }

  async function solve() {
    if (isSolving) return;
    if (!applicationCategory) {
      setSolveNote("申請区分が未選択です。過去データ入力の先頭で申請区分を選択してください。");
      return;
    }
    if (!forecastSettingsReady) {
      setSolveNote("将来予測・調整水準が未設定です。「過去3期からデフォルト設定」で推奨値を作成するか、すべての項目を入力してください。");
      return;
    }
    setIsSolving(true);
    setSolveNote("計算中…");
    // Let React paint the busy state before the synchronous optimizer starts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const planTransform = (candidate: YearPlan[]) => applyForecastOverrides(candidate, forecastOverrides, futureInputBasis);
      const result = runPlanningOptimization({
        drivers,
        historicalPlan,
        timeline,
        optimizationTargets,
        driverRanges,
        applicationCategory,
        planTransform,
      });
      const failedStatutory = systemConstraintFailures(applicationCategory, result.drivers, result.actual, result.plan);
      setAdjustedDrivers(result.drivers);
      setAdjustedPlan(result.plan);
      const scoreDrop = result.beforeScore > 0 ? Math.max(0, (1 - result.score / result.beforeScore) * 100) : 0;
      setSolveNote(
        failedStatutory.length
          ? `制度上の必須条件を満たせません：${failedStatutory.join("／")}。固定入力と許容範囲を確認してください。最接近案を表示しています。`
          : result.failed.length
          ? `固定入力と現在の許容範囲を守ると設定した目標を同時達成できません。目標違反が最小になる決定論的な最接近案を表示しています（未達${result.failed.length}件、総合目的関数${scoreDrop.toFixed(0)}%改善）。未達行に許容範囲の修正候補を表示します。`
          : `入力値を保持したまま調整案を作成。目的関数は${scoreDrop.toFixed(0)}%改善し、設定した目標を同時達成しています。`,
      );
    } catch (error) {
      setSolveNote(error instanceof Error ? `計算に失敗しました：${error.message}` : "計算に失敗しました。");
    } finally {
      setIsSolving(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">大規模成長投資補助金 6次公募様式に基づいて計算</p>
          <h1 className="product-title">
            <span>成長投資計画シミュレーター</span>
            <small>Ver. 大規模成長投資補助金 6次公募</small>
          </h1>
          <p className="subtitle">過去実績と目標値を入力し、補助事業＋その他事業＝全社 の将来PLをシミュレーションします。</p>
        </div>
      </header>

      <nav className="tabs" aria-label="画面切替">
        {([
          ["history", "過去データ入力"], ["targets", "15指標・目標"], ["future", "将来データ入力"], ["pl", "年度別PL"], ["summary", "診断"],
        ] as [View, string][]).map(([key, label]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => goToView(key)}>{label}</button>
        ))}
        <span className="tab-group-separator" aria-hidden="true">|</span>
        {([
          ["logic", "数式・ロジック"], ["io", "データ入出力"],
        ] as [View, string][]).map(([key, label]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => goToView(key)}>{label}</button>
        ))}
      </nav>

      {view === "io" && (
        <section className="content-stack data-io-view">
          <div className="section-intro">
            <div><p className="eyebrow">DATA MANAGEMENT</p><h2>データ入出力</h2></div>
            <p>提案計画の保存・取込と、確認用サンプルの読込をここで管理します。</p>
          </div>
          <div className="data-io-grid">
            <section className="proposal-filebar" aria-label="提案計画の保存と取込">
              <div className="data-io-panel-heading"><p className="card-kicker">PLAN FILE</p><h3>提案計画を保存・取り込む</h3></div>
              <label><span>提案計画名</span><input value={proposalTitle} onChange={(event) => setProposalTitle(event.target.value)} /></label>
              <div className="proposal-file-actions">
                <details className="proposal-action-menu" onToggle={(event) => keepOnlyProposalMenuOpen(event.currentTarget)}>
                  <summary>出力 <span aria-hidden="true">▾</span></summary>
                  <div className="proposal-action-menu-items">
                    <small>お客さま提示用の提案計画書</small>
                    <button onClick={(event) => { exportHtml(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>提案書HTML</button>
                    <button onClick={(event) => { exportExcel(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>提案書Excel</button>
                  </div>
                </details>
                <label className="proposal-import-button">ファイル取込<input type="file" accept=".html,.htm,.xlsx" onChange={(event) => { void importProposal(event.target.files?.[0]); event.target.value = ""; }} /></label>
              </div>
            </section>
            <article className="sample-library-panel" aria-label="確認用サンプル">
              <div className="data-io-panel-heading"><p className="card-kicker">SAMPLE LIBRARY</p><h3>確認用サンプルを読み込む</h3><small>現在の入力は選択したサンプルで置き換わります。</small></div>
              <div className="sample-library-grid">
                <section>
                  <strong>使い方を試す</strong>
                  <span>過去データ入力後から、設定・最適化を自分で進めます。</span>
                  <button onClick={loadHistoricalOnlySample}>標準ケース（過去3期入力済み）</button>
                  <button onClick={loadBaseYearLaunchSample}>基準年売上開始ケース（過去3期入力済み）</button>
                </section>
                <section className="result-sample-section">
                  <strong>シミュレーション結果を見る</strong>
                  <span>調整水準設定・将来入力・再最適化後の完成例です。</span>
                  <button className="sample-result-button" onClick={loadSampleProposal}>最適化済み標準提案</button>
                  <button onClick={loadPartiallyUnmetSample}>一部目標未達ケース</button>
                </section>
              </div>
            </article>
          </div>
          <p className="data-io-status" aria-live="polite">{fileNote}</p>
        </section>
      )}

      {view === "summary" && (
        <section className="page-grid summary-grid">
          <div className="hero-card dark-card">
            <div>
              <p className="card-kicker">同時達成判定</p>
              <h2>{hardSummary.failed.length === 0 ? "設定目標は両立可能" : "設定目標に競合・未達あり"}</h2>
              <p>{hardSummary.hardCount === 0 ? "現在、目標値は設定されていません。15指標画面で入力してください。" : `${hardSummary.hardCount}件中${hardSummary.hardCount - hardSummary.failed.length}件を達成。`}</p>
            </div>
            <div className="score-ring"><strong>{achieved}</strong><span>/ {targetManagedMetrics.length}</span><small>最適化対象の範囲内</small></div>
          </div>

          <div className="stat-card"><span>全社売上高</span><strong>{number(total(report3.project, report3.other).sales)} 億円</strong><small>事業化報告3年目 {report3.year}</small></div>
          <div className="stat-card"><span>補助事業付加価値増加</span><strong>{number(actual.valueAddedIncrease)} 億円</strong><small>基準年比</small></div>
          <div className="stat-card"><span>補助金1円当たり効果</span><strong>{number(actual.valueAddedSubsidyRatio, 0)}%</strong><small>{hasInputValue(inputValues, inputKey.target("valueAddedSubsidyRatio", "value")) ? `目標 ${number(targets.valueAddedSubsidyRatio.value, 0)}%` : "目標 未設定"}</small></div>

          <DiagnosticCharts plan={plan} />
          <BehaviorChangeTable plan={plan} balanceSheets={balanceSheets} futureCapex={futureCapex} timeline={timeline} />
          <FinancialDiagnostics plan={plan} balanceSheets={balanceSheets} futureCapex={futureCapex} />

          <article className="panel metric-overview">
            <div className="panel-heading"><div><p className="card-kicker">目標ギャップ</p><h2>優先して直す指標</h2></div><button className="text-button" onClick={() => goToView("targets")}>15指標を編集 →</button></div>
            <div className="metric-list">
              {metrics.map((definition) => {
                const target = optimizationTargets[definition.key];
                const status = targetStatus(definition, actual[definition.key], target);
                const fixedInput = definition.key === "localBenchmark";
                const referenceMetric = isSixthRoundReferenceMetric(definition.key);
                const targetSet = hasInputValue(inputValues, inputKey.target(definition.key, "value"));
                const basisRole = metricBasisRole(definition.key, metricGroupBases);
                return (
                  <div className="metric-row" key={definition.key}>
                    <span className={`status-dot ${fixedInput || referenceMetric || basisRole === "result" || !targetSet || status.ok ? "ok" : "bad"}`} />
                    <div><strong>{definition.label}</strong><small>{definition.sourceRound}</small></div>
                    <span className="metric-value">{adjustedPlan && <small className="before-metric">{number(sourceActual[definition.key])} →</small>}{number(actual[definition.key])}{definition.unit}</span>
                    <span className="metric-target">{fixedInput ? "固定入力・判定対象外" : referenceMetric ? "参考値・第6次評価対象外" : basisRole === "result" ? "自動算出" : targetSet ? `目標 ${number(target.value)}${definition.unit}` : "目標 未設定"}</span>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel validation-panel">
            <div className="panel-heading"><div><p className="card-kicker">現実性チェック</p><h2>{validations.filter((item) => item.level !== "info").length}件の確認事項</h2></div></div>
            <p className="solve-note">{solveNote}</p>
            <div className="validation-list">
              {validations.slice(0, 8).map((item, index) => (
                <div className={`validation ${item.level}`} key={`${item.title}-${index}`}>
                  <strong>{item.year ? `${item.year}年：` : ""}{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            <p className="footnote">現在のレンジは汎用の暫定値です。業種別比較、過去3期実績、設備仕様、顧客別数量を入れると精度が上がります。</p>
          </article>
        </section>
      )}

      {view === "history" && (
        <section className="content-stack history-actuals-view">
          <div className="section-intro"><div><p className="eyebrow">STEP 1 / ACTUALS</p><h2>過去3期の実績を入力</h2></div><p>まずB/S、会社全体PL、補助事業PLの過去3期を入力します。</p></div>
          <p id="grid-operation-status" className="grid-operation-status" aria-live="polite">セルを選択して、Excelから複数セルをそのまま貼り付けできます。空欄は未設定、0は明示的なゼロとして区別して保存します。直前の変更はCtrl＋Zで戻せます。</p>
          <article className="panel application-category-panel">
            <div className="panel-heading"><div><p className="card-kicker">ROUND 6 / APPLICATION CATEGORY</p><h2>申請区分・制度前提</h2></div><span className={`pill ${applicationCategory ? "green" : ""}`}>{applicationCategory ? "選択済み" : "必須選択"}</span></div>
            <div className="application-category-control">
              <div className="application-category-copy"><strong>申請区分</strong><small>選択した区分に応じて、制度上の投資額・賃上げ率を自動設定します。</small></div>
              <select aria-label="申請区分" required value={applicationCategory} onChange={(event) => { clearAdjustment(); setApplicationCategory(event.target.value as ApplicationCategory); }}><option value="">選択してください</option>{Object.entries(applicationCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
            {statutoryRequirements ? <div className="benchmark-note statutory-summary"><strong>自動設定される制度条件</strong><span>補助事業投資額 {statutoryRequirements.investmentMinimum}億円以上</span><span>補助事業1人当たり給与支給総額の年平均上昇率 {statutoryRequirements.projectPayCagrMinimum.toFixed(1)}%以上</span><span>基準年度の1人当たり給与支給総額は最新決算期以上</span><span>申請補助金額は50億円以下かつ投資額の1/3以下</span></div> : <p className="default-note">申請区分を選択するまで、制度上の必須条件は確定しません。</p>}
          </article>
          <article className="panel">
            <div className="panel-heading"><div><p className="card-kicker">APPLICATION PERIOD</p><h2>申請書の年度設定</h2></div><span className="pill">過去3期＋将来{timeline.baseYear + 3 - timeline.latestYear}期</span></div>
            <div className="driver-grid timeline-grid">
              <label className="fixed"><span>最新決算期の年度<small>この年度を含めて過去3期を入力</small></span><input type="number" step="1" value={timeline.latestYear} onChange={(event) => updateTimeline({ latestYear: Number(event.target.value) })} /></label>
              <label className="fixed"><span>補助事業完了年度（基準年）<small>最新決算期の翌年～6年後</small></span><input type="number" min={timeline.latestYear + 1} max={timeline.latestYear + 6} step="1" value={timeline.baseYear} onChange={(event) => updateTimeline({ baseYear: Number(event.target.value) })} /></label>
            </div>
            <p className="footnote">入力範囲：{timeline.latestYear - 2}年度（前々期）～{timeline.baseYear + 3}年度（事業化報告3年目）。第6次様式の最大枠は、過去3期＋将来9期です。</p>
          </article>
          <article className="panel table-panel">
            <div className="panel-heading"><div><p className="card-kicker">ROUND 6 / B/S REQUIRED INPUT</p><h2>1-1～1-25 貸借対照表等（過去3期）</h2></div><span className="pill green">公式番号に準拠</span></div>
            <BalanceSheetEditor balanceSheets={balanceSheets} historical={historicalPlan} inputValues={inputValues} onChange={updateBalanceSheet} />
            <p className="footnote">B/S残高の1-1～1-23・1-25と、過去実績の1-24を入力します。将来の1-24 新規設備投資による支出は「将来データ入力」の冒頭へ移しました。金額単位は億円です。</p>
          </article>
          <article className="panel formula-panel">
            <h2>B/SとP/Lの連動方針</h2>
            <code>設備投資 → 固定資産 → 減価償却費（P/L）　／　借入金 → 支払利息 → 経常利益（P/L）</code>
            <p>実務上は連動しますが、第6次の公式Excel自体はB/S残高から減価償却費や支払利息を自動算定していません。公式上の直接参照は主に、P/LのEBITDAを使う1-25 EBITDA有利子負債倍率です。本モデルでも、過去B/Sを入力しただけで手入力P/Lを上書きしません。将来の減価償却費・支払利息まで自動連動させるには、次段階で「固定資産台帳」と「借入返済表」を年度別に設けます。</p>
          </article>
          <article className="panel table-panel"><div className="panel-heading"><div><p className="card-kicker">PL ACTUALS</p><h2>会社全体PL・補助事業PL（過去3期）</h2></div><span className="pill green">必須手入力</span></div><HistoricalInputsEditor historical={historicalPlan} inputValues={inputValues} onHistoricalCompanyChange={updateHistoricalCompanyOfficial} onHistoricalProjectChange={updateHistoricalProjectOfficial} /></article>
          <div className="workflow-actions"><span>過去実績を入力できたら、次に現実的な将来水準を設定します。</span><button className="solve-button" onClick={() => goToView("targets")}>15指標・目標へ →</button></div>
        </section>
      )}

      {view === "future" && (
        <section className="content-stack">
          <div className="section-intro"><div><p className="eyebrow">STEP 3 / FORECAST INPUT</p><h2>自動予測を確認し、必要なセルだけ上書き</h2></div><p>青枠の空欄には、過去実績と「15指標・目標」の調整水準から計算した値を表示します。入力したセルは太字で固定し、それ以降の空欄年度を再予測します。</p></div>
          <p id="grid-operation-status" className="grid-operation-status" aria-live="polite">セルを選択して、Excelから複数セルをそのまま貼り付けできます。直前の変更はCtrl＋Zで戻せます。</p>
          <article className="panel table-panel"><div className="panel-heading"><div><p className="card-kicker">ROUND 6 / FUTURE CAPEX</p><h2>1-24 新規設備投資による支出（過去3期参照 → 将来計画）</h2></div><span className="pill green">将来合計 {number(futureCapex.reduce((sum, row) => sum + row.value, 0), 2)} 億円</span></div><FutureCapexEditor balanceSheets={balanceSheets} historical={historicalPlan} futureCapex={futureCapex} inputValues={inputValues} onChange={updateFutureCapex} /><p className="footnote">左側の過去3期は参照表示です。将来各年度の入力合計は「15指標・目標」の補助事業投資額と連動し、投資額／全社売上高や将来減価償却費の自動予測へ反映します。</p></article>
          <article className="panel table-panel"><div className="panel-heading"><div><p className="card-kicker">PL FORECAST</p><h2>補助事業期間 → 事業化報告3年目</h2></div><span className="pill blue-pill">空欄は自動予測</span></div><div className="future-basis-setting"><div><strong>将来PLの入力方式</strong><small>全社PLとその他事業PLのどちらか一方だけを入力します</small></div><div className="mode-switch" role="group" aria-label="将来PLの入力方式"><button type="button" className={futureInputBasis === "company" ? "active" : ""} aria-pressed={futureInputBasis === "company"} onClick={() => changeFutureInputBasis("company")}>全社PLを入力</button><button type="button" className={futureInputBasis === "other" ? "active" : ""} aria-pressed={futureInputBasis === "other"} onClick={() => changeFutureInputBasis("other")}>その他事業PLを入力</button></div></div><FutureInputsEditor historical={historicalPlan} autoPlan={autoPlan} effectivePlan={sourcePlan} overrides={forecastOverrides} inputValues={inputValues} futureInputBasis={futureInputBasis} drivers={calculationDrivers} onForecastChange={updateForecastOverride} /><p className="footnote">補助事業PLは共通です。「全社PLを入力」ではその他事業PLを差額計算し、「その他事業PLを入力」では全社PLを合算計算します。</p></article>
          <div className="workflow-actions"><div><span>上書きしたセルを固定して再最適化できます。再最適化後もこの画面に留まります。</span>{adjustedPlan && <p className="solve-note">{solveNote}</p>}</div><div className="target-action-buttons"><button className="reset-button" onClick={() => goToView("targets")}>← 15指標・目標へ戻る</button><button className="solve-button" disabled={isSolving} aria-busy={isSolving} onClick={() => void solve()}>{isSolving ? "計算中…" : "上書き内容を反映して再最適化"}</button><button className="reset-button" onClick={() => goToView("pl")}>年度別PLへ →</button></div></div>
        </section>
      )}

      {view === "pl" && (
        <section className="content-stack">
          <div className="section-intro"><div><p className="eyebrow">ROUND 6 FORM ALIGNMENT</p><h2>第6次Excelの項目番号・並び順で表示</h2></div><p>会社全体は2-1～2-36、補助事業は7-1～7-20に合わせています。2-21以降は給与・付加価値・人数・EBITDAのP/L関連計算項目です。</p></div>
          {adjustedPlan && <div className="comparison-banner"><strong>入力値は保存されています。</strong><span>各セルを「入力値 → 調整案」で表示しています。</span></div>}
          <CompanyTable plan={plan} sourcePlan={adjustedPlan ? sourcePlan : undefined} />
          <OfficialProjectTable plan={plan} sourcePlan={adjustedPlan ? sourcePlan : undefined} drivers={calculationDrivers} />
          <PlTable title="その他事業PL（モデル内訳・申請書外）" plan={plan} sourcePlan={adjustedPlan ? sourcePlan : undefined} segment="other" />
          <div className="workflow-actions"><span>年度別PLを確認したら、診断画面で計画推移と妥当性を確認します。</span><div className="target-action-buttons"><button className="reset-button" onClick={() => goToView("future")}>← 将来データ入力に戻る</button><button className="solve-button" onClick={() => goToView("summary")}>診断タブに進む →</button></div></div>
        </section>
      )}

      {view === "targets" && (
        <section className="content-stack">
          <div className="section-intro"><div><p className="eyebrow">15 METRICS</p><h2>目標・制度条件・競合管理</h2></div><p>事業を「補助事業」と「その他事業」に分け、それぞれに目標数値・水準を設定します。計画値・判定・自動調整には第6次定義を使用し、複数目標が矛盾する場合は未達と修正候補を明示します。</p></div>
          <article className="panel">
            <div className="panel-heading"><div><p className="card-kicker">STEP 2 / FORECAST DRIVERS</p><h2>将来予測・調整水準</h2><span className={`pill ${forecastSettingsReady ? "green" : ""}`}>{forecastSettingsReady ? "設定済み" : "未設定"}</span></div><button className="default-button" onClick={confirmAndApplyHistoricalDefaults}>{forecastSettingsStarted ? "過去3期から再設定" : "過去3期からデフォルト設定"}</button></div>
            <div className="wide-table spreadsheet-grid driver-target-table"><table><thead><tr><th>調整項目<small>A～Z</small></th>{historicalPlan.slice(1).map((row) => <th className="driver-reference-heading" key={row.year}>{row.year}<small>過去実績・参考値<br />{YEAR_ROLE_LABELS[row.role]}</small></th>)}<th>計画初期値</th><th>制度上の必須条件<small>編集不可</small></th><th>許容下限</th><th>許容上限</th><th>最適化での扱い</th></tr></thead><tbody>
              {driverGroups.flatMap((group) => [
                <tr className="driver-group-heading" key={`group-${group.label}`}><th><strong>{group.label}</strong><small>{group.detail}</small></th><td aria-hidden="true" colSpan={historicalPlan.length + 4}></td></tr>,
                ...group.keys.map((key) => {
                const info = driverLabels[key]!;
                const movable = !["projectMarketGrowth", "usefulLife", "investment", "subsidy", "localBenchmark"].includes(key);
                const noRange = key === "investment" || key === "subsidy" || key === "usefulLife" || key === "projectMarketGrowth";
                const constraintError = driverConstraintFailure(key, applicationCategory, drivers);
                const history = historicalDriverSeries[key];
                const inputValue = percentDriver(key) ? Number((drivers[key] * 100).toFixed(2)) : drivers[key];
                const rawDriverValue = getInputValue(inputValues, inputKey.driver(key));
                const displayedInputValue = rawDriverValue === "" ? "" : roundedInput(percentDriver(key) ? rawDriverValue * 100 : rawDriverValue);
                const resultValue = adjustedDrivers ? (percentDriver(key) ? adjustedDrivers[key] * 100 : adjustedDrivers[key]) : null;
                const rangeValues = ([0, 1] as const).map((bound) => {
                  const raw = getInputValue(inputValues, inputKey.driverRange(key, bound));
                  return raw === "" ? "" : roundedInput(percentDriver(key) ? raw * 100 : raw);
                }) as [number | "", number | ""];
                const rangeOrdered = driverRanges[key][0] <= driverRanges[key][1];
                const rangeValid = noRange || (rangeOrdered && drivers[key] >= driverRanges[key][0] && drivers[key] <= driverRanges[key][1]);
                const rangeStatus = noRange ? "入力値を固定" : !rangeOrdered ? "下限＞上限" : movable ? rangeValid ? "範囲内で調整" : "初期値が範囲外" : rangeValid ? "入力値を固定" : "固定値が範囲外";
                return <tr className={`${movable ? "driver-adjustable" : "driver-fixed"} ${constraintError ? "driver-validation-error" : ""}`} key={key}><th><span className="driver-item-code">{driverItemCodes[key]}:</span> {info.label}<small>{info.unit}／{history.referenceLevels ? "各期率＋前年差改善pt" : history.mode === "change" ? "前年差・前年比" : history.mode === "level" ? "各期の水準" : "過去比較なし"}</small></th>{history.values.slice(1).map((value, referenceIndex) => {
                  const index = referenceIndex + 1;
                  const referenceLevel = history.referenceLevels?.[index];
                  if (referenceLevel !== undefined && Number.isFinite(referenceLevel)) {
                    const improvement = Number.isFinite(value) ? value * 100 : undefined;
                    const improvementLabel = improvement === undefined ? "—" : improvement > 0 ? `+${number(improvement, 2)}pt 改善` : improvement < 0 ? `${number(improvement, 2)}pt（悪化）` : "+0.00pt 改善";
                    return <td className="driver-history driver-rate-history" key={`${key}-${historicalPlan[index].year}`}><strong>{improvementLabel}</strong><small>当期率 {number(referenceLevel * 100, 2)}%</small></td>;
                  }
                  return <td className="driver-history" key={`${key}-${historicalPlan[index].year}`}>{Number.isFinite(value) ? <><strong>{number(percentDriver(key) ? value * 100 : value, 2)}</strong><small>{history.mode === "change" ? `${historicalPlan[index - 1]?.year}→${historicalPlan[index].year}` : info.unit}</small></> : "—"}</td>;
                })}<td><span className="driver-values"><input type="number" min={key === "investment" || key === "subsidy" ? 0 : undefined} aria-invalid={constraintError ? "true" : undefined} step={info.step} value={displayedInputValue} placeholder="未設定" onChange={(event) => updateDriver(key, event.target.value === "" ? null : percentDriver(key) ? Number(event.target.value) / 100 : Number(event.target.value))} />{resultValue !== null && <small className="adjusted-value">→ 最適化結果 {number(resultValue, 2)}</small>}</span>{constraintError && <small className="field-error" role="alert">{constraintError}</small>}</td><td className="statutory-condition"><strong>{driverRequirementLabel(key, applicationCategory, drivers.investment)}</strong></td><td>{noRange ? <span className="no-range">—</span> : <input type="number" step={info.step} value={rangeValues[0]} placeholder="未設定" onChange={(event) => updateDriverRange(key, 0, event.target.value === "" ? null : Number(event.target.value))} />}</td><td>{noRange ? <span className="no-range">—</span> : <input type="number" step={info.step} value={rangeValues[1]} placeholder="未設定" onChange={(event) => updateDriverRange(key, 1, event.target.value === "" ? null : Number(event.target.value))} />}</td><td><span className={`driver-policy ${rangeValid ? "" : "out-of-range"}`}>{rangeStatus}</span></td></tr>;
              }),
              ])}
            </tbody></table></div>
            <p className="footnote">前期・最新決算期の各列は、計画値ではなく過去実績の参考値です。前々期もデフォルト計算には使用しますが、参考値がほぼないため表では省略しています。「過去3期からデフォルト設定」では、補助事業の設備導入期間は過去実績の単純平均を計画初期値、平均±2標準偏差を許容下限・上限とします。表示されている許容下限・上限がそのまま最適化の探索範囲であり、別の非表示上限は設けません。制度条件や計算上成立しない値は別途バリデーションします。基準年後は、第5次採択者中央値を直接使える項目と、過去採択統計・利益構造から補完する項目を分けています。市場伸び率・補助事業投資額・申請補助金額・耐用年数は固定入力のため、許容下限・上限を設けません。</p>
            <div className="benchmark-note"><strong>基準年後のデフォルト</strong><span>売上高成長率 22%［15～30%］</span><span>補助事業1人当たり給与支給総額の年平均上昇率 7%［5～10%］</span><span>常時使用する従業員数（就業時間換算）の成長率 4%［0～8%］</span><span>原価率改善 1.5pt［0～2pt］</span><span>その他販管費率 過去平均-1.5pt［過去平均-4～+1pt］</span><span>役員1人当たり給与支給総額の年平均上昇率は過去3期の役員1人当たり給与から推計（計算不能時のみ7%［5～10%］）</span><span>その他事業はシナジーを見込み、基準年後の売上成長率を設備導入期間＋2.0pt、原価率改善・給与・人員成長率を＋0.5pt</span><a href="https://chukentou-seichotoushi-hojo.jp/assets/documents/common/5ji_median.pdf" target="_blank" rel="noreferrer">第5次公募・採択者中央値PDF ↗</a></div>
            {defaultNote && <p className="default-note">{defaultNote}</p>}
          </article>
          <article className="panel table-panel">
            <div className="metric-group-controls">
              {metricLinkGroups.map((group) => {
                const basis = metricGroupBases[group.key];
                return <label className="metric-group-control" key={group.key}><span><strong>{group.label}</strong><small>{group.relation}</small></span><select aria-label={`${group.label}の目標設定方法`} value={basis} onChange={(event) => { clearAdjustment(); setMetricGroupBases((current) => ({ ...current, [group.key]: event.target.value as MetricGroupBasis })); }}><option value="rate">{group.rateLabel}に目標設定（{group.amountLabel}は自動算出）</option><option value="amount">{group.amountLabel}に目標設定（{group.rateLabel}は自動算出）</option><option value="both">両方に目標設定（2指標を同時に最適化）</option></select></label>;
              })}
            </div>
            <div className="targets-table-wrap"><table className="targets-table"><thead><tr><th>No.</th><th>指標・第6次定義</th>{historicalPlan.slice(1).map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}<th>第5次公式参考値<small>採択者／申請者</small></th><th>投資計画 計画値<small>{adjustedPlan ? "入力 → 調整案" : "計算結果"}</small></th><th>制度上の必須条件<small>編集不可</small></th><th>目標値</th><th>優先度</th><th>判定・未達時の修正候補</th></tr></thead><tbody>
              {metrics.map((definition, index) => {
                const target = targets[definition.key];
                const effectiveTarget = optimizationTargets[definition.key];
                const status = targetStatus(definition, actual[definition.key], effectiveTarget);
                const targetSet = hasInputValue(inputValues, inputKey.target(definition.key, "value"));
                const history = historicalMetricSeries[definition.key];
                const scaleDependent = scaleDependentMetricKeys.has(definition.key);
                const basisRole = metricBasisRole(definition.key, metricGroupBases);
                if (definition.key === "localBenchmark") return <tr className="fixed-metric-row" key={definition.key}><td>{index + 1}</td><td><strong>{definition.label}</strong><small className="metric-definition">第6次定義：{definition.round6Formula}</small><small>外部で算出した点数を転記する固定値</small></td>{history.values.map((_value, historyIndex) => <td className="historical-metric" key={`${definition.key}-${historicalPlan[historyIndex].year}`}>—</td>).slice(1)}<Round5BenchmarkCell metricKey={definition.key} unit={definition.unit} /><td><input aria-label="ローカルベンチマーク固定値" type="number" step="1" value={getInputValue(inputValues, inputKey.driver("localBenchmark"))} placeholder="未入力" onChange={(event) => updateDriver("localBenchmark", event.target.value === "" ? null : Number(event.target.value))} /></td><td className="statutory-condition">—</td><td><span className="no-range">—</span></td><td><span className="no-range">—</span></td><td><span className="result-badge ok">判定対象外</span></td></tr>;
                if (isSixthRoundReferenceMetric(definition.key)) return <tr className="reference-metric-row" key={definition.key}><td>{index + 1}</td><td><strong>{definition.label}</strong><small className="metric-definition">第6次定義：{definition.round6Formula}</small><small>第6次評価対象外</small><span className="metric-role-badge reference">参考値</span></td>{history.values.map((value, historyIndex) => <td className="historical-metric" key={`${definition.key}-${historicalPlan[historyIndex].year}`}>{Number.isFinite(value) ? <><strong>{number(value)}</strong><small>{historicalPlan[historyIndex - 1]?.year}→{historicalPlan[historyIndex].year}（1年間）／{definition.unit}</small>{scaleDependent && <small className="period-equivalent">同額ペースの{targetComparisonYears}年単純換算：{number(value * targetComparisonYears)} {definition.unit}</small>}</> : "—"}</td>).slice(1)}<Round5BenchmarkCell metricKey={definition.key} unit={definition.unit} /><td className="numeric">{number(actual[definition.key])} {definition.unit}</td><td className="statutory-condition">—</td><td><span className="no-range">—</span></td><td><span className="no-range">—</span></td><td><span className="result-badge ok">参考値</span></td></tr>;
                const rowClass = basisRole === "result" ? "metric-result-row" : basisRole === "basis" ? "metric-basis-row" : "metric-independent-row";
                const roleLabel = basisRole === "result" ? "自動算出" : basisRole === "basis" ? "目標設定" : "個別に目標設定";
                const suggestions = targetAdjustmentSuggestions[definition.key] ?? [];
                return <tr className={rowClass} key={definition.key}><td>{index + 1}</td><td><strong>{definition.label}</strong><small className="metric-definition">第6次定義：{definition.round6Formula}</small><small>{definition.sourceRound}</small><span className={`metric-role-badge ${basisRole}`}>{roleLabel}</span></td>{history.values.map((value, historyIndex) => <td className="historical-metric" key={`${definition.key}-${historicalPlan[historyIndex].year}`}>{Number.isFinite(value) ? <><strong>{number(value)}</strong><small>{history.mode === "change" ? `${historicalPlan[historyIndex - 1]?.year}→${historicalPlan[historyIndex].year}（1年間）／${definition.unit}` : definition.unit}</small>{scaleDependent && history.mode === "change" && <small className="period-equivalent">同額ペースの{targetComparisonYears}年単純換算：{number(value * targetComparisonYears)} {definition.unit}</small>}</> : "—"}</td>).slice(1)}<Round5BenchmarkCell metricKey={definition.key} unit={definition.unit} /><td className="numeric">{adjustedPlan && <small className="before-metric">{number(sourceActual[definition.key])} →</small>}{number(actual[definition.key])} {definition.unit}</td><td className="statutory-condition"><strong>{metricRequirementLabel(definition.key, applicationCategory)}</strong></td><td><input disabled={basisRole === "result"} aria-label={`${definition.label}目標値`} type="number" step="0.1" value={getInputValue(inputValues, inputKey.target(definition.key, "value"))} placeholder={scaleDependent ? "デフォルト設定後に算出" : "未設定"} onChange={(event) => updateTargetBound(definition.key, "value", event.target.value === "" ? null : Number(event.target.value))} /></td><td><input disabled={basisRole === "result"} type="number" min="1" max="10" step="1" value={integerPriority(target.weight)} onChange={(event) => updateTarget(definition.key, { weight: integerPriority(Number(event.target.value)) })} /></td><td className="target-judgement"><span className={`result-badge ${basisRole === "result" || !targetSet || status.ok ? "ok" : "bad"}`}>{basisRole === "result" ? "自動算出" : !targetSet ? "未設定" : status.ok ? "目標達成" : "目標未達"}</span>{basisRole !== "result" && adjustedPlan && targetSet && !status.ok && <small className="target-adjustment-advice">{suggestions.length ? <><strong>達成に向けた修正候補</strong>{suggestions.map((suggestion) => <label className="target-adjustment-suggestion" key={driverRangeSuggestionId(definition.key, suggestion)}><input type="checkbox" checked={Boolean(selectedAdjustmentSuggestions[driverRangeSuggestionId(definition.key, suggestion)])} onChange={(event) => toggleDriverRangeSuggestion(definition.key, suggestion, event.target.checked)} /><span>{suggestion.text}</span></label>)}<button className="apply-selected-suggestions" type="button" disabled={!suggestions.some((suggestion) => selectedAdjustmentSuggestions[driverRangeSuggestionId(definition.key, suggestion)])} onClick={() => applySelectedDriverRangeSuggestions(definition.key, suggestions)}>選択した候補を一括適用</button></> : <span>現在の許容範囲では有効な拡張候補を特定できません。入力済み将来PLまたは目標値との整合を確認してください。</span>}</small>}</td></tr>;
              })}
            </tbody></table></div>
            <p className="footnote round5-source-note">第5次公式参考値は、申請者全体と採択者の公表代表値です。原則は中央値ですが、「補助事業売上高／全社売上高」のみ平均値です。役員関連2指標は第5次に公表値がありません。<a href="https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/5ji_median.pdf" target="_blank" rel="noreferrer">第5次公式資料 ↗</a></p>
            <p className="footnote">目標値を入力した指標はすべて最適化対象となり、未入力の指標は診断表示だけに使います。上振れの現実性は「将来予測・調整水準」の許容下限・上限で管理するため、指標側の計画上限と扱い区分は設けません。「自動算出」の指標はPLから計算して確認する項目で、保存済みの目標値は切替時のため保持しますが現在の最適化には使いません。「両方に目標設定」では2指標を同時に評価し、調整水準を許容範囲内で最適化します。過去の成長率・増加額は各1年間、計画の増加額は基準年から事業化報告3年目までの{targetComparisonYears}年間です。金額指標の「単純換算」は過去1年間の増加額が同額で続く場合の比較用参考値であり、複利予測ではありません。14・15の役員関連2指標は第6次の評価対象外であり、計算結果の参考表示に限定します。ローカルベンチマークは外部で算出した点数の固定入力であり、目標判定・最適化・PL計算の対象外です。</p>
            <div className="target-action-bar">
              <div>
                <strong>15指標の設定後に実行</strong>
                <small>目標値と優先度を確認してから、調整水準の許容範囲内でPLを目標へ近づけます。</small>
                <p className={`solve-note ${statutoryFailures.length ? "statutory-failure" : ""}`}>{statutoryFailures.length ? `制度条件：${statutoryFailures.join("／")}` : "制度上の必須条件を満たしています。"}</p>
                {solveNote !== "未実行" && <p className="solve-note">{solveNote}</p>}
              </div>
              <div className="target-action-buttons">
                <button className="solve-button" disabled={isSolving} aria-busy={isSolving} onClick={() => void solve()}>{isSolving ? "計算中…" : "設定した目標に近づける"}</button>
                {adjustedPlan && <button className="reset-button" onClick={clearAdjustment}>入力値表示に戻す</button>}
              </div>
            </div>
          </article>
          <div className="workflow-actions"><span>水準と15指標を確認したら、将来PLの自動予測をセル単位で確認・上書きします。</span><button className="solve-button" onClick={() => goToView("future")}>将来データ入力へ →</button></div>
        </section>
      )}

      {view === "logic" && (
        <section className="content-stack">
          <div className="section-intro"><div><p className="eyebrow">AUDIT TRAIL</p><h2>数式と調整ロジック</h2></div><p>Excel化するときも、この順序と依存関係をそのままシートに移します。</p></div>
          <div className="logic-flow">
            <div><span>01</span><strong>実績・根拠</strong><p>過去PL、顧客別数量、単価、能力、常時使用する従業員数、賃金表</p></div><i>→</i><div><span>02</span><strong>補助事業／その他事業PL</strong><p>売上・原価・給与・減価償却・販管費を年度別生成</p></div><i>→</i><div><span>03</span><strong>全社合算</strong><p>二つの事業区分を同じ年度・単位で足し上げる</p></div><i>→</i><div><span>04</span><strong>15指標</strong><p>計画値を算出し、設定した目標値と照合</p></div>
          </div>
          <article className="panel formula-panel">
            <h2>PLと付加価値の恒等式</h2>
            <code>役員人件費 = 役員報酬 + 役員賞与　／　従業員人件費 = 従業員給与 + 従業員賞与</code>
            <code>営業利益 = 売上総利益 − 販管費（役員・従業員人件費、販管費内減価償却費、研究開発費、その他販管費）</code>
            <code>付加価値額 = 営業利益 + 従業員給与支給総額 + 役員給与支給総額 + 減価償却費合計</code>
            <p>売上原価内と販管費内の減価償却費を分離し、付加価値額・EBITDAでは両者の合計を使います。</p>
          </article>
          <article className="panel formula-panel">
            <h2>過去3期から将来PLを作る順序</h2>
            <code>設備導入期間の計画初期値 = 過去実績の単純平均　／　許容範囲 = 平均 ± 2×標準偏差</code>
            <code>基準年後の補助事業売上成長率 = 22%［15～30%］（第5次採択者中央値22%/年を中心）</code>
            <code>補助事業1人当たり給与支給総額の年平均上昇率 = 7%［5～10%］（第5次採択者中央値7%/年、一般企業の第6次要件5%以上）</code>
            <code>基準年後の常時使用する従業員数（就業時間換算）の成長率 = 4%［0～8%］（過去採択統計の給与支給総額伸びと1人当たり給与支給総額伸びの差から補完）</code>
            <code>基準年後の原価率改善 = 1.5pt［0～2pt］（悪化は初期許容範囲に含めず、設備効果を控えめに見込む）</code>
            <code>基準年後・その他事業の計画初期値 = 前々期×20% + 前期×30% + 最新期×50%（水準項目）</code>
            <code>基準年後・その他事業の計画初期値 = 前期までの変化率×40% + 最新期までの変化率×60%（成長項目）</code>
            <code>補助事業売上高(t) = 最新決算期売上高 × (1 + 基準年までの成長率)^経過年数　［最新決算期→基準年］</code>
            <code>補助事業売上高(t) = 基準年売上高 × (1 + 報告期間の成長率)^基準年後年数　［基準年→事業化報告3年目］</code>
            <code>期間末原価率 = 期間開始時原価率 − 原価率改善ポイント（プラスは改善、マイナスは悪化）</code>
            <code>各年度原価率 = 期間開始時原価率と期間末原価率を、経過年数に応じて直線補間</code>
            <code>設備導入期間末のその他販管費率 = 最新決算期のその他販管費率 − 改善ポイント（プラスは改善、マイナスは悪化）</code>
            <code>基準年後の各年度その他販管費率 = 基準年度の実績率と事業化報告3年目の到達値を直線補間</code>
            <p>許容下限・上限は、過去3期の最小・最大に変動幅の50%（最低1pt、率水準は最低2pt）を加え、技術的な上下限内に収めます。過去実績から決められない投資額・補助金額・耐用年数などは自動変更しません。従来の固定サンプル120億円からの割戻しは、画面の自動予測では使用しません。</p>
          </article>
          <article className="panel formula-panel">
            <h2>近似調整の目的関数</h2>
            <code>総損失 = 5,000×目標未達²（優先度で加重） + ドライバー変更幅² + 入力済み年度値からの乖離² + 現実性違反ペナルティ</code>
            <p>入力値は上書きせず、別の調整案を生成します。入力された目標値を優先度に応じて評価し、原価率・販管費率・人員・給与・売上成長率を許容範囲内で動かします。未達時は境界感度を調べ、どの許容下限・上限を見直すと改善するかを表示します。</p>
          </article>
          <article className="panel">
            <div className="formula-list">{metrics.map((definition, index) => <div key={definition.key}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{definition.label}</strong><small>第3次定義</small><code>{definition.round3Formula}</code><small>第6次定義（現在の計算・最適化に使用）</small><code>{definition.round6Formula}</code><small>{definition.sourceRound}</small></div></div>)}</div>
          </article>
          <article className="source-note"><strong>定義上の留意点</strong><p>画面上の計画値、達成判定、目標への自動調整はすべて第6次定義です。過去中央値は旧期間定義で算出されたものを含むため、目標水準の参考値として表示します。役員給与2指標は第6次の賃上げ要件対象外ですが、過去指標として継続管理します。第6次は事前公開版のため、正式版公表時に再照合します。</p><a href="https://chukentou-seichotoushi-hojo.jp/download/" target="_blank" rel="noreferrer">公式資料ダウンロード ↗</a></article>
        </section>
      )}
    </main>
  );
}

type BalanceSheetField = Exclude<keyof BalanceSheetPlan, "year">;

function BalanceSheetEditor({ balanceSheets, historical, inputValues, onChange }: { balanceSheets: BalanceSheetPlan[]; historical: YearPlan[]; inputValues: InputValues; onChange: (yearIndex: number, field: keyof BalanceSheetPlan, value: number | null) => void }) {
  const rows: { code: string; label: string; field?: BalanceSheetField; percent?: boolean; multiple?: boolean; value?: (row: BalanceSheetPlan, index: number) => number }[] = [
    { code: "1-1", label: "資産総額", field: "assets" },
    { code: "1-2", label: "うち流動資産", field: "currentAssets" },
    { code: "1-3", label: "うち現金及び預金", field: "cash" },
    { code: "1-4", label: "うち固定資産", field: "fixedAssets" },
    { code: "1-5", label: "うち有形固定資産", field: "tangibleAssets" },
    { code: "1-6", label: "うち建物及び構築物", field: "buildings" },
    { code: "1-7", label: "うち機械装置等", field: "machinery" },
    { code: "1-8", label: "うち土地", field: "land" },
    { code: "1-9", label: "うち無形固定資産", field: "intangibleAssets" },
    { code: "1-10", label: "うちソフトウェア", field: "software" },
    { code: "1-11", label: "その他資産（自動計算）", value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).otherAssets },
    { code: "1-12", label: "負債及び純資産合計（自動計算）", value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).liabilitiesAndNetAssets },
    { code: "1-13", label: "負債総額", field: "liabilities" },
    { code: "1-14", label: "うち流動負債", field: "currentLiabilities" },
    { code: "1-15", label: "うち短期借入金", field: "shortTermDebt" },
    { code: "1-16", label: "うち固定負債", field: "fixedLiabilities" },
    { code: "1-17", label: "うち長期借入金", field: "longTermDebt" },
    { code: "1-18", label: "その他負債（自動計算）", value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).otherLiabilities },
    { code: "1-19", label: "純資産総額", field: "netAssets" },
    { code: "1-20", label: "うち株主資本", field: "shareholderEquity" },
    { code: "1-21", label: "うち資本金", field: "capital" },
    { code: "1-22", label: "その他純資産（自動計算）", value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).otherNetAssets },
    { code: "1-23", label: "自己資本比率（自動計算）", percent: true, value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).equityRatio },
    { code: "1-24", label: "新規設備投資による支出", field: "capex" },
    { code: "1-25", label: "EBITDA有利子負債倍率（自動計算）", multiple: true, value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).ebitdaDebtMultiple },
  ];
  return <div className="wide-table balance-sheet-table spreadsheet-grid actuals-three-year-table"><table><thead><tr><th>第6次様式項目（億円）</th>{balanceSheets.map((row, index) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[historical[index].role]}</small></th>)}</tr></thead><tbody>{rows.map((item) => <tr className={!item.field ? "emphasis" : ""} key={item.code}><th>{item.code} {item.label}{item.percent && <small>%</small>}{item.multiple && <small>倍</small>}</th>{balanceSheets.map((row, index) => <td key={row.year}>{item.field ? <input type="number" step="0.01" value={getInputValue(inputValues, inputKey.balanceSheet(row.year, item.field))} placeholder="未入力" onChange={(event) => onChange(index, item.field!, event.target.value === "" ? null : Number(event.target.value))} /> : <strong>{number(item.value!(row, index), 2)}</strong>}</td>)}</tr>)}</tbody></table></div>;
}

function FutureCapexEditor({ balanceSheets, historical, futureCapex, inputValues, onChange }: { balanceSheets: BalanceSheetPlan[]; historical: YearPlan[]; futureCapex: { year: number; value: number }[]; inputValues: InputValues; onChange: (yearIndex: number, value: number | null) => void }) {
  return <div className="wide-table spreadsheet-grid future-capex-table"><table><thead><tr><th>第6次様式項目（億円）</th>{balanceSheets.map((row, index) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[historical[index].role]}・参照</small></th>)}{futureCapex.map((row) => <th className="forecast-heading" key={row.year}>{row.year}<small>将来計画・入力</small></th>)}</tr></thead><tbody><tr><th>1-24 新規設備投資による支出</th>{balanceSheets.map((row) => <td className="historical-reference" key={row.year}><strong>{hasInputValue(inputValues, inputKey.balanceSheet(row.year, "capex")) ? number(row.capex, 2) : "—"}</strong></td>)}{futureCapex.map((row, index) => <td key={row.year}><input type="number" step="0.01" value={getInputValue(inputValues, inputKey.futureCapex(row.year))} placeholder="未入力" onChange={(event) => onChange(index, event.target.value === "" ? null : Number(event.target.value))} /></td>)}</tr></tbody></table></div>;
}

function companyEbitda(row: YearPlan) {
  const company = total(row.project, row.other);
  return operatingProfit(company) + company.depreciation;
}

function ManualEditor({ plan, onChange }: { plan: YearPlan[]; onChange: (yearIndex: number, segment: SegmentKey, field: keyof SegmentPlan, value: number) => void }) {
  return <div className="manual-sections">{(["project", "other"] as SegmentKey[]).map((segment) => <div key={segment}><h3>{segment === "project" ? "補助事業PL" : "その他事業PL"}</h3><div className="wide-table"><table><thead><tr><th>{segment === "other" ? "内部管理番号・項目" : "モデル入力項目"}</th>{plan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{plFields.map((field) => <tr key={field.key}><th>{segment === "other" ? `${field.modelCode} ` : ""}{field.label}<small>{field.unit}</small></th>{plan.map((row, index) => <td key={row.year}><input type="number" step="0.1" value={row[segment][field.key]} onChange={(event) => onChange(index, segment, field.key, Number(event.target.value))} /></td>)}</tr>)}</tbody></table></div></div>)}</div>;
}

type ProjectOfficialInputRow = { code: string; label: string; unit: string; digits?: number; get: (segment: SegmentPlan) => number; set: (segment: SegmentPlan, value: number) => Partial<SegmentPlan> };

const projectOfficialInputRows: ProjectOfficialInputRow[] = [
  { code: "7-1", label: "売上高", unit: "億円", get: (s) => s.sales, set: (_s, v) => ({ sales: v }) },
  { code: "7-4", label: "売上総利益", unit: "億円", get: (s) => s.sales - s.cogs, set: (s, v) => ({ cogs: s.sales - v }) },
  { code: "7-6", label: "営業利益", unit: "億円", get: operatingProfit, set: (s, v) => ({ otherSga: s.sales - s.cogs - s.employeePay - s.officerPay - sgaDepreciation(s) - researchDevelopment(s) - v }) },
  { code: "7-8", label: "従業員給与支給総額", unit: "億円", get: (s) => s.employeePay, set: (s, v) => { if (s.employeeSalary === undefined && s.employeeBonus === undefined) return { employeePay: v }; const salary = s.employeePay ? v * employeeSalary(s) / s.employeePay : v; return { employeePay: v, employeeSalary: salary, employeeBonus: v - salary }; } },
  { code: "7-9", label: "役員給与支給総額", unit: "億円", get: (s) => s.officerPay, set: (s, v) => { if (s.officerCompensation === undefined && s.officerBonus === undefined) return { officerPay: v }; const compensation = s.officerPay ? v * officerCompensation(s) / s.officerPay : v; return { officerPay: v, officerCompensation: compensation, officerBonus: v - compensation }; } },
  { code: "7-10", label: "減価償却費", unit: "億円", get: (s) => s.depreciation, set: (s, v) => { if (s.cogsDepreciation === undefined && s.sgaDepreciation === undefined) return { depreciation: v }; const cogsAmount = s.depreciation ? v * cogsDepreciation(s) / s.depreciation : 0; return { depreciation: v, cogsDepreciation: cogsAmount, sgaDepreciation: v - cogsAmount }; } },
  { code: "7-13", label: "常時使用する従業員数（就業時間換算）", unit: "人", digits: 0, get: (s) => s.headcount, set: (_s, v) => ({ headcount: Math.max(0, Math.round(v)) }) },
  { code: "7-14", label: "役員数", unit: "人", digits: 0, get: (s) => s.officerCount, set: (_s, v) => ({ officerCount: Math.max(0, Math.round(v)) }) },
];

type ProjectOfficialDisplayRow = {
  code: string;
  label: string;
  unit: string;
  digits?: number;
  input?: ProjectOfficialInputRow;
  fixed?: boolean;
  get: (rows: YearPlan[], index: number, drivers: Drivers) => number | undefined;
};

const projectInputByCode = new Map(projectOfficialInputRows.map((item) => [item.code, item]));
const projectPayPerEmployee = (segment: SegmentPlan) => segment.headcount ? segment.employeePay / segment.headcount : 0;
const projectPayPerOfficer = (segment: SegmentPlan) => segment.officerCount ? segment.officerPay / segment.officerCount : 0;

const projectOfficialDisplayRows: ProjectOfficialDisplayRow[] = [
  { code: "7-1", label: "売上高", unit: "億円", input: projectInputByCode.get("7-1"), get: (rows, index) => rows[index].project.sales },
  { code: "7-2", label: "売上高成長率", unit: "%", get: (rows, index) => growth(rows[index].project.sales, index ? rows[index - 1].project.sales : undefined) },
  { code: "7-3", label: "全社売上高に占める補助事業売上高の割合", unit: "%", get: (rows, index) => rate(rows[index].project.sales, companySegment(rows, index).sales) },
  { code: "7-4", label: "売上総利益", unit: "億円", input: projectInputByCode.get("7-4"), get: (rows, index) => rows[index].project.sales - rows[index].project.cogs },
  { code: "7-5", label: "売上総利益率", unit: "%", get: (rows, index) => rate(rows[index].project.sales - rows[index].project.cogs, rows[index].project.sales) },
  { code: "7-6", label: "営業利益", unit: "億円", input: projectInputByCode.get("7-6"), get: (rows, index) => operatingProfit(rows[index].project) },
  { code: "7-7", label: "営業利益率", unit: "%", get: (rows, index) => rate(operatingProfit(rows[index].project), rows[index].project.sales) },
  { code: "7-8", label: "給与支給総額（常時使用する従業員）", unit: "億円", input: projectInputByCode.get("7-8"), get: (rows, index) => rows[index].project.employeePay },
  { code: "7-9", label: "給与支給総額（役員）", unit: "億円", input: projectInputByCode.get("7-9"), get: (rows, index) => rows[index].project.officerPay },
  { code: "7-10", label: "減価償却費（合計）", unit: "億円", input: projectInputByCode.get("7-10"), get: (rows, index) => rows[index].project.depreciation },
  { code: "7-11", label: "付加価値額", unit: "億円", get: (rows, index) => valueAdded(rows[index].project) },
  { code: "7-12", label: "付加価値増加率", unit: "%", get: (rows, index) => growth(valueAdded(rows[index].project), index ? valueAdded(rows[index - 1].project) : undefined) },
  { code: "7-13", label: "常時使用する従業員数（就業時間換算）", unit: "人", digits: 0, input: projectInputByCode.get("7-13"), get: (rows, index) => rows[index].project.headcount },
  { code: "7-14", label: "役員数", unit: "人", digits: 0, input: projectInputByCode.get("7-14"), get: (rows, index) => rows[index].project.officerCount },
  { code: "7-15", label: "従業員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => projectPayPerEmployee(rows[index].project) },
  { code: "7-16", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", get: (rows, index) => growth(projectPayPerEmployee(rows[index].project), index ? projectPayPerEmployee(rows[index - 1].project) : undefined) },
  { code: "7-17", label: "役員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => projectPayPerOfficer(rows[index].project) },
  { code: "7-18", label: "役員1人当たり給与支給総額の上昇率", unit: "%", get: (rows, index) => growth(projectPayPerOfficer(rows[index].project), index ? projectPayPerOfficer(rows[index - 1].project) : undefined) },
  { code: "7-19", label: "労働生産性", unit: "億円/人", get: (rows, index) => { const segment = rows[index].project; const people = segment.headcount + segment.officerCount; return people ? valueAdded(segment) / people : 0; } },
  { code: "7-20", label: "市場伸び率（年あたり）", unit: "%", fixed: true, get: (_rows, _index, drivers) => drivers.projectMarketGrowth * 100 },
];

type CompanyActualInputRow = {
  code: string;
  label: string;
  unit?: string;
  groupStart?: boolean;
  get: (rows: YearPlan[], index: number) => number | undefined;
  set?: (row: YearPlan, value: number) => Partial<SegmentPlan>;
};

const companySgaTotal = (segment: SegmentPlan) =>
  segment.employeePay + segment.officerPay + sgaDepreciation(segment) + researchDevelopment(segment) + segment.otherSga;

const preserveSgaTotal = (segment: SegmentPlan, patch: Partial<SegmentPlan>, componentDelta: number): Partial<SegmentPlan> => ({
  ...patch,
  otherSga: segment.otherSga - componentDelta,
});

const companyActualInputRows: CompanyActualInputRow[] = [
  { code: "2-1", label: "売上高", get: (rows, index) => companySegment(rows, index).sales, set: (row, value) => ({ sales: value - row.project.sales }) },
  { code: "2-2", label: "売上高成長率", unit: "%", get: (rows, index) => growth(companySegment(rows, index).sales, index ? companySegment(rows, index - 1).sales : undefined) },
  { code: "2-3", label: "売上原価", get: (rows, index) => companySegment(rows, index).cogs, set: (row, value) => ({ cogs: value - row.project.cogs }) },
  { code: "2-4", label: "うち減価償却費", get: (rows, index) => cogsDepreciation(companySegment(rows, index)), set: (row, value) => { const next = value - cogsDepreciation(row.project); return { cogsDepreciation: next, depreciation: next + sgaDepreciation(row.other) }; } },
  { code: "2-5", label: "売上総利益", get: (rows, index) => { const company = companySegment(rows, index); return company.sales - company.cogs; } },
  { code: "2-6", label: "売上総利益率", unit: "%", get: (rows, index) => { const company = companySegment(rows, index); return rate(company.sales - company.cogs, company.sales); } },
  { code: "2-7", label: "販売費及び一般管理費", get: (rows, index) => companySgaTotal(companySegment(rows, index)), set: (row, value) => ({ otherSga: value - companySgaTotal(row.project) - row.other.employeePay - row.other.officerPay - sgaDepreciation(row.other) - researchDevelopment(row.other) }) },
  { code: "2-8", label: "うち役員の人件費（自動計算）", get: (rows, index) => companySegment(rows, index).officerPay },
  { code: "2-9", label: "うち役員報酬", get: (rows, index) => officerCompensation(companySegment(rows, index)), set: (row, value) => { const next = value - officerCompensation(row.project); const nextPay = next + officerBonus(row.other); return preserveSgaTotal(row.other, { officerCompensation: next, officerPay: nextPay }, nextPay - row.other.officerPay); } },
  { code: "2-10", label: "うち役員賞与", get: (rows, index) => officerBonus(companySegment(rows, index)), set: (row, value) => { const next = value - officerBonus(row.project); const nextPay = officerCompensation(row.other) + next; return preserveSgaTotal(row.other, { officerBonus: next, officerPay: nextPay }, nextPay - row.other.officerPay); } },
  { code: "2-11", label: "うち従業員の人件費（自動計算）", get: (rows, index) => companySegment(rows, index).employeePay },
  { code: "2-12", label: "うち従業員の給与", get: (rows, index) => employeeSalary(companySegment(rows, index)), set: (row, value) => { const next = value - employeeSalary(row.project); const nextPay = next + employeeBonus(row.other); return preserveSgaTotal(row.other, { employeeSalary: next, employeePay: nextPay }, nextPay - row.other.employeePay); } },
  { code: "2-13", label: "うち従業員の賞与", get: (rows, index) => employeeBonus(companySegment(rows, index)), set: (row, value) => { const next = value - employeeBonus(row.project); const nextPay = employeeSalary(row.other) + next; return preserveSgaTotal(row.other, { employeeBonus: next, employeePay: nextPay }, nextPay - row.other.employeePay); } },
  { code: "2-14", label: "うち減価償却費", get: (rows, index) => sgaDepreciation(companySegment(rows, index)), set: (row, value) => { const next = value - sgaDepreciation(row.project); return preserveSgaTotal(row.other, { sgaDepreciation: next, depreciation: cogsDepreciation(row.other) + next }, next - sgaDepreciation(row.other)); } },
  { code: "2-15", label: "うち研究開発費", get: (rows, index) => researchDevelopment(companySegment(rows, index)), set: (row, value) => { const next = value - researchDevelopment(row.project); return preserveSgaTotal(row.other, { researchDevelopment: next }, next - researchDevelopment(row.other)); } },
  { code: "2-16", label: "営業利益", get: (rows, index) => operatingProfit(companySegment(rows, index)) },
  { code: "2-17", label: "営業利益率", unit: "%", get: (rows, index) => { const company = companySegment(rows, index); return rate(operatingProfit(company), company.sales); } },
  { code: "2-18", label: "経常利益", get: (rows, index) => operatingProfit(companySegment(rows, index)) },
  { code: "2-19", label: "税引前当期純利益（モデル未対応）", get: () => undefined },
  { code: "2-20", label: "当期純利益（モデル未対応）", get: () => undefined },
  { code: "2-21", label: "給与支給総額（常時使用する従業員）", groupStart: true, get: (rows, index) => companySegment(rows, index).employeePay },
  { code: "2-22", label: "給与支給総額（役員）", get: (rows, index) => companySegment(rows, index).officerPay },
  { code: "2-23", label: "減価償却費（合計）", get: (rows, index) => companySegment(rows, index).depreciation },
  { code: "2-24", label: "付加価値額", get: (rows, index) => valueAdded(companySegment(rows, index)) },
  { code: "2-25", label: "付加価値増加率", unit: "%", get: (rows, index) => growth(valueAdded(companySegment(rows, index)), index ? valueAdded(companySegment(rows, index - 1)) : undefined) },
  { code: "2-26", label: "売上高付加価値率", unit: "%", get: (rows, index) => { const company = companySegment(rows, index); return rate(valueAdded(company), company.sales); } },
  { code: "2-27", label: "常時使用する従業員数（就業時間換算）", unit: "人", get: (rows, index) => companySegment(rows, index).headcount },
  { code: "2-28", label: "役員数", unit: "人", get: (rows, index) => companySegment(rows, index).officerCount },
  { code: "2-29", label: "従業員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => { const company = companySegment(rows, index); return company.headcount ? company.employeePay / company.headcount : 0; } },
  { code: "2-30", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", get: (rows, index) => { const current = companySegment(rows, index); const previous = index ? companySegment(rows, index - 1) : undefined; return growth(current.headcount ? current.employeePay / current.headcount : 0, previous?.headcount ? previous.employeePay / previous.headcount : undefined); } },
  { code: "2-31", label: "役員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => { const company = companySegment(rows, index); return company.officerCount ? company.officerPay / company.officerCount : 0; } },
  { code: "2-32", label: "役員1人当たり給与支給総額の上昇率", unit: "%", get: (rows, index) => { const current = companySegment(rows, index); const previous = index ? companySegment(rows, index - 1) : undefined; return growth(current.officerCount ? current.officerPay / current.officerCount : 0, previous?.officerCount ? previous.officerPay / previous.officerCount : undefined); } },
  { code: "2-33", label: "労働生産性", unit: "億円/人", get: (rows, index) => { const company = companySegment(rows, index); const people = company.headcount + company.officerCount; return people ? valueAdded(company) / people : 0; } },
  { code: "2-34", label: "EBITDA", get: (rows, index) => { const company = companySegment(rows, index); return operatingProfit(company) + company.depreciation; } },
  { code: "2-35", label: "EBITDAマージン", unit: "%", get: (rows, index) => { const company = companySegment(rows, index); return rate(operatingProfit(company) + company.depreciation, company.sales); } },
  { code: "2-36", label: "EBITDA増加率", unit: "%", get: (rows, index) => { const company = companySegment(rows, index); const previous = index ? companySegment(rows, index - 1) : undefined; return growth(operatingProfit(company) + company.depreciation, previous ? operatingProfit(previous) + previous.depreciation : undefined); } },
];

function HistoricalInputsEditor({ historical, inputValues, onHistoricalCompanyChange, onHistoricalProjectChange }: {
  historical: YearPlan[];
  inputValues: InputValues;
  onHistoricalCompanyChange: (yearIndex: number, item: CompanyActualInputRow, value: number | null) => void;
  onHistoricalProjectChange: (yearIndex: number, item: ProjectOfficialInputRow, value: number | null) => void;
}) {
  return <div className="manual-sections spreadsheet-grid">
    <div><h3>会社全体にかかる損益計算書・関連計算項目（過去3期実績）</h3><div className="wide-table actuals-three-year-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{historical.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{companyActualInputRows.map((item) => <tr className={`${!item.set ? "emphasis" : ""}${item.groupStart ? " official-related-start" : ""}`} key={item.code}><th>{item.code} {item.label}{item.groupStart && <small>P/L関連計算項目</small>}{item.unit && <small>{item.unit}</small>}</th>{historical.map((row, index) => { const value = item.get(historical, index); return <td key={row.year}>{item.set ? <input type="number" step="0.01" value={getInputValue(inputValues, inputKey.companyActual(row.year, item.code))} placeholder="未入力" onChange={(event) => onHistoricalCompanyChange(index, item, event.target.value === "" ? null : Number(event.target.value))} /> : <strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong>}</td>; })}</tr>)}</tbody></table></div></div>
    <div><h3>補助事業PL（過去3期実績）</h3><div className="wide-table actuals-three-year-table"><table><thead><tr><th>第6次様式項目</th>{historical.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{projectOfficialInputRows.map((item) => <tr key={item.code}><th>{item.code} {item.label}<small>{item.unit}</small></th>{historical.map((row, index) => <td key={row.year}><input type="number" step={item.digits === 0 ? 1 : 0.01} value={getInputValue(inputValues, inputKey.projectActual(row.year, item.code))} placeholder="未入力" onChange={(event) => onHistoricalProjectChange(index, item, event.target.value === "" ? null : Number(event.target.value))} /></td>)}</tr>)}</tbody></table></div></div>
    <p className="footnote">その他事業の過去3期は「会社全体－補助事業」で自動算出するため、重複入力しません。</p>
  </div>;
}

function FutureInputsEditor({ historical, autoPlan, effectivePlan, overrides, inputValues, futureInputBasis, drivers, onForecastChange }: {
  historical: YearPlan[];
  autoPlan: YearPlan[];
  effectivePlan: YearPlan[];
  overrides: ForecastOverrides;
  inputValues: InputValues;
  futureInputBasis: FutureInputBasis;
  drivers: Drivers;
  onForecastChange: (year: number, segment: ForecastSegment, item: string, value: number | null) => void;
}) {
  const futureRows = autoPlan.slice(historical.length);
  const effectiveByYear = new Map(effectivePlan.map((row) => [row.year, row]));
  const rawPlaceholder = (value: number, digits = 2) => String(roundedInput(value, digits));
  const projectActualEntered = (year: number) => projectOfficialInputRows.some((item) => hasInputValue(inputValues, inputKey.projectActual(year, item.code)));
  return <div className="manual-sections spreadsheet-grid">
    <div>
      <h3>補助事業収支計画（7-1～7-20：過去3期参照 → 事業化報告3年目）</h3>
      <div className="wide-table"><table><thead><tr><th>第6次様式項目</th>{historical.map((row) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・参照</small></th>)}{futureRows.map((row) => <th key={row.year} className="forecast-heading">{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・空欄は自動予測</small></th>)}</tr></thead>
        <tbody>{projectOfficialDisplayRows.map((item) => <tr className={!item.input ? "calculated-row" : ""} key={item.code}>
          <th>{item.code} {item.label}<small>{item.unit}／{item.input ? "入力・上書き可" : item.fixed ? "固定前提" : "自動計算"}</small></th>
          {historical.map((row, index) => {
            const show = !item.fixed && projectActualEntered(row.year) && (!index || projectActualEntered(historical[index - 1].year) || !["7-2", "7-12", "7-16", "7-18"].includes(item.code));
            const value = show ? item.get(historical, index, drivers) : undefined;
            return <td className="historical-reference" key={row.year}><strong>{value === undefined ? "—" : number(value, item.digits ?? 2)}</strong></td>;
          })}
          {futureRows.map((row) => {
            const index = effectivePlan.findIndex((candidate) => candidate.year === row.year);
            const value = item.get(effectivePlan, index, drivers);
            if (!item.input) return <td className="calculated-cell" key={row.year}><strong>{value === undefined ? "—" : number(value, item.digits ?? 2)}</strong><small>{item.fixed ? "固定前提" : "自動計算"}</small></td>;
            const key = forecastOverrideKey(row.year, "project", item.code);
            const overridden = Object.prototype.hasOwnProperty.call(overrides, key);
            return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={item.digits === 0 ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(value ?? 0, item.digits ?? 2)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "project", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>;
          })}
        </tr>)}</tbody>
      </table></div>
      <p className="footnote">7-1・7-4・7-6・7-8～7-10・7-13・7-14は入力値です。7-2・7-3・7-5・7-7・7-11・7-12・7-15～7-19は第6次Excelと同じ関係式で自動計算し、7-20は「15指標・目標」の市場伸び率を参照します。</p>
    </div>
    <div>
      <h3>会社全体の損益計算書・関連計算項目（2-1～2-36：過去3期参照 → 将来）</h3>
      <div className="wide-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{historical.map((row) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・参照</small></th>)}{futureRows.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead>
        <tbody>{companyActualInputRows.map((item) => <tr className={`${!item.set ? "emphasis" : ""}${item.groupStart ? " official-related-start" : ""}`} key={item.code}>
          <th>{item.code} {item.label}{item.groupStart && <small>P/L関連計算項目</small>}{item.unit && <small>{item.unit}</small>}</th>
          {historical.map((row, index) => { const value = item.get(historical, index); return <td className="historical-reference" key={row.year}><strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong></td>; })}
          {futureRows.map((row) => {
            const index = effectivePlan.findIndex((candidate) => candidate.year === row.year);
            const value = item.get(effectivePlan, index);
            if (futureInputBasis !== "company" || !item.set) return <td className={!item.set ? "calculated-cell" : undefined} key={row.year}><strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong>{!item.set && value !== undefined && <small>自動計算</small>}</td>;
            const key = forecastOverrideKey(row.year, "company", item.code);
            const overridden = Object.prototype.hasOwnProperty.call(overrides, key);
            return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step="0.1" value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(value ?? 0)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "company", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>;
          })}
        </tr>)}</tbody>
      </table></div>
      <p className="footnote">2-1～2-20を損益計算書、2-21～2-36を給与・付加価値・人数・EBITDAの「P/L関連計算項目」として区切っています。2-19・2-20は税金・特別損益の前提がないため、現時点ではモデル未対応です。</p>
    </div>
    <div><h3>その他事業PL（過去3期参照 → 事業化報告3年目）</h3><div className="wide-table"><table><thead><tr><th>内部管理番号・項目</th>{historical.map((row) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・自動算出参照</small></th>)}{futureRows.map((row) => <th key={row.year} className={futureInputBasis === "other" ? "forecast-heading" : undefined}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・{futureInputBasis === "other" ? "空欄は自動予測" : "自動算出"}</small></th>)}</tr></thead><tbody>{plFields.map((item) => <tr key={item.key}><th>{item.modelCode} {item.label}<small>{item.unit}</small></th>{historical.map((row) => <td className="historical-reference" key={row.year}><strong>{number(row.other[item.key], item.digits ?? 2)}</strong></td>)}{futureRows.map((row) => { const effective = effectiveByYear.get(row.year)!.other; if (futureInputBasis === "company") return <td key={row.year}><strong>{number(effective[item.key], item.digits ?? 2)}</strong></td>; const key = forecastOverrideKey(row.year, "other", item.key); const overridden = Object.prototype.hasOwnProperty.call(overrides, key); return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={item.digits === 0 ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(effective[item.key], item.digits ?? 2)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "other", item.key, event.target.value === "" ? null : Number(event.target.value))} /></td>; })}</tr>)}</tbody></table></div></div>
  </div>;
}

function AutoRequiredInputsEditor({ historical, autoPlan, effectivePlan, overrides, futureInputBasis, onHistoricalCompanyChange, onHistoricalProjectChange, onForecastChange }: { historical: YearPlan[]; autoPlan: YearPlan[]; effectivePlan: YearPlan[]; overrides: ForecastOverrides; futureInputBasis: FutureInputBasis; onHistoricalCompanyChange: (yearIndex: number, item: CompanyActualInputRow, value: number) => void; onHistoricalProjectChange: (yearIndex: number, item: ProjectOfficialInputRow, value: number) => void; onForecastChange: (year: number, segment: ForecastSegment, item: string, value: number | null) => void }) {
  const futureProjectRows = autoPlan.slice(historical.length);
  const effectiveProjectByYear = new Map(effectivePlan.map((row) => [row.year, row.project]));
  const effectiveOtherByYear = new Map(effectivePlan.map((row) => [row.year, row.other]));
  const rawPlaceholder = (value: number) => String(roundedInput(value));
  return <div className="manual-sections spreadsheet-grid">
    <div><h3>会社全体にかかる損益計算書（過去3期実績 → 事業化報告3年目）</h3><div className="wide-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{effectivePlan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{companyActualInputRows.map((item) => <tr className={!item.set ? "emphasis" : ""} key={item.code}><th>{item.code} {item.label}{item.unit && <small>{item.unit}</small>}</th>{effectivePlan.map((row, index) => { const isActual = index < historical.length; const value = item.get(isActual ? historical : effectivePlan, index); if (isActual) return <td key={row.year}>{item.set ? <input type="number" step="0.1" value={value ?? 0} onChange={(event) => onHistoricalCompanyChange(index, item, Number(event.target.value))} /> : <strong>{value === undefined ? "—" : number(value, 2)}</strong>}</td>; if (futureInputBasis !== "company") return <td key={row.year}><span className="future-empty">—</span></td>; if (!item.set) return <td key={row.year}><strong>{value === undefined ? "—" : number(value, 2)}</strong></td>; const key = forecastOverrideKey(row.year, "company", item.code); const overridden = Object.prototype.hasOwnProperty.call(overrides, key); return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step="0.1" value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(value ?? 0)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "company", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>; })}</tr>)}</tbody></table></div><p className="footnote">「全社PLを入力」を選ぶと将来欄が青枠になり、その他事業PLを「全社－補助事業」で自動計算します。「その他事業PLを入力」では将来欄を空欄表示します。</p></div>
    <div><h3>補助事業PL（過去3期実績 → 補助事業期間 → 基準年 → 事業化報告3年目）</h3><div className="wide-table"><table><thead><tr><th>第6次様式項目</th>{historical.map((row) => <th key={`actual-${row.year}`}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}{futureProjectRows.map((row) => <th key={`future-${row.year}`} className="forecast-heading">{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・自動予測</small></th>)}</tr></thead><tbody>{projectOfficialInputRows.map((item) => <tr key={item.code}><th>{item.code} {item.label}<small>{item.unit}</small></th>{historical.map((row, index) => <td key={`actual-${row.year}`}><input type="number" step="0.1" value={item.get(row.project)} onChange={(event) => onHistoricalProjectChange(index, item, Number(event.target.value))} /></td>)}{futureProjectRows.map((row) => { const key = forecastOverrideKey(row.year, "project", item.code); const overridden = Object.prototype.hasOwnProperty.call(overrides, key); const effective = effectiveProjectByYear.get(row.year)!; return <td key={`future-${row.year}`}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step="0.1" value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(item.get(effective))} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "project", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>; })}</tr>)}</tbody></table></div><p className="footnote">過去3期は白枠の必須入力です。補助事業期間～事業化報告3年目は青枠で自動予測し、入力したセルだけ固定します。固定値を入れると、それ以降の空欄年度を再予測します。</p></div>
    <div><h3>その他事業PL（過去3期自動算出 → 事業化報告3年目）</h3><div className="wide-table"><table><thead><tr><th>内部管理番号・項目</th>{autoPlan.map((row) => <th key={row.year} className={row.year > historical.at(-1)!.year && futureInputBasis === "other" ? "forecast-heading" : undefined}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}{row.year > historical.at(-1)!.year ? futureInputBasis === "other" ? "・入力" : "・自動算出" : "・自動算出"}</small></th>)}</tr></thead><tbody>{plFields.map((item) => <tr key={item.key}><th>{item.modelCode} {item.label}<small>{item.unit}</small></th>{autoPlan.map((row, index) => { const isActual = index < historical.length; const effective = effectiveOtherByYear.get(row.year)!; if (isActual || futureInputBasis === "company") return <td key={row.year}><strong>{number(effective[item.key], 2)}</strong></td>; const key = forecastOverrideKey(row.year, "other", item.key); const overridden = Object.prototype.hasOwnProperty.call(overrides, key); return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step="0.1" value={overridden ? effective[item.key] : ""} placeholder={rawPlaceholder(effective[item.key])} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "other", item.key, event.target.value === "" ? null : Number(event.target.value))} /></td>; })}</tr>)}</tbody></table></div><p className="footnote">「その他事業PLを入力」を選ぶと将来欄が青枠になります。「全社PLを入力」では、将来値を「全社PL－補助事業PL」で自動表示します。</p></div>
  </div>;
}

function PlTable({ title, plan, sourcePlan, segment }: { title: string; plan: YearPlan[]; sourcePlan?: YearPlan[]; segment: SegmentKey }) {
  const rows: { label: string; value: (row: YearPlan) => number; emphasis?: boolean }[] = [
    { label: "売上高", value: (row) => row[segment].sales, emphasis: true },
    { label: "売上原価", value: (row) => row[segment].cogs },
    { label: "粗利益", value: (row) => row[segment].sales - row[segment].cogs, emphasis: true },
    { label: "従業員給与支給総額", value: (row) => row[segment].employeePay },
    { label: "役員給与支給総額", value: (row) => row[segment].officerPay },
    { label: "減価償却費", value: (row) => row[segment].depreciation },
    { label: "その他販管費", value: (row) => row[segment].otherSga },
    { label: "営業利益", value: (row) => operatingProfit(row[segment]), emphasis: true },
    { label: "付加価値額", value: (row) => valueAdded(row[segment]), emphasis: true },
    { label: "常時使用する従業員数（就業時間換算）", value: (row) => row[segment].headcount },
    { label: "役員数", value: (row) => row[segment].officerCount },
  ];
  return <article className="panel table-panel"><h2>{title}</h2><div className="wide-table"><table><thead><tr><th>億円（人数項目のみ人）</th>{plan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{rows.map((item) => <tr className={item.emphasis ? "emphasis" : ""} key={item.label}><th>{item.label}</th>{plan.map((row, index) => <td key={row.year}>{sourcePlan && <small className="before-cell">{number(item.value(sourcePlan[index]))} →</small>}<strong className={sourcePlan ? "after-cell" : ""}>{number(item.value(row))}</strong></td>)}</tr>)}</tbody></table></div></article>;
}

type ChartSeries = {
  label: string;
  color: string;
  values: (number | undefined)[];
};

function TrendChart({ title, subtitle, unit, plan, series }: { title: string; subtitle: string; unit: string; plan: YearPlan[]; series: ChartSeries[] }) {
  const width = 720;
  const height = 270;
  const margin = { top: 22, right: 22, bottom: 42, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const latestIndex = Math.max(0, plan.findIndex((row) => row.role === "latest"));
  const baseIndex = plan.findIndex((row) => row.role === "base");
  const finiteValues = series.flatMap((item) => item.values).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const rawMin = finiteValues.length ? Math.min(...finiteValues) : 0;
  const rawMax = finiteValues.length ? Math.max(...finiteValues) : 1;
  const minValue = rawMin >= 0 ? 0 : rawMin - Math.max((rawMax - rawMin) * 0.12, 1);
  const maxValue = rawMax <= 0 ? 0 : rawMax + Math.max((rawMax - rawMin) * 0.12, rawMax * 0.06, 1);
  const span = Math.max(maxValue - minValue, 1);
  const x = (index: number) => margin.left + (plan.length === 1 ? plotWidth / 2 : plotWidth * index / (plan.length - 1));
  const y = (value: number) => margin.top + plotHeight * (1 - (value - minValue) / span);
  const pathFor = (values: (number | undefined)[], start: number, end: number) => {
    let open = false;
    return values.slice(start, end + 1).map((value, offset) => {
      if (value === undefined || !Number.isFinite(value)) { open = false; return ""; }
      const command = open ? "L" : "M";
      open = true;
      return `${command}${x(start + offset).toFixed(1)},${y(value).toFixed(1)}`;
    }).join(" ");
  };
  const axisLabel = (value: number) => Math.abs(value) >= 100 ? number(value, 0) : number(value, 1);

  return <article className="trend-chart-card">
    <div className="trend-chart-title"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{unit}</span></div>
    <svg className="trend-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}の年度推移。実線は過去実績、破線は将来予測。`}>
      <rect className="trend-chart-future-area" x={x(latestIndex)} y={margin.top} width={Math.max(0, width - margin.right - x(latestIndex))} height={plotHeight} />
      {[0, 0.5, 1].map((position) => {
        const gridValue = maxValue - span * position;
        return <g key={position}><line className="trend-chart-gridline" x1={margin.left} y1={margin.top + plotHeight * position} x2={width - margin.right} y2={margin.top + plotHeight * position} /><text className="trend-chart-axis-label" x={margin.left - 9} y={margin.top + plotHeight * position + 4} textAnchor="end">{axisLabel(gridValue)}</text></g>;
      })}
      {baseIndex >= 0 && <g><line className="trend-chart-base-line" x1={x(baseIndex)} y1={margin.top} x2={x(baseIndex)} y2={margin.top + plotHeight} /><text className="trend-chart-boundary-label" x={x(baseIndex)} y={margin.top + 12} textAnchor="middle">基準年</text></g>}
      <text className="trend-chart-boundary-label" x={x(latestIndex) + 7} y={margin.top + plotHeight - 8}>予測</text>
      {series.map((item) => <g key={item.label}>
        <path className="trend-chart-line actual" d={pathFor(item.values, 0, latestIndex)} stroke={item.color} />
        <path className="trend-chart-line forecast" d={pathFor(item.values, latestIndex, plan.length - 1)} stroke={item.color} />
        {item.values.map((value, index) => value === undefined || !Number.isFinite(value) ? null : <circle key={`${item.label}-${plan[index].year}`} className={index <= latestIndex ? "trend-chart-point actual" : "trend-chart-point forecast"} cx={x(index)} cy={y(value)} r="3.3" stroke={item.color} fill={index <= latestIndex ? item.color : "var(--panel)"} />)}
      </g>)}
      {plan.map((row, index) => <text className="trend-chart-year" key={row.year} x={x(index)} y={height - 15} textAnchor="middle">{row.year}</text>)}
    </svg>
    <div className="trend-chart-legend" aria-label="系列凡例">{series.map((item) => {
      const lastValue = [...item.values].reverse().find((value) => value !== undefined && Number.isFinite(value));
      return <span key={item.label}><i style={{ background: item.color }} />{item.label}<strong>{lastValue === undefined ? "—" : number(lastValue, unit === "億円" ? 2 : 1)}</strong></span>;
    })}</div>
  </article>;
}

function DiagnosticCharts({ plan }: { plan: YearPlan[] }) {
  const company = plan.map((row) => total(row.project, row.other));
  const chartRate = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : undefined;
  const perEmployee = (segment: SegmentPlan) => segment.headcount ? segment.employeePay / segment.headcount : undefined;
  const productivity = (segment: SegmentPlan) => segment.headcount + segment.officerCount ? valueAdded(segment) / (segment.headcount + segment.officerCount) : undefined;
  const latestIndex = Math.max(0, plan.findIndex((row) => row.role === "latest"));
  const indexed = (values: (number | undefined)[]) => {
    const base = values[latestIndex];
    return base && Number.isFinite(base) ? values.map((value) => value === undefined ? undefined : value / base * 100) : values.map(() => undefined);
  };
  const colors = { company: "var(--chart-company)", project: "var(--chart-project)", other: "var(--chart-other)" };

  return <section className="diagnostic-charts" aria-labelledby="diagnostic-chart-heading">
    <div className="diagnostic-chart-heading"><div><p className="card-kicker">TREND CHECK</p><h2 id="diagnostic-chart-heading">主要指標の推移チャート</h2></div><p>過去実績から将来予測へのつながり、基準年の段差、事業間の乖離を視覚的に確認します。</p></div>
    <div className="diagnostic-chart-grid">
      <TrendChart title="売上高" subtitle="全社と事業別の規模・成長ペース" unit="億円" plan={plan} series={[
        { label: "全社", color: colors.company, values: company.map((segment) => segment.sales) },
        { label: "補助事業", color: colors.project, values: plan.map((row) => row.project.sales) },
        { label: "その他事業", color: colors.other, values: plan.map((row) => row.other.sales) },
      ]} />
      <TrendChart title="収益性（全社）" subtitle="原価・その他販管費・営業利益の率" unit="%" plan={plan} series={[
        { label: "売上原価率", color: colors.project, values: company.map((segment) => chartRate(segment.cogs, segment.sales)) },
        { label: "その他販管費率", color: colors.other, values: company.map((segment) => chartRate(segment.otherSga, segment.sales)) },
        { label: "営業利益率", color: colors.company, values: company.map((segment) => chartRate(operatingProfit(segment), segment.sales)) },
      ]} />
      <TrendChart title="人員・1人当たり給与" subtitle="最新決算期を100とした全社指数" unit="指数" plan={plan} series={[
        { label: "従業員数", color: colors.other, values: indexed(company.map((segment) => segment.headcount)) },
        { label: "従業員1人当たり給与", color: colors.company, values: indexed(company.map(perEmployee)) },
      ]} />
      <TrendChart title="労働生産性" subtitle="付加価値額÷（従業員数＋役員数）" unit="億円/人" plan={plan} series={[
        { label: "全社", color: colors.company, values: company.map(productivity) },
        { label: "補助事業", color: colors.project, values: plan.map((row) => productivity(row.project)) },
        { label: "その他事業", color: colors.other, values: plan.map((row) => productivity(row.other)) },
      ]} />
    </div>
    <p className="trend-chart-note"><span className="solid-sample" />実線：過去実績 <span className="dash-sample" />破線：将来予測。チャートは診断用であり、数値の編集は「将来データ入力」で行います。</p>
  </section>;
}

function BehaviorChangeTable({ plan, balanceSheets, futureCapex, timeline }: { plan: YearPlan[]; balanceSheets: BalanceSheetPlan[]; futureCapex: { year: number; value: number }[]; timeline: TimelineSettings }) {
  const actualRows = plan.slice(0, 3);
  const latest = plan.find((row) => row.role === "latest")!;
  const base = plan.find((row) => row.role === "base")!;
  const report3 = plan.find((row) => row.role === "report3")!;
  const cagr = (start: number, end: number, years: number) => start > 0 && end >= 0 && years > 0 ? ((end / start) ** (1 / years) - 1) * 100 : undefined;
  const perHead = (segment: SegmentPlan, employees: boolean) => employees
    ? (segment.headcount > 0 ? segment.employeePay / segment.headcount : 0)
    : (segment.officerCount > 0 ? segment.officerPay / segment.officerCount : 0);
  const companyAt = (row: YearPlan) => total(row.project, row.other);
  const wageCagr = (start: SegmentPlan, end: SegmentPlan, years: number, useEmployees: boolean) => cagr(perHead(start, useEmployees), perHead(end, useEmployees), years);
  const companyBase = companyAt(base);
  const useCompanyEmployees = companyBase.headcount > 0;
  const useProjectEmployees = base.project.headcount > 0;
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  const historicalInvestment = average(balanceSheets.map((row) => row.capex * 100000));
  const implementationInvestment = average(futureCapex.filter((row) => row.year >= timeline.baseYear && row.year <= timeline.baseYear + 3).map((row) => row.value * 100000));
  const rows: { code: string; label: string; unit: "千円" | "%"; company?: number; project?: number; formula: string }[] = [
    { code: "4-1", label: "年間平均投資額（従前）", unit: "千円", company: historicalInvestment, formula: "過去3期の1-24 新規設備投資による支出の平均" },
    { code: "4-2", label: "年間平均投資額（補助事業実施時）", unit: "千円", company: implementationInvestment, formula: "基準年～事業化報告3年目の設備投資額の平均" },
    { code: "4-3", label: "年間賃上げ率（従前）", unit: "%", company: wageCagr(companyAt(actualRows[0]), companyAt(actualRows[2]), 2, useCompanyEmployees), project: wageCagr(actualRows[0].project, actualRows[2].project, 2, useProjectEmployees), formula: "過去3期の1人当たり給与支給総額のCAGR" },
    { code: "4-4", label: "年間賃上げ率（補助事業期間内）", unit: "%", company: wageCagr(companyAt(latest), companyBase, timeline.baseYear - timeline.latestYear, useCompanyEmployees), project: wageCagr(latest.project, base.project, timeline.baseYear - timeline.latestYear, useProjectEmployees), formula: "最新決算期→基準年の1人当たり給与支給総額CAGR" },
    { code: "4-5", label: "年間賃上げ率（補助事業化後）", unit: "%", company: wageCagr(companyBase, companyAt(report3), 3, useCompanyEmployees), project: wageCagr(base.project, report3.project, 3, useProjectEmployees), formula: "基準年→事業化報告3年目の1人当たり給与支給総額CAGR" },
    { code: "4-6", label: "年間売上成長率（従前）", unit: "%", company: cagr(companyAt(actualRows[0]).sales, companyAt(actualRows[2]).sales, 2), formula: "過去3期の全社売上高CAGR" },
    { code: "4-7", label: "年間売上成長率（補助事業実施時）", unit: "%", company: cagr(companyBase.sales, companyAt(report3).sales, 3), formula: "基準年→事業化報告3年目の全社売上高CAGR" },
  ];
  const display = (value: number | undefined, unit: "千円" | "%") => value === undefined || !Number.isFinite(value) ? "算出不可" : `${number(value, unit === "%" ? 2 : 0)} ${unit}`;
  return <article className="panel table-panel behavior-change-panel"><div className="panel-heading"><div><p className="card-kicker">ROUND 6 / SECTION 4</p><h2>行動変容に係る数値（自動計算）</h2></div><span className="pill green">4-1～4-7</span></div><div className="wide-table"><table><thead><tr><th>第6次様式項目</th><th>全社</th><th>補助事業</th><th>HTMLでの計算根拠</th></tr></thead><tbody>{rows.map((row) => <tr key={row.code}><th>{row.code} {row.label}<small>{row.unit}</small></th><td><strong>{display(row.company, row.unit)}</strong></td><td><strong>{row.project === undefined ? "—" : display(row.project, row.unit)}</strong></td><td className="formula-cell">{row.formula}</td></tr>)}</tbody></table></div><p className="footnote">第6次入力ガイドの②補助事業情報 4-1～4-7を再現しています。賃上げ率は基準年の従業員数が0人の場合のみ、役員1人当たり給与支給総額で代替します。投資額はHTML内部の億円から公式様式の千円へ換算しています。</p></article>;
}

type OfficialRow = {
  code: string;
  label: string;
  unit?: "%" | "人" | "億円/人";
  emphasis?: boolean;
  groupStart?: boolean;
  value: (rows: YearPlan[], index: number) => number | undefined;
};

const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : 0;
const growth = (current: number, previous: number | undefined) => previous ? (current / previous - 1) * 100 : undefined;
const companySegment = (rows: YearPlan[], index: number) => total(rows[index].project, rows[index].other);
const sgaTotal = companySgaTotal;

type DiagnosticValue = { label: string; value: number | undefined };
type DiagnosticRow = {
  name: string;
  formula: string;
  check: string;
  unit: "%" | "pt" | "倍" | "億円/人";
  values: (row: YearPlan, index: number) => DiagnosticValue[];
};

function FinancialDiagnostics({ plan, balanceSheets, futureCapex }: { plan: YearPlan[]; balanceSheets: BalanceSheetPlan[]; futureCapex: { year: number; value: number }[] }) {
  const company = (row: YearPlan) => total(row.project, row.other);
  const segments = (row: YearPlan) => [
    { label: "全社", value: company(row) },
    { label: "補助", value: row.project },
    { label: "他", value: row.other },
  ];
  const segmentValues = (row: YearPlan, calculator: (segment: SegmentPlan) => number | undefined) =>
    segments(row).map((entry) => ({ label: entry.label, value: calculator(entry.value) }));
  const pairedValues = (row: YearPlan, calculator: (segment: SegmentPlan) => number | undefined) => [
    { label: "補助", value: calculator(row.project) },
    { label: "他", value: calculator(row.other) },
  ];
  const previousSegment = (index: number, key: "company" | "project" | "other") => {
    if (!index) return undefined;
    return key === "company" ? company(plan[index - 1]) : plan[index - 1][key];
  };
  const capexByYear = new Map<number, number>([
    ...balanceSheets.map((row) => [row.year, row.capex] as [number, number]),
    ...futureCapex.map((row) => [row.year, row.value] as [number, number]),
  ]);
  const safeRate = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : undefined;
  const safeMultiple = (numerator: number, denominator: number) => denominator ? numerator / denominator : undefined;
  const opMargin = (segment: SegmentPlan) => safeRate(operatingProfit(segment), segment.sales);
  const ebitda = (segment: SegmentPlan) => operatingProfit(segment) + segment.depreciation;
  const perEmployee = (amount: number, segment: SegmentPlan) => segment.headcount ? amount / segment.headcount : undefined;
  const payrollPerEmployee = (segment: SegmentPlan) => perEmployee(segment.employeePay, segment);

  const groups: { title: string; rows: DiagnosticRow[] }[] = [
    {
      title: "1. 収益性",
      rows: [
        { name: "売上高成長率", formula: "当年売上高 ÷ 前年売上高－1", check: "売上が能力・人員を超えて急増していないか", unit: "%", values: (row, index) => segments(row).map((entry) => ({ label: entry.label, value: safeRate(entry.value.sales - (previousSegment(index, entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other")?.sales ?? entry.value.sales), previousSegment(index, entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other")?.sales ?? 0) })) },
        { name: "売上原価率", formula: "売上原価 ÷ 売上高", check: "原価率が過去実績から急改善していないか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.cogs, s.sales)) },
        { name: "売上総利益率", formula: "（売上高－売上原価）÷ 売上高", check: "価格・製品構成・原価改善の根拠と整合するか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.sales - s.cogs, s.sales)) },
        { name: "販管費率", formula: "販管費合計 ÷ 売上高", check: "売上成長に対して販管費を抑えすぎていないか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(sgaTotal(s), s.sales)) },
        { name: "営業利益率", formula: "営業利益 ÷ 売上高", check: "原価率・販管費率との合計が100%になるか", unit: "%", values: (row) => segmentValues(row, opMargin) },
        { name: "EBITDAマージン", formula: "（営業利益＋減価償却費）÷ 売上高", check: "設備投資後の現金創出力が不自然でないか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(ebitda(s), s.sales)) },
        { name: "その他販管費率", formula: "その他販管費 ÷ 売上高", check: "経費削減だけで利益を作っていないか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.otherSga, s.sales)) },
      ],
    },
    {
      title: "2. 人件費・賃上げ",
      rows: [
        { name: "従業員人件費率", formula: "従業員給与支給総額 ÷ 売上高", check: "人員計画と売上規模に対して妥当か", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.employeePay, s.sales)) },
        { name: "役員人件費率", formula: "役員給与支給総額 ÷ 売上高", check: "役員報酬の変動が利益を歪めていないか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.officerPay, s.sales)) },
        { name: "総人件費率", formula: "（従業員＋役員給与）÷ 売上高", check: "賃上げと利益率が両立しているか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.employeePay + s.officerPay, s.sales)) },
        { name: "従業員1人当たり給与支給総額", formula: "従業員給与支給総額 ÷ 常時使用する従業員数（就業時間換算）", check: "給与支給総額の増加が人数増だけになっていないか", unit: "億円/人", values: (row) => segmentValues(row, payrollPerEmployee) },
        { name: "役員1人当たり給与支給総額（参考）", formula: "役員給与支給総額 ÷ 役員数", check: "役員数の変化を除いた報酬水準が妥当か", unit: "億円/人", values: (row) => segmentValues(row, (s) => s.officerCount ? s.officerPay / s.officerCount : undefined) },
        { name: "従業員1人当たり給与支給総額の対前年上昇率", formula: "当年の従業員1人当たり給与支給総額 ÷ 前年値－1", check: "第6次の賃上げ計画と年度推移が整合するか", unit: "%", values: (row, index) => segments(row).map((entry) => { const key = entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other"; const previous = previousSegment(index, key); const currentPay = payrollPerEmployee(entry.value); const previousPay = previous ? payrollPerEmployee(previous) : undefined; return { label: entry.label, value: currentPay !== undefined && previousPay ? (currentPay / previousPay - 1) * 100 : undefined }; }) },
        { name: "労働分配率", formula: "（従業員＋役員給与）÷ 付加価値額", check: "付加価値の増加が従業員へ還元されているか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.employeePay + s.officerPay, valueAdded(s))) },
      ],
    },
    {
      title: "3. 生産性",
      rows: [
        { name: "従業員1人当たり売上高", formula: "売上高 ÷ 常時使用する従業員数（就業時間換算）", check: "人員を増やさず売上だけが急増していないか", unit: "億円/人", values: (row) => segmentValues(row, (s) => perEmployee(s.sales, s)) },
        { name: "1人当たり営業利益", formula: "営業利益 ÷ 常時使用する従業員数（就業時間換算）", check: "生産性改善が過度になっていないか", unit: "億円/人", values: (row) => segmentValues(row, (s) => perEmployee(operatingProfit(s), s)) },
        { name: "労働生産性", formula: "付加価値額 ÷（常時使用する従業員数（就業時間換算）＋役員数）", check: "付加価値・人数・賃上げの関係が整合するか", unit: "億円/人", values: (row) => segmentValues(row, (s) => safeMultiple(valueAdded(s), s.headcount + s.officerCount)) },
        { name: "従業員数増加率", formula: "当年の常時使用する従業員数（就業時間換算）÷ 前年値－1", check: "採用可能性と事業拡大ペースが整合するか", unit: "%", values: (row, index) => segments(row).map((entry) => { const key = entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other"; const previous = previousSegment(index, key); return { label: entry.label, value: previous?.headcount ? (entry.value.headcount / previous.headcount - 1) * 100 : undefined }; }) },
        { name: "売上成長率－従業員増加率", formula: "売上成長率－常時使用する従業員数（就業時間換算）の増加率", check: "人員増を大きく上回る売上成長に根拠があるか", unit: "pt", values: (row, index) => segments(row).map((entry) => { const key = entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other"; const previous = previousSegment(index, key); const salesGrowth = previous?.sales ? (entry.value.sales / previous.sales - 1) * 100 : undefined; const headGrowth = previous?.headcount ? (entry.value.headcount / previous.headcount - 1) * 100 : undefined; return { label: entry.label, value: salesGrowth !== undefined && headGrowth !== undefined ? salesGrowth - headGrowth : undefined }; }) },
      ],
    },
    {
      title: "4. 設備投資",
      rows: [
        { name: "減価償却費率", formula: "減価償却費 ÷ 売上高", check: "投資後の減価償却費が小さすぎないか", unit: "%", values: (row) => segmentValues(row, (s) => safeRate(s.depreciation, s.sales)) },
        { name: "設備投資負担率", formula: "当年設備投資額 ÷ 全社売上高", check: "売上規模に対して投資額が過大でないか", unit: "%", values: (row) => [{ label: "全社", value: safeRate(capexByYear.get(row.year) ?? 0, company(row).sales) }] },
        { name: "設備投資対EBITDA倍率", formula: "当年設備投資額 ÷ 全社EBITDA", check: "本業の資金創出力で投資を支えられるか", unit: "倍", values: (row) => [{ label: "全社", value: safeMultiple(capexByYear.get(row.year) ?? 0, ebitda(company(row))) }] },
        { name: "減価償却カバー率", formula: "EBITDA ÷ 減価償却費", check: "償却負担に対する利益余力が十分か", unit: "倍", values: (row) => segmentValues(row, (s) => safeMultiple(ebitda(s), s.depreciation)) },
        { name: "投資後売上増加倍率", formula: "全社売上高の前年差 ÷ 当年設備投資額", check: "投資効果を過大に見積もっていないか", unit: "倍", values: (row, index) => [{ label: "全社", value: index ? safeMultiple(company(row).sales - company(plan[index - 1]).sales, capexByYear.get(row.year) ?? 0) : undefined }] },
      ],
    },
    {
      title: "5. 補助事業とその他事業の比較",
      rows: [
        { name: "補助事業売上構成比", formula: "補助事業売上高 ÷ 全社売上高", check: "全社が補助事業へ過度に依存していないか", unit: "%", values: (row) => [{ label: "構成比", value: safeRate(row.project.sales, company(row).sales) }] },
        { name: "事業別売上成長率", formula: "当年売上高 ÷ 前年売上高－1", check: "片方の事業だけが不自然に急成長・縮小していないか", unit: "%", values: (row, index) => [{ label: "補助", value: previousSegment(index, "project")?.sales ? (row.project.sales / previousSegment(index, "project")!.sales - 1) * 100 : undefined }, { label: "他", value: previousSegment(index, "other")?.sales ? (row.other.sales / previousSegment(index, "other")!.sales - 1) * 100 : undefined }] },
        { name: "売上原価率差", formula: "補助事業原価率－その他事業原価率", check: "補助事業の採算を過度に良く置いていないか", unit: "pt", values: (row) => [{ label: "差", value: (safeRate(row.project.cogs, row.project.sales) ?? 0) - (safeRate(row.other.cogs, row.other.sales) ?? 0) }] },
        { name: "営業利益率差", formula: "補助事業営業利益率－その他事業営業利益率", check: "事業間の利益率差に合理的な根拠があるか", unit: "pt", values: (row) => [{ label: "差", value: (opMargin(row.project) ?? 0) - (opMargin(row.other) ?? 0) }] },
        { name: "事業別1人当たり売上高", formula: "事業別売上高 ÷ 事業別の常時使用する従業員数（就業時間換算）", check: "補助事業の生産性だけが突出していないか", unit: "億円/人", values: (row) => pairedValues(row, (s) => perEmployee(s.sales, s)) },
        { name: "事業別従業員1人当たり給与支給総額", formula: "事業別従業員給与支給総額 ÷ 事業別の常時使用する従業員数（就業時間換算）", check: "補助事業と既存事業の待遇差が妥当か", unit: "億円/人", values: (row) => pairedValues(row, payrollPerEmployee) },
        { name: "全社利益増加への補助事業寄与率", formula: "補助事業営業利益の前年差 ÷ 全社営業利益の前年差", check: "全社利益改善を補助事業だけへ寄せていないか", unit: "%", values: (row, index) => { if (!index) return [{ label: "寄与率", value: undefined }]; const projectIncrease = operatingProfit(row.project) - operatingProfit(plan[index - 1].project); const companyIncrease = operatingProfit(company(row)) - operatingProfit(company(plan[index - 1])); return [{ label: "寄与率", value: safeRate(projectIncrease, companyIncrease) }]; } },
      ],
    },
  ];

  const formatted = (value: number | undefined, unit: DiagnosticRow["unit"]) => {
    if (value === undefined || !Number.isFinite(value)) return "—";
    const digits = unit === "億円/人" ? 3 : unit === "倍" ? 2 : 1;
    return `${number(value, digits)}${unit === "億円/人" ? "" : unit}`;
  };

  return <section className="financial-diagnostics" aria-label="PL妥当性診断">
    <div className="diagnostic-heading"><div><p className="card-kicker">PL VALIDATION</p><h2>基本指標によるシミュレーション妥当性チェック</h2></div><p>各年度セルは、全社・補助事業・その他事業の順に表示します。</p></div>
    {groups.map((group) => <article className="panel table-panel diagnostic-panel" key={group.title}><h3>{group.title}</h3><div className="wide-table diagnostic-table"><table><thead><tr><th>指標名</th><th>計算式</th><th>主な確認点</th>{plan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{group.rows.map((item) => <tr key={item.name}><th>{item.name}<small>{item.unit}</small></th><td className="diagnostic-copy">{item.formula}</td><td className="diagnostic-copy">{item.check}</td>{plan.map((row, index) => <td key={row.year}><div className="diagnostic-values">{item.values(row, index).map((entry) => <span key={entry.label}><small>{entry.label}</small><strong>{formatted(entry.value, item.unit)}</strong></span>)}</div></td>)}</tr>)}</tbody></table></div></article>)}
  </section>;
}

function OfficialRowsTable({ title, kicker, pill, plan, sourcePlan, rows, note }: { title: string; kicker: string; pill: string; plan: YearPlan[]; sourcePlan?: YearPlan[]; rows: OfficialRow[]; note?: string }) {
  const formatted = (value: number | undefined, unit?: OfficialRow["unit"]) => value === undefined ? "—" : `${number(value, unit === "%" ? 1 : 2)}${unit ? ` ${unit}` : ""}`;
  return <article className="panel table-panel company-table"><div className="panel-heading"><div><p className="card-kicker">{kicker}</p><h2>{title}</h2></div><span className="pill green">{pill}</span></div><div className="wide-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{plan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{rows.map((item) => <tr className={`${item.emphasis ? "emphasis" : ""}${item.groupStart ? " official-related-start" : ""}`} key={item.code}><th>{item.code} {item.label}{item.groupStart && <small>P/L関連計算項目</small>}</th>{plan.map((year, index) => { const value = item.value(plan, index); const before = sourcePlan ? item.value(sourcePlan, index) : undefined; return <td key={year.year}>{sourcePlan && <small className="before-cell">{formatted(before, item.unit)} →</small>}<strong className={sourcePlan ? "after-cell" : ""}>{formatted(value, item.unit)}</strong></td>; })}</tr>)}</tbody></table></div>{note && <p className="footnote">{note}</p>}</article>;
}

function CompanyTable({ plan, sourcePlan }: { plan: YearPlan[]; sourcePlan?: YearPlan[] }) {
  const emphasisCodes = new Set(["2-1", "2-5", "2-16", "2-18", "2-24", "2-34"]);
  const rows: OfficialRow[] = companyActualInputRows.map((item) => ({
    code: item.code,
    label: item.label,
    unit: item.unit as OfficialRow["unit"],
    emphasis: emphasisCodes.has(item.code),
    groupStart: item.groupStart,
    value: item.get,
  }));
  return <OfficialRowsTable title="会社全体にかかる損益計算書・関連計算項目" kicker="ROUND 6 / SECTION 2" pill="2-1～2-36" plan={plan} sourcePlan={sourcePlan} rows={rows} note="2-1～2-20が損益計算書、2-21～2-36が給与・付加価値・人数・EBITDAの関連計算項目です。2-8は2-9＋2-10、2-11は2-12＋2-13、2-23は2-4＋2-14で自動計算します。2-18は営業利益と同額、2-19・2-20はモデル未対応です。" />;
}

function OfficialProjectTable({ plan, sourcePlan, drivers }: { plan: YearPlan[]; sourcePlan?: YearPlan[]; drivers: Drivers }) {
  const rows: OfficialRow[] = [
    { code: "7-1", label: "売上高", emphasis: true, value: (p, i) => p[i].project.sales },
    { code: "7-2", label: "　売上高成長率", unit: "%", value: (p, i) => growth(p[i].project.sales, i ? p[i - 1].project.sales : undefined) },
    { code: "7-3", label: "　全社売上高に占める補助事業売上高の割合", unit: "%", value: (p, i) => rate(p[i].project.sales, companySegment(p, i).sales) },
    { code: "7-4", label: "売上総利益", emphasis: true, value: (p, i) => p[i].project.sales - p[i].project.cogs },
    { code: "7-5", label: "　売上総利益率", unit: "%", value: (p, i) => rate(p[i].project.sales - p[i].project.cogs, p[i].project.sales) },
    { code: "7-6", label: "営業利益", emphasis: true, value: (p, i) => operatingProfit(p[i].project) },
    { code: "7-7", label: "　営業利益率", unit: "%", value: (p, i) => rate(operatingProfit(p[i].project), p[i].project.sales) },
    { code: "7-8", label: "給与支給総額（常時使用する従業員）", value: (p, i) => p[i].project.employeePay },
    { code: "7-9", label: "給与支給総額（役員）", value: (p, i) => p[i].project.officerPay },
    { code: "7-10", label: "減価償却費（合計）", value: (p, i) => p[i].project.depreciation },
    { code: "7-11", label: "付加価値", emphasis: true, value: (p, i) => valueAdded(p[i].project) },
    { code: "7-12", label: "　付加価値増加率", unit: "%", value: (p, i) => growth(valueAdded(p[i].project), i ? valueAdded(p[i - 1].project) : undefined) },
    { code: "7-13", label: "常時使用する従業員数（就業時間換算）", unit: "人", value: (p, i) => p[i].project.headcount },
    { code: "7-14", label: "役員数", unit: "人", value: (p, i) => p[i].project.officerCount },
    { code: "7-15", label: "従業員1人当たり給与支給総額", unit: "億円/人", value: (p, i) => p[i].project.headcount ? p[i].project.employeePay / p[i].project.headcount : 0 },
    { code: "7-16", label: "　従業員1人当たり給与支給総額の上昇率", unit: "%", value: (p, i) => growth(p[i].project.headcount ? p[i].project.employeePay / p[i].project.headcount : 0, i && p[i - 1].project.headcount ? p[i - 1].project.employeePay / p[i - 1].project.headcount : undefined) },
    { code: "7-17", label: "役員1人当たり給与支給総額", unit: "億円/人", value: (p, i) => p[i].project.officerCount ? p[i].project.officerPay / p[i].project.officerCount : 0 },
    { code: "7-18", label: "　役員1人当たり給与支給総額の上昇率", unit: "%", value: (p, i) => growth(p[i].project.officerCount ? p[i].project.officerPay / p[i].project.officerCount : 0, i && p[i - 1].project.officerCount ? p[i - 1].project.officerPay / p[i - 1].project.officerCount : undefined) },
    { code: "7-19", label: "労働生産性", unit: "億円/人", value: (p, i) => { const s = p[i].project; return s.headcount + s.officerCount ? valueAdded(s) / (s.headcount + s.officerCount) : 0; } },
    { code: "7-20", label: "市場伸び率（年あたり）", unit: "%", value: (_p, i) => i === 0 ? drivers.projectMarketGrowth * 100 : undefined },
  ];
  return <OfficialRowsTable title="補助事業にかかる収支計画" kicker="ROUND 6 / SECTION 7" pill="7-1～7-20" plan={plan} sourcePlan={sourcePlan} rows={rows} note="7-20市場伸び率は、第6次Excelと同じく単一の入力値として最初の列に表示しています。" />;
}
