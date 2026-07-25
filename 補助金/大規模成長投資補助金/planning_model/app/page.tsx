"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  netIncome,
  nonOperatingProfitLoss,
  operatingProfit,
  ordinaryIncome,
  officerBonus,
  officerCompensation,
  normalizeTimeline,
  retimeHistoricalPlan,
  retimeBalanceSheets,
  researchDevelopment,
  preTaxIncome,
  extraordinaryProfitLoss,
  SegmentKey,
  SegmentPlan,
  sgaDepreciation,
  suggestCogsRateRange,
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
import {
  buildMappedExcel,
  EXCEL_MAPPING_COPILOT_PROMPT,
  EXCEL_MAPPING_EXAMPLE,
  EXCEL_MAPPING_MANUAL,
  parseExcelMappingDefinition,
  previewExcelImport,
  type ExcelMappingDefinition,
  type ExcelMappingPreview,
  type ExcelMappingTarget,
} from "./excel-mapping";
import { createBaseYearLaunchHistoricalOnlySampleProposal, createHistoricalOnlySampleProposal, createMultipleUnmetSampleProposal, createPartiallyUnmetSampleProposal, createStandardSampleProposal } from "./sample-proposals";
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
import { niceChartScale } from "./chart-scale";

type View = "summary" | "history" | "future" | "pl" | "targets" | "logic" | "io";
const emptyDrivers = defaultDrivers;

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
  "projectSalesGrowth", "otherSalesGrowth", "projectCogsRateWhenSalesZero", "otherCogsRateWhenSalesZero", "projectCogsImprovementAfterBase", "otherCogsImprovement",
  "projectPayGrowth", "otherPayGrowth", "projectHeadcountGrowth", "otherHeadcountGrowth",
  "projectSgaRateEnd", "otherSgaRateEnd", "projectOfficerPayGrowth",
];

const driverLabels: Partial<Record<keyof Drivers, { label: string; unit: string; step: number }>> = {
  projectCogsRateWhenSalesZero: { label: "補助事業 原価率", unit: "%", step: 0.5 },
  otherCogsRateWhenSalesZero: { label: "ベース事業 原価率", unit: "%", step: 0.5 },
  projectEmployeeSalaryShare: { label: "補助事業 従業員給与支給総額のうち給与として計上する割合", unit: "%", step: 0.5 },
  otherEmployeeSalaryShare: { label: "ベース事業 従業員給与支給総額のうち給与として計上する割合", unit: "%", step: 0.5 },
  projectOfficerCompensationShare: { label: "補助事業 役員給与支給総額のうち役員報酬として計上する割合", unit: "%", step: 0.5 },
  otherOfficerCompensationShare: { label: "ベース事業 役員給与支給総額のうち役員報酬として計上する割合", unit: "%", step: 0.5 },
  projectResearchDevelopmentRate: { label: "補助事業 研究開発費の売上高比率", unit: "%", step: 0.1 },
  otherResearchDevelopmentRate: { label: "ベース事業 研究開発費の売上高比率", unit: "%", step: 0.1 },
  projectNonOperatingRate: { label: "補助事業 営業外損益の売上高比率", unit: "%", step: 0.1 },
  otherNonOperatingRate: { label: "ベース事業 営業外損益の売上高比率", unit: "%", step: 0.1 },
  projectExtraordinaryRate: { label: "補助事業 特別損益の売上高比率", unit: "%", step: 0.1 },
  otherExtraordinaryRate: { label: "ベース事業 特別損益の売上高比率", unit: "%", step: 0.1 },
  effectiveTaxRate: { label: "実効税率", unit: "%", step: 0.5 },
  otherOfficerPayGrowthToBase: { label: "ベース事業 役員1人当たり給与支給総額の年平均上昇率（最新決算期→基準年・モデル内管理）", unit: "%/年", step: 0.25 },
  otherOfficerPayGrowth: { label: "ベース事業 役員1人当たり給与支給総額の年平均上昇率（基準年→事業化報告3年目・モデル内管理）", unit: "%/年", step: 0.25 },
  projectMarketGrowth: { label: "7-20 市場伸び率（年あたり）", unit: "%/年", step: 0.5 },
  projectSalesGrowthToBase: { label: "補助事業 売上成長率（設備導入期間）", unit: "%/年", step: 0.5 },
  projectCogsImprovementToBase: { label: "補助事業 原価率改善ポイント（設備導入期間）", unit: "pt", step: 0.5 },
  projectPayGrowthToBase: { label: "補助事業に関わる従業員1人当たり給与支給総額の年平均上昇率（設備導入期間・モデル内管理）", unit: "%/年", step: 0.25 },
  projectHeadcountGrowthToBase: { label: "補助事業 常時使用する従業員数（就業時間換算）の成長率（設備導入期間）", unit: "%/年", step: 0.5 },
  projectSgaImprovementToBase: { label: "補助事業 その他販管費率改善ポイント（設備導入期間）", unit: "pt", step: 0.5 },
  projectOfficerPayGrowthToBase: { label: "役員1人当たり給与支給総額の年平均上昇率（設備導入期間・モデル内管理）", unit: "%/年", step: 0.25 },
  otherSalesGrowthToBase: { label: "ベース事業 売上成長率（最新決算期→基準年）", unit: "%/年", step: 0.5 },
  otherCogsImprovementToBase: { label: "ベース事業 原価率改善ポイント（最新決算期→基準年）", unit: "pt", step: 0.5 },
  otherPayGrowthToBase: { label: "ベース事業の従業員1人当たり給与支給総額の年平均上昇率（最新決算期→基準年・モデル内管理）", unit: "%/年", step: 0.25 },
  otherHeadcountGrowthToBase: { label: "ベース事業 常時使用する従業員数（就業時間換算）の成長率（最新決算期→基準年）", unit: "%/年", step: 0.5 },
  otherSgaImprovementToBase: { label: "ベース事業 その他販管費率改善ポイント（最新決算期→基準年）", unit: "pt", step: 0.5 },
  projectSalesGrowth: { label: "補助事業 売上成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  otherSalesGrowth: { label: "ベース事業 売上成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  projectCogsImprovementAfterBase: { label: "補助事業 原価率改善ポイント（基準年→事業化報告3年目）", unit: "pt", step: 0.5 },
  otherCogsImprovement: { label: "ベース事業 原価率改善ポイント（基準年→事業化報告3年目）", unit: "pt", step: 0.5 },
  projectPayGrowth: { label: "補助事業1人当たり給与支給総額の年平均上昇率（基準年→事業化報告3年目）", unit: "%/年", step: 0.25 },
  otherPayGrowth: { label: "ベース事業の従業員1人当たり給与支給総額の年平均上昇率（基準年→事業化報告3年目・モデル内管理）", unit: "%/年", step: 0.25 },
  projectHeadcountGrowth: { label: "補助事業 常時使用する従業員数（就業時間換算）の成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  otherHeadcountGrowth: { label: "ベース事業 常時使用する従業員数（就業時間換算）の成長率（基準年→事業化報告3年目）", unit: "%/年", step: 0.5 },
  projectSgaRateEnd: { label: "補助事業 その他販管費率改善ポイント（基準年後）", unit: "pt", step: 0.5 },
  otherSgaRateEnd: { label: "ベース事業 その他販管費率改善ポイント（基準年後）", unit: "pt", step: 0.5 },
  projectOfficerPayGrowth: { label: "役員1人当たり給与支給総額の年平均上昇率（基準年→事業化報告3年目・モデル内管理）", unit: "%/年", step: 0.25 },
  investment: { label: "補助事業投資額", unit: "億円", step: 1 },
  subsidy: { label: "申請補助金額", unit: "億円", step: 0.01 },
  localBenchmark: { label: "ローカルベンチマーク", unit: "点", step: 1 },
};

const driverTablePresentation = (key: keyof Drivers, label: string) => {
  const accountingNotes: Partial<Record<keyof Drivers, string>> = {
    projectEmployeeSalaryShare: "残額を従業員賞与として計算",
    otherEmployeeSalaryShare: "残額を従業員賞与として計算",
    projectOfficerCompensationShare: "残額を役員賞与として計算",
    otherOfficerCompensationShare: "残額を役員賞与として計算",
    projectResearchDevelopmentRate: "研究開発費＝売上高×設定率",
    otherResearchDevelopmentRate: "研究開発費＝売上高×設定率",
    projectNonOperatingRate: "経常利益＝営業利益＋売上高×設定率",
    otherNonOperatingRate: "経常利益＝営業利益＋売上高×設定率",
    projectExtraordinaryRate: "税引前当期純利益＝経常利益＋売上高×設定率",
    otherExtraordinaryRate: "税引前当期純利益＝経常利益＋売上高×設定率",
    effectiveTaxRate: "当期純利益＝税引前当期純利益×（100%－設定率）。入力値を全年度へ固定適用し、最適化しません",
  };
  const modelManaged = label.includes("モデル内管理");
  const shortLabel = label
    .replace(/（設備導入期間(?:・モデル内管理)?）/g, "")
    .replace(/（最新決算期→基準年(?:・モデル内管理)?）/g, "")
    .replace(/（基準年→事業化報告3年目(?:・モデル内管理)?）/g, "")
    .replace(/（事業化報告3年目到達値）/g, "")
    .trim();
  return {
    label: `${shortLabel}${modelManaged ? "（モデル内管理）" : ""}`,
    note: accountingNotes[key],
  };
};

const standaloneMetricLabel = (definition: (typeof metrics)[number]) => {
  const formula = definition.round6Formula;
  if (formula.includes("最新決算期→基準年度")) return `${definition.label}（最新決算期→基準年度）`;
  if (formula.includes("基準年→事業化報告3年目") || formula.includes("事業化報告3年目 − 基準年")) {
    return `${definition.label}（基準年→事業化報告3年目）`;
  }
  if (formula.includes("事業化報告3年目")) return `${definition.label}（事業化報告3年目時点）`;
  return definition.label;
};

const driverGroups: { label: string; detail: string; keys: (keyof Drivers)[] }[] = [
  {
    label: "補助事業｜設備導入期間",
    detail: "最新決算期 → 基準年",
    keys: ["projectSalesGrowthToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase", "investment", "subsidy"],
  },
  {
    label: "補助事業｜基準年後",
    detail: "基準年度 → 事業化報告3年目",
    keys: ["projectSalesGrowth", "projectCogsRateWhenSalesZero", "projectCogsImprovementAfterBase", "projectPayGrowth", "projectHeadcountGrowth", "projectOfficerPayGrowth", "projectSgaRateEnd"],
  },
  {
    label: "ベース事業｜設備導入期間",
    detail: "最新決算期 → 基準年",
    keys: ["otherSalesGrowthToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherOfficerPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase"],
  },
  {
    label: "ベース事業｜基準年後",
    detail: "基準年度 → 事業化報告3年目",
    keys: ["otherSalesGrowth", "otherCogsRateWhenSalesZero", "otherCogsImprovement", "otherPayGrowth", "otherOfficerPayGrowth", "otherHeadcountGrowth", "otherSgaRateEnd"],
  },
  {
    label: "補助事業｜会計内訳・利益前提",
    detail: "将来各年度に固定適用",
    keys: ["projectEmployeeSalaryShare", "projectOfficerCompensationShare", "projectResearchDevelopmentRate", "projectNonOperatingRate", "projectExtraordinaryRate"],
  },
  {
    label: "ベース事業｜会計内訳・利益前提",
    detail: "将来各年度に固定適用",
    keys: ["otherEmployeeSalaryShare", "otherOfficerCompensationShare", "otherResearchDevelopmentRate", "otherNonOperatingRate", "otherExtraordinaryRate"],
  },
  {
    label: "共通・外部前提",
    detail: "共通会計・市場前提",
    keys: ["effectiveTaxRate", "projectMarketGrowth"],
  },
];

type DriverComparisonRow = {
  equipment?: keyof Drivers;
  postBase?: keyof Drivers;
  fixed?: keyof Drivers;
};

const driverComparisonGroups: { label: string; rows: DriverComparisonRow[] }[] = [
  {
    label: "補助事業",
    rows: [
      { equipment: "projectSalesGrowthToBase", postBase: "projectSalesGrowth" },
      { equipment: "projectCogsImprovementToBase", postBase: "projectCogsImprovementAfterBase" },
      { postBase: "projectCogsRateWhenSalesZero" },
      { equipment: "projectPayGrowthToBase", postBase: "projectPayGrowth" },
      { equipment: "projectHeadcountGrowthToBase", postBase: "projectHeadcountGrowth" },
      { equipment: "projectSgaImprovementToBase", postBase: "projectSgaRateEnd" },
      { equipment: "projectOfficerPayGrowthToBase", postBase: "projectOfficerPayGrowth" },
      { equipment: "investment" },
      { equipment: "subsidy" },
    ],
  },
  {
    label: "ベース事業",
    rows: [
      { equipment: "otherSalesGrowthToBase", postBase: "otherSalesGrowth" },
      { equipment: "otherCogsImprovementToBase", postBase: "otherCogsImprovement" },
      { postBase: "otherCogsRateWhenSalesZero" },
      { equipment: "otherPayGrowthToBase", postBase: "otherPayGrowth" },
      { equipment: "otherHeadcountGrowthToBase", postBase: "otherHeadcountGrowth" },
      { equipment: "otherSgaImprovementToBase", postBase: "otherSgaRateEnd" },
      { equipment: "otherOfficerPayGrowthToBase", postBase: "otherOfficerPayGrowth" },
    ],
  },
  {
    label: "会計内訳・利益前提",
    rows: [
      { fixed: "projectEmployeeSalaryShare" },
      { fixed: "projectOfficerCompensationShare" },
      { fixed: "projectResearchDevelopmentRate" },
      { fixed: "projectNonOperatingRate" },
      { fixed: "projectExtraordinaryRate" },
      { fixed: "otherEmployeeSalaryShare" },
      { fixed: "otherOfficerCompensationShare" },
      { fixed: "otherResearchDevelopmentRate" },
      { fixed: "otherNonOperatingRate" },
      { fixed: "otherExtraordinaryRate" },
      { fixed: "effectiveTaxRate" },
    ],
  },
  {
    label: "外部前提",
    rows: [{ fixed: "projectMarketGrowth" }],
  },
];

const forecastDriverKeys = driverGroups.flatMap((group) => group.keys);
const accountingAssumptionDriverKeys: (keyof Drivers)[] = [
  "projectEmployeeSalaryShare", "otherEmployeeSalaryShare",
  "projectOfficerCompensationShare", "otherOfficerCompensationShare",
  "projectResearchDevelopmentRate", "otherResearchDevelopmentRate",
  "projectNonOperatingRate", "otherNonOperatingRate",
  "projectExtraordinaryRate", "otherExtraordinaryRate",
  "effectiveTaxRate",
];
// 実効税率を含む会計前提は、目標達成のために動かさず入力値を固定する。
const fixedForecastDriverKeys = new Set<keyof Drivers>([
  "investment", "subsidy", "projectEmployeeSalaryShare", "otherEmployeeSalaryShare",
  "projectOfficerCompensationShare", "otherOfficerCompensationShare",
  "projectResearchDevelopmentRate", "otherResearchDevelopmentRate",
  "projectNonOperatingRate", "otherNonOperatingRate",
  "projectExtraordinaryRate", "otherExtraordinaryRate",
  "effectiveTaxRate", "otherOfficerPayGrowthToBase",
  "otherOfficerPayGrowth", "projectMarketGrowth",
]);

const conditionCode = (index: number) => `C-${index + 1}`;
const driverItemCodes = Object.fromEntries(
  forecastDriverKeys.map((key, index) => [key, conditionCode(index)]),
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
  "projectSgaRateEnd", "otherSgaRateEnd",
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
  projectSgaRateEnd: { initial: 0.015, lower: 0, upper: 0.03 },
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
  otherOfficerPayGrowthToBase: { initial: 0.03, lower: 0, upper: 0.06 },
  otherHeadcountGrowthToBase: { initial: 0.01, lower: -0.03, upper: 0.05 },
  otherSgaImprovementToBase: { initial: 0, lower: 0, upper: 0.02 },
  otherSalesGrowth: { initial: 0.05, lower: -0.01, upper: 0.10 },
  otherCogsImprovement: { initial: 0, lower: 0, upper: 0.03 },
  otherPayGrowth: { initial: 0.03, lower: 0, upper: 0.06 },
  otherOfficerPayGrowth: { initial: 0.03, lower: 0, upper: 0.06 },
  otherHeadcountGrowth: { initial: 0.01, lower: -0.03, upper: 0.05 },
  projectSgaRateEnd: { initial: 0.015, lower: 0, upper: 0.03 },
  otherSgaRateEnd: { initial: 0.005, lower: 0, upper: 0.03 },
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

type OtherPlInputField = {
  key: string;
  modelCode: string;
  label: string;
  unit: string;
  digits?: number;
  indentLevel?: 1 | 2;
  get: (segment: SegmentPlan) => number;
  set: (segment: SegmentPlan, value: number) => Partial<SegmentPlan>;
};

const otherSgaTotal = (segment: SegmentPlan) =>
  segment.employeePay + segment.officerPay + sgaDepreciation(segment) + researchDevelopment(segment) + segment.otherSga;

const preserveOtherSgaTotal = (segment: SegmentPlan, patch: Partial<SegmentPlan>, componentDelta: number): Partial<SegmentPlan> => ({
  ...patch,
  otherSga: segment.otherSga - componentDelta,
});

const otherPlInputFields: OtherPlInputField[] = [
  { key: "sales", modelCode: "M2-1", label: "売上高", unit: "億円", get: (s) => s.sales, set: (_s, v) => ({ sales: v }) },
  { key: "cogs", modelCode: "M2-3", label: "売上原価", unit: "億円", get: (s) => s.cogs, set: (_s, v) => ({ cogs: v }) },
  { key: "cogsDepreciation", modelCode: "M2-4", label: "うち減価償却費", unit: "億円", indentLevel: 1, get: cogsDepreciation, set: (s, v) => ({ cogsDepreciation: v, depreciation: v + sgaDepreciation(s) }) },
  { key: "sgaTotal", modelCode: "M2-7", label: "販売費及び一般管理費", unit: "億円", get: otherSgaTotal, set: (s, v) => ({ otherSga: v - s.employeePay - s.officerPay - sgaDepreciation(s) - researchDevelopment(s) }) },
  { key: "officerCompensation", modelCode: "M2-9", label: "うち役員報酬", unit: "億円", indentLevel: 2, get: officerCompensation, set: (s, v) => { const nextPay = v + officerBonus(s); return preserveOtherSgaTotal(s, { officerCompensation: v, officerPay: nextPay }, nextPay - s.officerPay); } },
  { key: "officerBonus", modelCode: "M2-10", label: "うち役員賞与", unit: "億円", indentLevel: 2, get: officerBonus, set: (s, v) => { const nextPay = officerCompensation(s) + v; return preserveOtherSgaTotal(s, { officerBonus: v, officerPay: nextPay }, nextPay - s.officerPay); } },
  { key: "employeeSalary", modelCode: "M2-12", label: "うち従業員の給与", unit: "億円", indentLevel: 2, get: employeeSalary, set: (s, v) => { const nextPay = v + employeeBonus(s); return preserveOtherSgaTotal(s, { employeeSalary: v, employeePay: nextPay }, nextPay - s.employeePay); } },
  { key: "employeeBonus", modelCode: "M2-13", label: "うち従業員の賞与", unit: "億円", indentLevel: 2, get: employeeBonus, set: (s, v) => { const nextPay = employeeSalary(s) + v; return preserveOtherSgaTotal(s, { employeeBonus: v, employeePay: nextPay }, nextPay - s.employeePay); } },
  { key: "sgaDepreciation", modelCode: "M2-14", label: "うち減価償却費", unit: "億円", indentLevel: 1, get: sgaDepreciation, set: (s, v) => preserveOtherSgaTotal(s, { sgaDepreciation: v, depreciation: cogsDepreciation(s) + v }, v - sgaDepreciation(s)) },
  { key: "researchDevelopment", modelCode: "M2-15", label: "うち研究開発費", unit: "億円", indentLevel: 1, get: researchDevelopment, set: (s, v) => preserveOtherSgaTotal(s, { researchDevelopment: v }, v - researchDevelopment(s)) },
  { key: "ordinaryIncome", modelCode: "M2-18", label: "経常利益", unit: "億円", get: ordinaryIncome, set: (_s, v) => ({ ordinaryIncome: v }) },
  { key: "preTaxIncome", modelCode: "M2-19", label: "税引前当期純利益", unit: "億円", get: preTaxIncome, set: (_s, v) => ({ preTaxIncome: v }) },
  { key: "netIncome", modelCode: "M2-20", label: "当期純利益", unit: "億円", get: netIncome, set: (_s, v) => ({ netIncome: v }) },
  { key: "headcount", modelCode: "M2-27", label: "常時使用する従業員数（就業時間換算）", unit: "人", digits: 0, get: (s) => s.headcount, set: (_s, v) => ({ headcount: Math.max(0, Math.round(v)) }) },
  { key: "officerCount", modelCode: "M2-28", label: "役員数", unit: "人", digits: 0, get: (s) => s.officerCount, set: (_s, v) => ({ officerCount: Math.max(0, Math.round(v)) }) },
];

type OtherPlCalculatedField = {
  key: string;
  modelCode: string;
  label: string;
  unit: string;
  digits?: number;
  indentLevel?: 1 | 2;
  get: (rows: YearPlan[], index: number) => number | undefined;
};

const segmentGrowth = (current: number, previous: number | undefined) =>
  previous ? (current / previous - 1) * 100 : undefined;
const segmentRate = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator * 100 : 0;
const segmentSgaTotal = (segment: SegmentPlan) =>
  segment.employeePay + segment.officerPay + sgaDepreciation(segment) + researchDevelopment(segment) + segment.otherSga;
const segmentEbitda = (segment: SegmentPlan) => operatingProfit(segment) + segment.depreciation;

const otherPlCalculatedFields: OtherPlCalculatedField[] = [
  { key: "salesGrowth", modelCode: "M2-2", label: "売上高成長率", unit: "%", indentLevel: 1, get: (rows, index) => segmentGrowth(rows[index].other.sales, index ? rows[index - 1].other.sales : undefined) },
  { key: "grossProfit", modelCode: "M2-5", label: "売上総利益", unit: "億円", get: (rows, index) => rows[index].other.sales - rows[index].other.cogs },
  { key: "grossProfitMargin", modelCode: "M2-6", label: "売上総利益率", unit: "%", indentLevel: 1, get: (rows, index) => { const segment = rows[index].other; return segmentRate(segment.sales - segment.cogs, segment.sales); } },
  { key: "officerPay", modelCode: "M2-8", label: "うち役員の人件費", unit: "億円", indentLevel: 1, get: (rows, index) => rows[index].other.officerPay },
  { key: "employeePay", modelCode: "M2-11", label: "うち従業員の人件費", unit: "億円", indentLevel: 1, get: (rows, index) => rows[index].other.employeePay },
  { key: "operatingProfit", modelCode: "M2-16", label: "営業利益", unit: "億円", get: (rows, index) => operatingProfit(rows[index].other) },
  { key: "operatingProfitMargin", modelCode: "M2-17", label: "営業利益率", unit: "%", indentLevel: 1, get: (rows, index) => { const segment = rows[index].other; return segmentRate(operatingProfit(segment), segment.sales); } },
  { key: "nonOperatingProfitLoss", modelCode: "M2-17A", label: "営業外損益（純額）", unit: "億円", indentLevel: 1, get: (rows, index) => nonOperatingProfitLoss(rows[index].other) },
  { key: "extraordinaryProfitLoss", modelCode: "M2-18A", label: "特別損益（純額）", unit: "億円", indentLevel: 1, get: (rows, index) => extraordinaryProfitLoss(rows[index].other) },
  { key: "employeePayTotal", modelCode: "M2-21", label: "給与支給総額（常時使用する従業員）", unit: "億円", get: (rows, index) => rows[index].other.employeePay },
  { key: "officerPayTotal", modelCode: "M2-22", label: "給与支給総額（役員）", unit: "億円", get: (rows, index) => rows[index].other.officerPay },
  { key: "depreciationTotal", modelCode: "M2-23", label: "減価償却費（合計）", unit: "億円", get: (rows, index) => rows[index].other.depreciation },
  { key: "valueAdded", modelCode: "M2-24", label: "付加価値額", unit: "億円", get: (rows, index) => valueAdded(rows[index].other) },
  { key: "valueAddedGrowth", modelCode: "M2-25", label: "付加価値増加率", unit: "%", indentLevel: 1, get: (rows, index) => segmentGrowth(valueAdded(rows[index].other), index ? valueAdded(rows[index - 1].other) : undefined) },
  { key: "valueAddedMargin", modelCode: "M2-26", label: "売上高付加価値率", unit: "%", indentLevel: 1, get: (rows, index) => segmentRate(valueAdded(rows[index].other), rows[index].other.sales) },
  { key: "employeePayPerPerson", modelCode: "M2-29", label: "従業員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => { const segment = rows[index].other; return segment.headcount ? segment.employeePay / segment.headcount : 0; } },
  { key: "employeePayPerPersonGrowth", modelCode: "M2-30", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, get: (rows, index) => { const current = rows[index].other; const previous = index ? rows[index - 1].other : undefined; return segmentGrowth(current.headcount ? current.employeePay / current.headcount : 0, previous?.headcount ? previous.employeePay / previous.headcount : undefined); } },
  { key: "officerPayPerPerson", modelCode: "M2-31", label: "役員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => { const segment = rows[index].other; return segment.officerCount ? segment.officerPay / segment.officerCount : 0; } },
  { key: "officerPayPerPersonGrowth", modelCode: "M2-32", label: "役員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, get: (rows, index) => { const current = rows[index].other; const previous = index ? rows[index - 1].other : undefined; return segmentGrowth(current.officerCount ? current.officerPay / current.officerCount : 0, previous?.officerCount ? previous.officerPay / previous.officerCount : undefined); } },
  { key: "laborProductivity", modelCode: "M2-33", label: "労働生産性", unit: "億円/人", get: (rows, index) => { const segment = rows[index].other; const people = segment.headcount + segment.officerCount; return people ? valueAdded(segment) / people : 0; } },
  { key: "ebitda", modelCode: "M2-34", label: "EBITDA", unit: "億円", get: (rows, index) => segmentEbitda(rows[index].other) },
  { key: "ebitdaMargin", modelCode: "M2-35", label: "EBITDAマージン", unit: "%", indentLevel: 1, get: (rows, index) => { const segment = rows[index].other; return segmentRate(segmentEbitda(segment), segment.sales); } },
  { key: "ebitdaGrowth", modelCode: "M2-36", label: "EBITDA増加率", unit: "%", indentLevel: 1, get: (rows, index) => segmentGrowth(segmentEbitda(rows[index].other), index ? segmentEbitda(rows[index - 1].other) : undefined) },
];

type OtherPlDisplayRow = {
  code: string;
  label: string;
  unit: string;
  digits?: number;
  indentLevel?: 1 | 2;
  input?: OtherPlInputField;
  get: (rows: YearPlan[], index: number) => number | undefined;
};

const otherPlDisplayRows: OtherPlDisplayRow[] = [
  ...otherPlInputFields.map((input) => ({
    code: input.modelCode,
    label: input.label,
    unit: input.unit,
    digits: input.digits,
    indentLevel: input.indentLevel,
    input,
    get: (rows: YearPlan[], index: number) => input.get(rows[index].other),
  })),
  ...otherPlCalculatedFields.map((item) => ({
    code: item.modelCode,
    label: item.label,
    unit: item.unit,
    digits: item.digits,
    indentLevel: item.indentLevel,
    get: item.get,
  })),
].sort((left, right) => {
  const order = (code: string) => {
    const match = code.match(/M2-(\d+)([A-Z])?/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return Number(match[1]) * 10 + (match[2] ? match[2].charCodeAt(0) - 64 : 0);
  };
  return order(left.code) - order(right.code);
});

const projectDetailedOfficialCodes: Record<string, string> = {
  "M2-1": "7-1",
  "M2-2": "7-2",
  "M2-5": "7-4",
  "M2-6": "7-5",
  "M2-16": "7-6",
  "M2-17": "7-7",
  "M2-21": "7-8",
  "M2-22": "7-9",
  "M2-23": "7-10",
  "M2-24": "7-11",
  "M2-25": "7-12",
  "M2-27": "7-13",
  "M2-28": "7-14",
  "M2-29": "7-15",
  "M2-30": "7-16",
  "M2-31": "7-17",
  "M2-32": "7-18",
  "M2-33": "7-19",
};

const projectDetailedCode = (modelCode: string) =>
  projectDetailedOfficialCodes[modelCode] ?? modelCode.replace("M2-", "P2-");

const projectDetailedInputFields: OtherPlInputField[] = otherPlInputFields.map((item) => ({
  ...item,
  modelCode: projectDetailedCode(item.modelCode),
}));

const projectDetailedDisplayRows: OtherPlDisplayRow[] = otherPlDisplayRows.map((item) => {
  const input = item.input
    ? projectDetailedInputFields.find((candidate) => candidate.key === item.input!.key)
    : undefined;
  return {
    ...item,
    code: projectDetailedCode(item.code),
    input,
    get: (rows: YearPlan[], index: number) =>
      item.get(rows.map((row) => ({ ...row, other: row.project })), index),
  };
});

const companyModeUnsupportedOtherCodes = new Set([
  "M2-4",
  "M2-9",
  "M2-10",
  "M2-12",
  "M2-13",
  "M2-14",
  "M2-15",
  "M2-18",
  "M2-19",
  "M2-20",
]);

const percentDriver = (key: keyof Drivers) =>
  !["investment", "subsidy", "localBenchmark"].includes(key);

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

const createFutureCapex = (settings: TimelineSettings) => {
  return Array.from({ length: settings.baseYear + 3 - settings.latestYear }, (_, index) => ({
    year: settings.latestYear + index + 1,
    value: 0,
  }));
};

type ForecastOverrides = Record<string, number>;
type FutureInputBasis = "company" | "other";
type ForecastSegment = SegmentKey | "company";
const forecastOverrideKey = (year: number, segment: ForecastSegment, item: string) => `${year}:${segment}:${item}`;
const requiredProjectDepreciationInputs = [
  { code: "P2-4", detailedKey: "cogsDepreciation", label: "売上原価に含まれる減価償却費" },
  { code: "P2-14", detailedKey: "sgaDepreciation", label: "販管費に含まれる減価償却費" },
] as const;
const requiredProjectDepreciationCodes = new Set<string>(requiredProjectDepreciationInputs.map((item) => item.code));
const requiredProjectDepreciationDetailedKeys = new Set<string>(requiredProjectDepreciationInputs.map((item) => item.detailedKey));
type MissingProjectDepreciationInput = { year: number; code: string; label: string; overrideKey: string };

function missingProjectDepreciationInputs(plan: YearPlan[], overrides: ForecastOverrides, inputBasis: FutureInputBasis) {
  return plan.slice(3).flatMap((row) => requiredProjectDepreciationInputs.flatMap((item) => {
    const inputItem = inputBasis === "company" ? item.code : item.detailedKey;
    const overrideKey = forecastOverrideKey(row.year, "project", inputItem);
    return Object.prototype.hasOwnProperty.call(overrides, overrideKey)
      ? []
      : [{ year: row.year, code: item.code, label: item.label, overrideKey }];
  }));
}

function clearMissingProjectDepreciation(plan: YearPlan[], missingInputs: MissingProjectDepreciationInput[]) {
  if (!missingInputs.length) return plan;
  const result = clone(plan);
  for (const missing of missingInputs) {
    const row = result.find((candidate) => candidate.year === missing.year);
    if (!row) continue;
    if (missing.code === "P2-4") row.project.cogsDepreciation = 0;
    if (missing.code === "P2-14") row.project.sgaDepreciation = 0;
    row.project.depreciation = cogsDepreciation(row.project) + sgaDepreciation(row.project);
  }
  return result;
}

function createInitialInputValues(): InputValues {
  let values: InputValues = {};
  for (const definition of metrics) {
    if (isOptimizationExcludedMetric(definition.key) || scaleDependentMetricKeys.has(definition.key)) continue;
    values = setInputValue(values, inputKey.target(definition.key, "value"), defaultTargets[definition.key].value);
    if (defaultTargets[definition.key].max !== undefined) values = setInputValue(values, inputKey.target(definition.key, "max"), defaultTargets[definition.key].max!);
  }
  return values;
}

function applyForecastOverrides(plan: YearPlan[], overrides: ForecastOverrides, inputBasis: FutureInputBasis, drivers: Drivers) {
  const result = clone(plan);
  const projectAnchors = new Set<string>();
  const otherAnchors = new Set<string>();
  const legacyOtherAnchors = new Set<"employeePay" | "officerPay" | "depreciation" | "otherSga">();
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
    row.project.cogsDepreciation = 0;
    row.project.sgaDepreciation = 0;
    row.project.depreciation = 0;

    if (inputBasis === "other") {
      for (const legacyField of ["employeePay", "officerPay", "depreciation", "otherSga"] as const) {
        const legacyKey = forecastOverrideKey(row.year, "other", legacyField);
        if (Object.prototype.hasOwnProperty.call(overrides, legacyKey)) {
          row.other[legacyField] = roundedInput(overrides[legacyKey]);
          legacyOtherAnchors.add(legacyField);
        } else if (legacyOtherAnchors.has(legacyField)) {
          row.other[legacyField] = cascade(previousEffective.other[legacyField], previousAuto.other[legacyField], autoRow.other[legacyField]);
        }
      }
      for (const item of otherPlInputFields) {
        const key = forecastOverrideKey(row.year, "other", item.key);
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          const patch = item.set(row.other, roundedInput(overrides[key], item.digits ?? 2));
          Object.entries(patch).forEach(([field, value]) => {
            row.other[field as keyof SegmentPlan] = roundedInput(value ?? 0, field === "headcount" || field === "officerCount" ? 0 : 2);
          });
          otherAnchors.add(item.key);
        } else if (otherAnchors.has(item.key)) {
          const projected = cascade(item.get(previousEffective.other), item.get(previousAuto.other), item.get(autoRow.other));
          const patch = item.set(row.other, projected);
          Object.entries(patch).forEach(([field, value]) => {
            row.other[field as keyof SegmentPlan] = roundedInput(value ?? 0, field === "headcount" || field === "officerCount" ? 0 : 2);
          });
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
        if (!requiredProjectDepreciationCodes.has(item.code)) projectAnchors.add(item.code);
      } else if (!requiredProjectDepreciationCodes.has(item.code) && projectAnchors.has(item.code)) {
        const projected = cascade(item.get(previousEffective.project), item.get(previousAuto.project), item.get(autoRow.project));
        const patch = item.set(row.project, projected);
        Object.entries(patch).forEach(([field, value]) => {
          row.project[field as keyof SegmentPlan] = roundedInput(value ?? 0, item.digits ?? 2);
        });
      }
    }

    if (inputBasis === "other") {
      for (const item of projectDetailedInputFields) {
        const key = forecastOverrideKey(row.year, "project", item.key);
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          const patch = item.set(row.project, roundedInput(overrides[key], item.digits ?? 2));
          Object.entries(patch).forEach(([field, value]) => {
            row.project[field as keyof SegmentPlan] = roundedInput(value ?? 0, field === "headcount" || field === "officerCount" ? 0 : 2);
          });
          if (!requiredProjectDepreciationDetailedKeys.has(item.key)) projectAnchors.add(item.key);
        } else if (!requiredProjectDepreciationDetailedKeys.has(item.key) && projectAnchors.has(item.key)) {
          const projected = cascade(item.get(previousEffective.project), item.get(previousAuto.project), item.get(autoRow.project));
          const patch = item.set(row.project, projected);
          Object.entries(patch).forEach(([field, value]) => {
            row.project[field as keyof SegmentPlan] = roundedInput(value ?? 0, field === "headcount" || field === "officerCount" ? 0 : 2);
          });
        }
      }
    }

    if (inputBasis === "company") {
      const autoCompany = total(autoRow.project, autoRow.other);
      const effectiveCompany = total(row.project, row.other);
      const operatingDelta = operatingProfit(effectiveCompany) - operatingProfit(autoCompany);
      const autoOrdinary = ordinaryIncome(autoCompany);
      const autoPreTax = preTaxIncome(autoCompany);
      const autoNet = netIncome(autoCompany);
      const afterTaxRatio = autoPreTax ? autoNet / autoPreTax : 1 - drivers.effectiveTaxRate;
      row.other.ordinaryIncome = roundedInput(autoOrdinary + operatingDelta - ordinaryIncome(row.project));
      row.other.preTaxIncome = roundedInput(autoPreTax + operatingDelta - preTaxIncome(row.project));
      row.other.netIncome = roundedInput(autoNet + operatingDelta * afterTaxRatio - netIncome(row.project));
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

function usePageStickyTableHeaders() {
  useEffect(() => {
    const overlays = new Map<HTMLElement, HTMLDivElement>();
    let animationFrame = 0;
    const removeOverlay = (wrapper: HTMLElement) => {
      overlays.get(wrapper)?.remove();
      overlays.delete(wrapper);
    };
    const updateHeaders = () => {
      animationFrame = 0;
      const tabsBottom = document.querySelector<HTMLElement>(".tabs")?.getBoundingClientRect().bottom ?? 0;
      const visibleWrappers = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>(".wide-table, .targets-table-wrap").forEach((wrapper) => {
        const table = wrapper.querySelector<HTMLTableElement>(":scope > table");
        const header = table?.tHead;
        if (!table || !header || wrapper.offsetParent === null) {
          removeOverlay(wrapper);
          return;
        }

        let targetTop = tabsBottom;
        const diagnosticRoot = wrapper.closest<HTMLElement>(".financial-diagnostics");
        const diagnosticChart = diagnosticRoot?.querySelector<HTMLElement>(".diagnostic-selected-chart");
        if (diagnosticChart) {
          const chartRect = diagnosticChart.getBoundingClientRect();
          if (chartRect.top <= tabsBottom + 2 && chartRect.bottom > targetTop) targetTop = chartRect.bottom;
        }
        const panelHeading = wrapper.closest(".table-panel")?.querySelector<HTMLElement>(":scope > .panel-heading");
        const sectionHeading = wrapper.parentElement?.querySelector<HTMLElement>(":scope > h3");
        for (const heading of [panelHeading, sectionHeading]) {
          if (!heading) continue;
          const headingRect = heading.getBoundingClientRect();
          if (headingRect.top <= targetTop + 2 && headingRect.bottom > targetTop) targetTop = headingRect.bottom;
        }

        const wrapperRect = wrapper.getBoundingClientRect();
        const headerHeight = header.getBoundingClientRect().height;
        if (wrapperRect.top >= targetTop || wrapperRect.bottom <= 0) {
          removeOverlay(wrapper);
          return;
        }

        visibleWrappers.add(wrapper);
        let overlay = overlays.get(wrapper);
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.className = "page-sticky-header-overlay";
          overlay.setAttribute("aria-hidden", "true");
          document.body.append(overlay);
          overlays.set(wrapper, overlay);
        }
        overlay.classList.toggle("driver-target-table", wrapper.classList.contains("driver-target-table"));

        const signature = header.innerHTML;
        if (overlay.dataset.signature !== signature) {
          const overlayTable = table.cloneNode(false) as HTMLTableElement;
          overlayTable.removeAttribute("id");
          overlayTable.append(header.cloneNode(true));
          overlay.replaceChildren(overlayTable);
          overlay.dataset.signature = signature;
        }
        const overlayTable = overlay.querySelector("table")!;
        const sourceRows = Array.from(header.rows);
        const overlayRows = Array.from(overlayTable.tHead?.rows ?? []);
        sourceRows.forEach((row, index) => {
          const rowHeight = row.getBoundingClientRect().height;
          if (overlayRows[index]) overlayRows[index].style.height = `${rowHeight}px`;
        });
        const sourceCells = Array.from(header.querySelectorAll<HTMLTableCellElement>("th, td"));
        const overlayCells = Array.from(overlayTable.querySelectorAll<HTMLTableCellElement>("th, td"));
        sourceCells.forEach((cell, index) => {
          const width = cell.getBoundingClientRect().width;
          const height = cell.getBoundingClientRect().height;
          if (overlayCells[index]) {
            overlayCells[index].style.width = `${width}px`;
            overlayCells[index].style.minWidth = `${width}px`;
            overlayCells[index].style.maxWidth = `${width}px`;
            overlayCells[index].style.height = `${height}px`;
          }
        });
        overlayTable.style.width = `${table.scrollWidth}px`;
        overlay.style.left = `${wrapperRect.left}px`;
        overlay.style.top = `${Math.min(targetTop, wrapperRect.bottom - headerHeight)}px`;
        overlay.style.width = `${wrapperRect.width}px`;
        overlay.style.height = `${headerHeight}px`;
        overlay.scrollLeft = wrapper.scrollLeft;
      });
      for (const wrapper of overlays.keys()) {
        if (!visibleWrappers.has(wrapper)) removeOverlay(wrapper);
      }
    };
    const scheduleUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateHeaders);
    };

    updateHeaders();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    document.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      document.removeEventListener("scroll", scheduleUpdate, { capture: true });
      overlays.forEach((overlay) => overlay.remove());
    };
  }, []);
}

function useFloatingHorizontalTableScrollbar() {
  useEffect(() => {
    const scrollbar = document.createElement("div");
    const spacer = document.createElement("div");
    scrollbar.className = "floating-table-scrollbar";
    scrollbar.setAttribute("role", "scrollbar");
    scrollbar.setAttribute("aria-label", "表示中の表を横スクロール");
    spacer.className = "floating-table-scrollbar-spacer";
    scrollbar.append(spacer);
    document.body.append(scrollbar);

    let activeWrapper: HTMLElement | null = null;
    let animationFrame = 0;
    let syncing = false;
    const updateScrollbar = () => {
      animationFrame = 0;
      const tabsBottom = document.querySelector<HTMLElement>(".tabs")?.getBoundingClientRect().bottom ?? 0;
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(".wide-table, .targets-table-wrap"))
        .filter((wrapper) => {
          const rect = wrapper.getBoundingClientRect();
          const overflowX = window.getComputedStyle(wrapper).overflowX;
          return wrapper.offsetParent !== null
            && (overflowX === "auto" || overflowX === "scroll")
            && wrapper.scrollWidth > wrapper.clientWidth + 1
            && rect.top < window.innerHeight
            && rect.bottom > window.innerHeight;
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          const leftCurrent = leftRect.top <= tabsBottom && leftRect.bottom > tabsBottom;
          const rightCurrent = rightRect.top <= tabsBottom && rightRect.bottom > tabsBottom;
          if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
          return Math.abs(leftRect.top - tabsBottom) - Math.abs(rightRect.top - tabsBottom);
        });
      const wrapper = candidates[0] ?? null;
      const wrapperRect = wrapper?.getBoundingClientRect();
      if (!wrapper || !wrapperRect) {
        activeWrapper = null;
        scrollbar.classList.remove("is-visible");
        return;
      }

      activeWrapper = wrapper;
      scrollbar.style.left = `${wrapperRect.left}px`;
      scrollbar.style.width = `${wrapperRect.width}px`;
      spacer.style.width = `${wrapper.scrollWidth}px`;
      syncing = true;
      scrollbar.scrollLeft = wrapper.scrollLeft;
      syncing = false;
      scrollbar.classList.add("is-visible");
    };
    const scheduleUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateScrollbar);
    };
    const scrollTable = () => {
      if (!activeWrapper || syncing) return;
      syncing = true;
      activeWrapper.scrollLeft = scrollbar.scrollLeft;
      syncing = false;
    };

    scrollbar.addEventListener("scroll", scrollTable, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    document.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    updateScrollbar();
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      scrollbar.removeEventListener("scroll", scrollTable);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      document.removeEventListener("scroll", scheduleUpdate, { capture: true });
      scrollbar.remove();
    };
  }, []);
}

export default function Home() {
  useSpreadsheetGrid();
  usePageStickyTableHeaders();
  useFloatingHorizontalTableScrollbar();
  const [view, setView] = useState<View>("history");

  function goToView(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
  const [timeline, setTimeline] = useState<TimelineSettings>({ ...DEFAULT_TIMELINE });
  const [historicalPlan, setHistoricalPlan] = useState<YearPlan[]>(() => createHistoricalPlan(basePlan, DEFAULT_TIMELINE));
  const [balanceSheets, setBalanceSheets] = useState<BalanceSheetPlan[]>(() => retimeBalanceSheets(defaultBalanceSheets, DEFAULT_TIMELINE));
  const [omitSimulationUnusedBalanceSheet, setOmitSimulationUnusedBalanceSheet] = useState(false);
  const [futureCapex, setFutureCapex] = useState(() => createFutureCapex(DEFAULT_TIMELINE));
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
  const missingAccountingAssumptions = useMemo(() => accountingAssumptionDriverKeys.filter((key) =>
    !hasInputValue(inputValues, inputKey.driver(key)),
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
  const [loadNotice, setLoadNotice] = useState<{ id: number; message: string } | null>(null);
  const [excelMapping, setExcelMapping] = useState<ExcelMappingDefinition | null>(null);
  const [excelMappingFileName, setExcelMappingFileName] = useState("");
  const [mappedExcelBytes, setMappedExcelBytes] = useState<Uint8Array | null>(null);
  const [mappedExcelFileName, setMappedExcelFileName] = useState("");
  const [excelMappingPreview, setExcelMappingPreview] = useState<ExcelMappingPreview[]>([]);
  const [excelMappingPreviewMode, setExcelMappingPreviewMode] = useState<"import" | "export" | null>(null);
  const [excelMappingNote, setExcelMappingNote] = useState("マッピング定義書と対象Excelを選択してください。");
  const [copilotPromptCopied, setCopilotPromptCopied] = useState(false);
  const hasExistingPlanningData = useMemo(() => {
    const initialValues = createInitialInputValues();
    const inputKeys = new Set([...Object.keys(initialValues), ...Object.keys(inputValues)]);
    const inputsChanged = [...inputKeys].some((key) =>
      !hasInputValue(initialValues, key)
      || !hasInputValue(inputValues, key)
      || initialValues[key] !== inputValues[key],
    );
    return inputsChanged
      || Object.keys(forecastOverrides).length > 0
      || adjustedPlan !== null
      || historicalDefaultsApplied
      || applicationCategory !== defaultApplicationCategory
      || futureInputBasis !== "other"
      || JSON.stringify(timeline) !== JSON.stringify(DEFAULT_TIMELINE);
  }, [adjustedPlan, applicationCategory, forecastOverrides, futureInputBasis, historicalDefaultsApplied, inputValues, timeline]);
  const excelMappingTargets = useMemo(() => {
    const targets = new Map<string, ExcelMappingTarget>();
    const periodNames = ["prePrevious", "previous", "latest"] as const;
    periodNames.forEach((period, index) => {
      const history = historicalPlan[index];
      if (!history) return;
      const year = history.year;
      balanceSheetInputRows.forEach((item) => {
        const key = inputKey.balanceSheet(year, item.field);
        targets.set(`balanceSheet.${period}.${item.code}`, {
          id: `balanceSheet.${period}.${item.code}`,
          label: `${YEAR_ROLE_LABELS[history.role]} B/S ${item.code} ${item.label}`,
          unit: "億円",
          writable: true,
          value: hasInputValue(inputValues, key) ? inputValues[key] : null,
        });
      });
      companyActualInputRows.filter((item) => item.set).forEach((item) => {
        const key = inputKey.companyActual(year, item.code);
        targets.set(`companyPL.${period}.${item.code}`, {
          id: `companyPL.${period}.${item.code}`,
          label: `${YEAR_ROLE_LABELS[history.role]} 全社PL ${item.code} ${item.label}`,
          unit: item.unit === "%" ? "%" : item.unit === "人" ? "人" : "億円",
          writable: true,
          value: hasInputValue(inputValues, key) ? inputValues[key] : null,
        });
      });
      projectOfficialInputRows.forEach((item) => {
        const key = inputKey.projectActual(year, item.code);
        targets.set(`projectPL.${period}.${item.code}`, {
          id: `projectPL.${period}.${item.code}`,
          label: `${YEAR_ROLE_LABELS[history.role]} 補助事業PL ${item.code} ${item.label}`,
          unit: item.unit === "人" ? "人" : "億円",
          writable: true,
          value: hasInputValue(inputValues, key) ? inputValues[key] : null,
        });
      });
    });
    return targets;
  }, [historicalPlan, inputValues]);

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

  useEffect(() => {
    if (!loadNotice) return;
    const noticeId = loadNotice.id;
    const timeoutId = window.setTimeout(() => {
      setLoadNotice((current) => current?.id === noticeId ? null : current);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [loadNotice]);

  function showLoadNotice(message: string) {
    setLoadNotice({ id: Date.now(), message });
  }

  function keepOnlyProposalMenuOpen(openedMenu: HTMLDetailsElement) {
    if (!openedMenu.open) return;
    document.querySelectorAll<HTMLDetailsElement>(".proposal-action-menu[open]").forEach((menu) => {
      if (menu !== openedMenu) menu.removeAttribute("open");
    });
  }
  const missingProjectDepreciation = useMemo(
    () => missingProjectDepreciationInputs(autoPlan, forecastOverrides, futureInputBasis),
    [autoPlan, forecastOverrides, futureInputBasis],
  );
  const sourcePlan = useMemo(() => applyForecastOverrides(autoPlan, forecastOverrides, futureInputBasis, drivers), [autoPlan, forecastOverrides, futureInputBasis, drivers]);
  const plan = useMemo(
    () => clearMissingProjectDepreciation(adjustedPlan ?? sourcePlan, missingProjectDepreciation),
    [adjustedPlan, sourcePlan, missingProjectDepreciation],
  );
  const calculationDrivers = adjustedDrivers ?? drivers;
  const missingProjectDepreciationKeys = useMemo(
    () => new Set(missingProjectDepreciation.map((item) => `${item.year}:${item.code}`)),
    [missingProjectDepreciation],
  );
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
    const inputValidations = missingProjectDepreciation.map((item) => ({
      level: "error" as const,
      year: item.year,
      title: `${item.code} ${item.label}が未入力`,
      detail: "③将来データ入力で年度別計画値を入力してください。空欄を自動予測値で補完しません。",
    }));
    const combined = [...inputValidations, ...statutoryValidations];
    return combined.length ? [...combined, ...modelValidations.filter((item) => item.level !== "info")] : modelValidations;
  }, [plan, calculationDrivers, statutoryFailures, missingProjectDepreciation]);
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
      const candidatePlan = applyForecastOverrides(generatePlan(sourceHistorical, candidateDrivers, timeline, period), forecastOverrides, futureInputBasis, candidateDrivers);
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
        companyActualInputRows.filter((item) => item.set).forEach((item) => {
          const value = item.get(proposal.historicalPlan, proposal.historicalPlan.indexOf(row));
          if (value !== undefined) inferred[inputKey.companyActual(row.year, item.code)] = roundedInput(value, item.unit === "人" ? 0 : 2);
        });
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
      setAdjustedPlan(applyForecastOverrides(adjustedAutoPlan, importedForecastOverrides, importedFutureInputBasis, importedAdjustedDrivers ?? importedDrivers));
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
      showLoadNotice(`提案計画「${file.name}」を読み込みました。`);
    } catch (error) {
      setFileNote(error instanceof Error ? error.message : "取込に失敗しました");
    }
  }

  async function loadExcelMappingDefinition(file: File | undefined) {
    if (!file) return;
    try {
      const definition = parseExcelMappingDefinition(await file.text());
      setExcelMapping(definition);
      setExcelMappingFileName(file.name);
      setExcelMappingPreview([]);
      setExcelMappingPreviewMode(null);
      setExcelMappingNote(`マッピング定義「${definition.name}」を読み込みました（${definition.bindings.length}件）。`);
    } catch (error) {
      setExcelMapping(null);
      setExcelMappingFileName("");
      setExcelMappingPreview([]);
      setExcelMappingPreviewMode(null);
      setExcelMappingNote(error instanceof Error ? error.message : "マッピング定義書を読み込めませんでした。");
    }
  }

  async function loadMappedExcel(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setMappedExcelBytes(null);
      setMappedExcelFileName("");
      setExcelMappingNote(".xlsx または .xlsm を指定してください。");
      return;
    }
    setMappedExcelBytes(new Uint8Array(await file.arrayBuffer()));
    setMappedExcelFileName(file.name);
    setExcelMappingPreview([]);
    setExcelMappingPreviewMode(null);
    setExcelMappingNote(`対象Excel「${file.name}」を読み込みました。取込内容を確認してください。`);
  }

  function inspectMappedExcelImport() {
    if (!excelMapping || !mappedExcelBytes) {
      setExcelMappingNote("マッピング定義書と対象Excelの両方を選択してください。");
      return;
    }
    try {
      const preview = previewExcelImport(mappedExcelBytes, excelMapping, excelMappingTargets);
      setExcelMappingPreview(preview);
      setExcelMappingPreviewMode("import");
      const ready = preview.filter((item) => item.status === "ready").length;
      const errors = preview.filter((item) => item.status === "error").length;
      setExcelMappingNote(`取込候補 ${ready}件、エラー ${errors}件です。内容を確認してから反映してください。`);
    } catch (error) {
      setExcelMappingPreview([]);
      setExcelMappingPreviewMode(null);
      setExcelMappingNote(error instanceof Error ? error.message : "Excelの確認に失敗しました。");
    }
  }

  function applyMappedExcelImport() {
    const ready = excelMappingPreview.filter((item) => item.status === "ready" && item.value !== null);
    if (!ready.length) {
      setExcelMappingNote("反映できる取込候補がありません。");
      return;
    }
    const periodIndex: Record<string, number> = { prePrevious: 0, previous: 1, latest: 2 };
    let applied = 0;
    for (const preview of ready) {
      const [dataset, period, code] = preview.target.split(".");
      const yearIndex = periodIndex[period];
      if (yearIndex === undefined || !code) continue;
      if (dataset === "balanceSheet") {
        const item = balanceSheetInputRows.find((candidate) => candidate.code === code);
        if (item) {
          updateBalanceSheet(yearIndex, item.field, preview.value);
          applied += 1;
        }
      } else if (dataset === "companyPL") {
        const item = companyActualInputRows.find((candidate) => candidate.code === code && candidate.set);
        if (item) {
          updateHistoricalCompanyOfficial(yearIndex, item, preview.value);
          applied += 1;
        }
      } else if (dataset === "projectPL") {
        const item = projectOfficialInputRows.find((candidate) => candidate.code === code);
        if (item) {
          updateHistoricalProjectOfficial(yearIndex, item, preview.value);
          applied += 1;
        }
      }
    }
    setExcelMappingNote(`${applied}件を反映しました。0は明示的な0、空欄は未設定のまま保持しています。`);
    if (applied > 0) showLoadNotice(`Excelから${applied}件の値を読み込みました。`);
  }

  function exportMappedExcel() {
    if (!excelMapping || !mappedExcelBytes || !mappedExcelFileName) {
      setExcelMappingNote("マッピング定義書と出力元Excelの両方を選択してください。");
      return;
    }
    try {
      const result = buildMappedExcel(mappedExcelBytes, excelMapping, excelMappingTargets);
      setExcelMappingPreview(result.previews);
      setExcelMappingPreviewMode("export");
      if (!result.bytes) {
        setExcelMappingNote("出力を停止しました。エラーのあるマッピングを修正してください。");
        return;
      }
      const extension = mappedExcelFileName.toLowerCase().endsWith(".xlsm") ? "xlsm" : "xlsx";
      const stem = mappedExcelFileName.replace(/\.(xlsx|xlsm)$/i, "");
      const outputBytes = new Uint8Array(result.bytes);
      downloadBlob(
        outputBytes.buffer,
        `${stem}_シミュレーター出力.${extension}`,
        extension === "xlsm" ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      setExcelMappingNote(`元ファイルを変更せず「${stem}_シミュレーター出力.${extension}」として保存しました。`);
    } catch (error) {
      setExcelMappingNote(error instanceof Error ? error.message : "Excel出力に失敗しました。");
    }
  }

  function downloadExcelMappingExample() {
    downloadBlob(JSON.stringify(EXCEL_MAPPING_EXAMPLE, null, 2), "Excelマッピング定義書_サンプル.json", "application/json;charset=utf-8");
  }

  function downloadExcelMappingManual() {
    downloadBlob(EXCEL_MAPPING_MANUAL, "Excelマッピング定義書_作成マニュアル.md", "text/markdown;charset=utf-8");
  }

  async function copyExcelMappingCopilotPrompt() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EXCEL_MAPPING_COPILOT_PROMPT);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = EXCEL_MAPPING_COPILOT_PROMPT;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand("copy");
        textArea.remove();
        if (!copied) throw new Error("copy command failed");
      }
      setCopilotPromptCopied(true);
      setExcelMappingNote("Copilotへの指示プロンプトをコピーしました。対象Excel・作成マニュアル・JSONサンプルと一緒にCopilotへ渡してください。");
      window.setTimeout(() => setCopilotPromptCopied(false), 2500);
    } catch {
      setCopilotPromptCopied(false);
      setExcelMappingNote("プロンプトをコピーできませんでした。作成マニュアル内の「Copilotへの依頼方法」をコピーしてください。");
    }
  }

  function confirmSampleReplacement() {
    if (!hasExistingPlanningData) return true;
    return window.confirm("すでに入力されているデータがあります。サンプルを読み込むと、現在の入力・設定・最適化結果を上書きします。よろしいですか？");
  }

  function loadSampleProposal() {
    if (!confirmSampleReplacement()) return;
    const proposal = createStandardSampleProposal(new Date().toISOString());
    applyProposal(proposal);
    setHistoricalDefaultsApplied(true);
    setDefaultNote("過去3期実績から調整水準を設定し、初回最適化後に2029年のベース事業売上高・補助事業の従業員給与支給総額を上書きして、再最適化したサンプルです。");
    setSolveNote("標準提案サンプル：一部将来データ入力後の再最適化まで実行済みです。");
    setFileNote("過去入力・調整水準設定・2段階最適化済みの標準提案を読み込みました");
    showLoadNotice("「最適化済み標準提案」を読み込みました。");
  }

  function loadPartiallyUnmetSample() {
    if (!confirmSampleReplacement()) return;
    applyProposal(createPartiallyUnmetSampleProposal(new Date().toISOString()));
    setHistoricalDefaultsApplied(true);
    setDefaultNote("現実的な許容範囲を維持したため、一部指標が目標に届かなかった最接近案です。未達判定と許容範囲の修正候補を確認できます。");
    setSolveNote("一部目標未達サンプル：許容範囲内で最適化した最接近案を表示しています。");
    setFileNote("最適化後も一部指標が未達となる確認用サンプルを読み込みました");
    showLoadNotice("「一部目標未達ケース」を読み込みました。");
  }

  function loadMultipleUnmetSample() {
    if (!confirmSampleReplacement()) return;
    applyProposal(createMultipleUnmetSampleProposal(new Date().toISOString()));
    setHistoricalDefaultsApplied(true);
    setDefaultNote("全社売上高成長率、全社の従業員1人当たり給与上昇率、補助事業売上高成長率の3指標が、現在の許容範囲では同時達成できない最接近案です。複数の未達項目と修正案の一括適用を確認できます。");
    setSolveNote("複数目標未達サンプル：3指標が未達となる決定論的な最接近案を表示しています。");
    setFileNote("最適化後も3指標が未達となる確認用サンプルを読み込みました");
    showLoadNotice("「複数目標未達ケース（3指標）」を読み込みました。");
  }

  function loadHistoricalOnlySample() {
    if (!confirmSampleReplacement()) return;
    applyProposal(createHistoricalOnlySampleProposal(new Date().toISOString()));
    setFileNote("過去3期入力済み・将来予測未設定のサンプルを読み込みました");
    showLoadNotice("「標準ケース（過去3期入力済み）」を読み込みました。");
  }

  function loadBaseYearLaunchSample() {
    if (!confirmSampleReplacement()) return;
    applyProposal(createBaseYearLaunchHistoricalOnlySampleProposal(new Date().toISOString()));
    setFileNote("補助事業の過去3期実績が0で、将来予測未設定のサンプルを読み込みました");
    showLoadNotice("「基準年売上開始ケース（過去3期入力済み）」を読み込みました。");
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
    const digits = item.unit === "人" ? 0 : 2;
    setInputValues((current) => setInputValue(current, inputKey.companyActual(historicalPlan[yearIndex].year, item.code), inputValue === null ? null : roundedInput(inputValue, digits)));
    setHistoricalPlan((current) => current.map((row, index) => {
      if (index !== yearIndex) return row;
      if (inputValue === null && ["2-18", "2-19", "2-20"].includes(item.code)) {
        const field = ({ "2-18": "ordinaryIncome", "2-19": "preTaxIncome", "2-20": "netIncome" } as const)[item.code as "2-18" | "2-19" | "2-20"];
        return { ...row, other: { ...row.other, [field]: undefined } };
      }
      const patch = item.set!(row, roundedInput(inputValue ?? 0, digits));
      return {
        ...row,
        other: {
          ...row.other,
          ...Object.fromEntries(Object.entries(patch).map(([field, residual]) => [field, roundedInput(residual ?? 0, field === "headcount" || field === "officerCount" ? 0 : 2)])),
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
      setInputValues((values) => setInputValue(
        values,
        inputKey.futureCapex(next[yearIndex].year),
        value === null ? null : roundedInput(value),
      ));
      return next;
    });
  }

  function updateTimeline(patch: Partial<TimelineSettings>) {
    clearAdjustment();
    const next = normalizeTimeline({ ...timeline, ...patch });
    const nextHistorical = retimeHistoricalPlan(historicalPlan, next);
    const nextBalanceSheets = retimeBalanceSheets(balanceSheets, next);
    const nextFutureCapex = createFutureCapex(next).map((row, index) => ({
      ...row,
      value: futureCapex[index]?.value ?? 0,
    }));
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
  }

  function updateDriverRange(key: keyof Drivers, boundIndex: 0 | 1, displayValue: number | null) {
    clearAdjustment();
    const fallback = driverBounds[key][boundIndex];
    const value = displayValue === null ? fallback : percentDriver(key) ? displayValue / 100 : displayValue;
    const nextRange: [number, number] = [...driverRanges[key]];
    nextRange[boundIndex] = value;
    const midpoint = (nextRange[0] + nextRange[1]) / 2;
    setInputValues((current) => {
      let next = setInputValue(current, inputKey.driverRange(key, boundIndex), displayValue === null ? null : value);
      next = setInputValue(next, inputKey.driver(key), midpoint);
      return next;
    });
    setDriverRanges((current) => ({ ...current, [key]: nextRange }));
    setDrivers((current) => ({ ...current, [key]: midpoint }));
  }

  function toggleDriverRangeSuggestion(metricKey: MetricKey, suggestion: DriverRangeSuggestion, checked: boolean) {
    const id = driverRangeSuggestionId(metricKey, suggestion);
    setSelectedAdjustmentSuggestions((current) => ({ ...current, [id]: checked }));
  }

  async function applySelectedDriverRangeSuggestions() {
    const selected = targetManagedMetrics.flatMap((definition) =>
      (targetAdjustmentSuggestions[definition.key] ?? [])
        .filter((suggestion) => selectedAdjustmentSuggestions[driverRangeSuggestionId(definition.key, suggestion)]),
    );
    if (!selected.length) return;
    const nextRanges = clone(driverRanges);
    for (const suggestion of selected) {
      const currentBound = nextRanges[suggestion.key][suggestion.boundIndex];
      nextRanges[suggestion.key][suggestion.boundIndex] = suggestion.boundIndex === 0
        ? Math.min(currentBound, suggestion.value)
        : Math.max(currentBound, suggestion.value);
    }
    const nextDrivers = { ...drivers };
    for (const key of adjustableDriverKeys) {
      nextDrivers[key] = (nextRanges[key][0] + nextRanges[key][1]) / 2;
    }
    setDriverRanges(nextRanges);
    setDrivers(nextDrivers);
    setInputValues((current) => {
      let next = current;
      for (const suggestion of selected) {
        next = setInputValue(next, inputKey.driverRange(suggestion.key, suggestion.boundIndex), nextRanges[suggestion.key][suggestion.boundIndex]);
      }
      for (const key of adjustableDriverKeys) {
        next = setInputValue(next, inputKey.driver(key), nextDrivers[key]);
      }
      return next;
    });
    setSelectedAdjustmentSuggestions({});
    await solve(nextRanges, nextDrivers);
  }

  function applyHistoricalDefaults() {
    const nextDrivers = { ...drivers };
    const nextRanges = clone(driverRanges);
    const clamp = (value: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, value));

    nextDrivers.projectMarketGrowth = hasInputValue(inputValues, inputKey.driver("projectMarketGrowth")) ? drivers.projectMarketGrowth : 0.05;
    const investmentEntered = hasInputValue(inputValues, inputKey.driver("investment"));
    const historicalCapex = balanceSheets.map((row) => row.capex).filter((value) => Number.isFinite(value) && value > 0);
    const annualHistoricalCapex = historicalCapex.length ? historicalCapex.reduce((sum, value) => sum + value, 0) / historicalCapex.length : 0;
    const estimatedInvestment = annualHistoricalCapex * Math.max(1, timeline.baseYear - timeline.latestYear);
    nextDrivers.investment = investmentEntered ? drivers.investment : clamp(estimatedInvestment || 15, driverBounds.investment[0], driverBounds.investment[1]);
    nextDrivers.subsidy = hasInputValue(inputValues, inputKey.driver("subsidy"))
      ? drivers.subsidy
      : clamp(maximumSubsidyAmount(nextDrivers.investment), driverBounds.subsidy[0], driverBounds.subsidy[1]);
    const latest = historicalPlan.at(-1)!;
    const latestCompany = total(latest.project, latest.other);
    const latestPreTax = preTaxIncome(latestCompany);
    const projectCogsSuggestion = suggestCogsRateRange(
      historicalDriverSeries.projectCogsRateWhenSalesZero.values,
      historicalDriverSeries.otherCogsRateWhenSalesZero.values,
    );
    const otherCogsSuggestion = suggestCogsRateRange(historicalDriverSeries.otherCogsRateWhenSalesZero.values);
    const applyCogsSuggestion = (
      key: "projectCogsRateWhenSalesZero" | "otherCogsRateWhenSalesZero",
      suggestion: ReturnType<typeof suggestCogsRateRange>,
    ) => {
      const entered = hasInputValue(inputValues, inputKey.driver(key));
      const initial = entered ? drivers[key] : suggestion.initial;
      nextDrivers[key] = clamp(initial, driverBounds[key][0], driverBounds[key][1]);
      nextRanges[key] = [
        Math.min(nextDrivers[key], suggestion.lower),
        Math.max(nextDrivers[key], suggestion.upper),
      ];
    };
    applyCogsSuggestion("projectCogsRateWhenSalesZero", projectCogsSuggestion);
    applyCogsSuggestion("otherCogsRateWhenSalesZero", otherCogsSuggestion);
    const setAccountingDefault = (key: keyof Drivers, value: number) => {
      nextDrivers[key] = hasInputValue(inputValues, inputKey.driver(key))
        ? drivers[key]
        : clamp(value, driverBounds[key][0], driverBounds[key][1]);
    };
    const segmentAccountingDefaults = (segment: SegmentPlan, segmentKey: "project" | "other") => {
      const employeeBreakdownEntered = segment.employeeSalary !== undefined || segment.employeeBonus !== undefined;
      const officerBreakdownEntered = segment.officerCompensation !== undefined || segment.officerBonus !== undefined;
      setAccountingDefault(
        segmentKey === "project" ? "projectEmployeeSalaryShare" : "otherEmployeeSalaryShare",
        employeeBreakdownEntered && segment.employeePay ? employeeSalary(segment) / segment.employeePay : 1,
      );
      setAccountingDefault(
        segmentKey === "project" ? "projectOfficerCompensationShare" : "otherOfficerCompensationShare",
        officerBreakdownEntered && segment.officerPay ? officerCompensation(segment) / segment.officerPay : 1,
      );
      setAccountingDefault(
        segmentKey === "project" ? "projectResearchDevelopmentRate" : "otherResearchDevelopmentRate",
        segment.sales ? researchDevelopment(segment) / segment.sales : 0,
      );
      setAccountingDefault(
        segmentKey === "project" ? "projectNonOperatingRate" : "otherNonOperatingRate",
        segment.sales ? nonOperatingProfitLoss(segment) / segment.sales : 0,
      );
      setAccountingDefault(
        segmentKey === "project" ? "projectExtraordinaryRate" : "otherExtraordinaryRate",
        segment.sales ? extraordinaryProfitLoss(segment) / segment.sales : 0,
      );
    };
    segmentAccountingDefaults(latest.project, "project");
    segmentAccountingDefaults(latest.other, "other");
    nextDrivers.effectiveTaxRate = hasInputValue(inputValues, inputKey.driver("effectiveTaxRate"))
      ? drivers.effectiveTaxRate
      : clamp(latestPreTax ? 1 - netIncome(latestCompany) / latestPreTax : 0.30, 0, 0.60);
    const officerPayPerHead = historicalPlan.map((row) =>
      row.other.officerCount ? row.other.officerPay / row.other.officerCount : Number.NaN);
    const officerGrowthRates = officerPayPerHead.slice(1).map((value, index) =>
      Number.isFinite(value) && officerPayPerHead[index] > 0 ? value / officerPayPerHead[index] - 1 : Number.NaN)
      .filter(Number.isFinite);
    const officerGrowthDefault = officerGrowthRates.length
      ? officerGrowthRates.reduce((sum, value) => sum + value, 0) / officerGrowthRates.length
      : 0.03;
    nextDrivers.otherOfficerPayGrowthToBase = hasInputValue(inputValues, inputKey.driver("otherOfficerPayGrowthToBase"))
      ? drivers.otherOfficerPayGrowthToBase
      : clamp(officerGrowthDefault, 0, 0.08);
    nextDrivers.otherOfficerPayGrowth = hasInputValue(inputValues, inputKey.driver("otherOfficerPayGrowth"))
      ? drivers.otherOfficerPayGrowth
      : clamp(officerGrowthDefault, 0, 0.08);

    for (const key of adjustableDriverKeys) {
      if (key === "projectCogsRateWhenSalesZero" || key === "otherCogsRateWhenSalesZero") continue;
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
    const postBaseSgaImprovement = Math.max(0, nextDrivers.otherSgaImprovementToBase + 0.005);
    nextDrivers.otherSgaRateEnd = clamp(postBaseSgaImprovement, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]);
    nextRanges.otherSgaRateEnd = [
      clamp(nextDrivers.otherSgaRateEnd - 0.005, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]),
      clamp(nextDrivers.otherSgaRateEnd + 0.005, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]),
    ];
    for (const key of adjustableDriverKeys) {
      nextDrivers[key] = (nextRanges[key][0] + nextRanges[key][1]) / 2;
    }

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
      return next;
    });
    setHistoricalDefaultsApplied(true);
    setDefaultNote("許容下限・上限を過去実績から設定し、その中点を最適化前の計画値にしました。実績不足の項目も推奨範囲または固定値を入力欄に明示しています。補助事業原価率は有効な過去実績を直近重視で設定し、算出不能時はベース事業原価率を参照します。会計内訳・利益前提は、実績内訳がない場合のみ、給与100%・賞与0%、役員報酬100%・役員賞与0%、研究開発費率0%、営業外損益率0%、特別損益率0%、実効税率30%を表示値として設定します。減価償却費は配賦率や耐用年数から作らず、P2-4（売上原価内）とP2-14（販管費内）を年度別に直接入力します。原価率・その他販管費率の改善ポイントは悪化を見込まず、設備導入期間0～2pt、基準年後0～3ptの常識レンジに制限しています。ベース事業の基準年後は補助事業とのシナジーを見込み、設備導入期間より売上成長率を2.0pt、原価率改善を0.5pt、給与・人員成長率を0.5pt高く設定しています。15指標の増加額5項目は固定中央値を使わず、対応する成長率目標と基準年の売上高・付加価値・給与・人数から規模連動で換算しています。未入力の投資額は過去の年平均設備投資額×設備導入年数、補助金額は投資額の3分の1、市場伸び率は5%で仮置きしています。");
  }

  function confirmAndApplyHistoricalDefaults() {
    if (forecastSettingsStarted && !window.confirm("将来予測の水準が指定済みです。過去データを基にした推奨値に変更してよろしいですか？")) return;
    applyHistoricalDefaults();
  }

  function driverRangeDisplayValue(key: keyof Drivers, boundIndex: 0 | 1) {
    const raw = getInputValue(inputValues, inputKey.driverRange(key, boundIndex));
    return raw === "" ? "" : roundedInput(percentDriver(key) ? raw * 100 : raw);
  }

  function driverDirectDisplayValue(key: keyof Drivers) {
    const raw = getInputValue(inputValues, inputKey.driver(key));
    return raw === "" ? "" : roundedInput(percentDriver(key) ? raw * 100 : raw);
  }

  function renderDriverPeriodCells(key?: keyof Drivers) {
    if (!key) return <><td className="driver-period-empty" colSpan={2}>—</td></>;
    const info = driverLabels[key]!;
    const constraintError = driverConstraintFailure(key, applicationCategory, drivers);
    const resultValue = adjustedDrivers ? (percentDriver(key) ? adjustedDrivers[key] * 100 : adjustedDrivers[key]) : null;
    if (!adjustableDriverKeys.includes(key)) {
      return <td className="driver-fixed-period-value" colSpan={2}>
        <input
          type="number"
          min={key === "investment" || key === "subsidy" ? 0 : undefined}
          aria-label={`${info.label} 固定値`}
          aria-invalid={constraintError ? "true" : undefined}
          step={info.step}
          value={driverDirectDisplayValue(key)}
          placeholder="未設定"
          onChange={(event) => updateDriver(key, event.target.value === "" ? null : percentDriver(key) ? Number(event.target.value) / 100 : Number(event.target.value))}
        />
        {resultValue !== null && <small className="adjusted-value">最適化結果 {number(resultValue, 2)}</small>}
        {constraintError && <small className="field-error" role="alert">{constraintError}</small>}
      </td>;
    }
    return <td className="driver-period-range" colSpan={2}>
      <div className="driver-period-range-grid">
        <input aria-label={`${info.label} 許容下限`} type="number" step={info.step} value={driverRangeDisplayValue(key, 0)} placeholder="未設定" onChange={(event) => updateDriverRange(key, 0, event.target.value === "" ? null : Number(event.target.value))} />
        <input aria-label={`${info.label} 許容上限`} type="number" step={info.step} value={driverRangeDisplayValue(key, 1)} placeholder="未設定" onChange={(event) => updateDriverRange(key, 1, event.target.value === "" ? null : Number(event.target.value))} />
        {resultValue !== null && <small className="adjusted-value">結果 {number(resultValue, 2)}</small>}
      </div>
    </td>;
  }

  function renderFixedDriverCells(key: keyof Drivers) {
    const info = driverLabels[key]!;
    const constraintError = driverConstraintFailure(key, applicationCategory, drivers);
    return <td className="driver-fixed-common-value" colSpan={4}>
      <input
        type="number"
        aria-label={`${info.label} 固定値`}
        aria-invalid={constraintError ? "true" : undefined}
        step={info.step}
        value={driverDirectDisplayValue(key)}
        placeholder="未設定"
        onChange={(event) => updateDriver(key, event.target.value === "" ? null : percentDriver(key) ? Number(event.target.value) / 100 : Number(event.target.value))}
      />
      {constraintError && <small className="field-error" role="alert">{constraintError}</small>}
    </td>;
  }

  async function solve(
    rangeOverride?: Record<keyof Drivers, [number, number]>,
    driverOverride?: Drivers,
  ) {
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
    setSelectedAdjustmentSuggestions({});
    setSolveNote("計算中…");
    // Let React paint the busy state before the synchronous optimizer starts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const optimizationDrivers = driverOverride ?? drivers;
      const planTransform = (candidate: YearPlan[]) => applyForecastOverrides(candidate, forecastOverrides, futureInputBasis, optimizationDrivers);
      const result = runPlanningOptimization({
        drivers: optimizationDrivers,
        historicalPlan,
        timeline,
        optimizationTargets,
        driverRanges: rangeOverride ?? driverRanges,
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
          ? `固定入力と現在の許容範囲を守ると設定した目標を同時達成できません。目標違反が最小になる決定論的な最接近案を表示しています（未達${result.failed.length}件、総合目的関数${scoreDrop.toFixed(0)}%改善）。下の「未達成項目と修正案」を確認してください。`
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
          <p className="subtitle">過去実績と目標値を入力し、補助事業＋ベース事業＝全社 の将来PLをシミュレーションします。</p>
        </div>
      </header>

      <nav className="tabs" aria-label="画面切替">
        {([
          ["history", "① 過去データ入力"], ["targets", "② 15指標・目標"], ["future", "③ 将来データ入力"], ["pl", "④ 年度別PL"], ["summary", "⑤ 診断"],
        ] as [View, string][]).map(([key, label]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => goToView(key)}>{label}</button>
        ))}
        <span className="tab-group-separator" aria-hidden="true">|</span>
        <button className={view === "logic" ? "active" : ""} onClick={() => goToView("logic")}>数式・ロジック</button>
        <span className="tab-group-separator" aria-hidden="true">|</span>
        <button className={view === "io" ? "active" : ""} onClick={() => goToView("io")}>データ入出力</button>
      </nav>

      {loadNotice && <aside className="load-success-notice" role="status" aria-live="polite">
        <span className="load-success-icon" aria-hidden="true">✓</span>
        <span><strong>読み込み完了</strong><small>{loadNotice.message}</small></span>
        <button type="button" aria-label="読み込み完了通知を閉じる" onClick={() => setLoadNotice(null)}>×</button>
      </aside>}

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
          </div>
          <p className="data-io-status" aria-live="polite">{fileNote}</p>
          <article className="excel-mapping-panel" aria-label="マッピング定義によるExcel入出力">
            <div className="data-io-panel-heading">
              <p className="card-kicker">MAPPING-DRIVEN EXCEL I/O</p>
              <h3>任意形式のExcelと入出力する</h3>
              <small>マッピング定義書に記載したセルだけを読み書きします。出力は元Excelを上書きせず、書式・数式・非対象セルを保持した別ファイルです。</small>
            </div>
            <div className="excel-mapping-steps">
              <section>
                <span className="step-number">1</span>
                <div><strong>マッピング定義書</strong><small>{excelMappingFileName || "JSONを選択"}</small></div>
                <label className="proposal-import-button">定義書を選択<input type="file" accept=".json,application/json" onChange={(event) => { void loadExcelMappingDefinition(event.target.files?.[0]); event.target.value = ""; }} /></label>
              </section>
              <section>
                <span className="step-number">2</span>
                <div><strong>対象Excel</strong><small>{mappedExcelFileName || ".xlsx / .xlsmを選択"}</small></div>
                <label className="proposal-import-button">Excelを選択<input type="file" accept=".xlsx,.xlsm" onChange={(event) => { void loadMappedExcel(event.target.files?.[0]); event.target.value = ""; }} /></label>
              </section>
              <section>
                <span className="step-number">3</span>
                <div><strong>確認して実行</strong><small>取込は差分確認後に反映</small></div>
                <div className="excel-mapping-actions">
                  <button type="button" onClick={inspectMappedExcelImport}>取込内容を確認</button>
                  <button type="button" onClick={exportMappedExcel}>別Excelとして出力</button>
                </div>
              </section>
            </div>
            <div className="excel-mapping-resources">
              <span>Copilotへ対象Excelと一緒に渡す資料</span>
              <button type="button" onClick={() => { void copyExcelMappingCopilotPrompt(); }}>
                {copilotPromptCopied ? "コピー済み" : "Copilot指示をコピー"}
              </button>
              <button type="button" onClick={downloadExcelMappingManual}>定義書作成マニュアル</button>
              <button type="button" onClick={downloadExcelMappingExample}>JSONサンプル</button>
            </div>
            {excelMappingPreview.length > 0 && (
              <div className="excel-mapping-preview">
                <div className="excel-mapping-preview-heading">
                  <strong>処理内容</strong>
                  <span>対象 {excelMappingPreview.length}件／エラー {excelMappingPreview.filter((item) => item.status === "error").length}件</span>
                  {excelMappingPreviewMode === "import" && <button
                      type="button"
                      disabled={!excelMappingPreview.some((item) => item.status === "ready") || excelMappingPreview.some((item) => item.status === "error")}
                      onClick={applyMappedExcelImport}
                    >
                      確認した値を反映
                    </button>}
                </div>
                <div className="wide-table"><table><thead><tr><th>シミュレーター項目</th><th>Excelセル</th><th>Excel値</th><th>反映値</th><th>状態</th></tr></thead><tbody>
                  {excelMappingPreview.map((item) => <tr className={`mapping-${item.status}`} key={`${item.bindingId}-${item.target}`}><th>{item.targetLabel}<small>{item.target}</small></th><td>{item.sheet}!{item.cell}</td><td>{item.rawValue === null ? "空欄" : String(item.rawValue)}</td><td>{item.value === null ? "—" : number(item.value, 2)}</td><td><strong>{item.status === "ready" ? "反映可能" : item.status === "empty" ? "変更なし" : item.status === "warning" ? "要確認" : "エラー"}</strong><small>{item.message}</small></td></tr>)}
                </tbody></table></div>
              </div>
            )}
            <p className="excel-mapping-status" aria-live="polite">{excelMappingNote}</p>
          </article>
          <article className="sample-library-panel" aria-label="確認用サンプル">
            <div className="data-io-panel-heading"><p className="card-kicker">SAMPLE LIBRARY</p><h3>確認用サンプルを読み込む</h3><small>入力済みデータがある場合は、置換前に確認します。</small></div>
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
                <button onClick={loadMultipleUnmetSample}>複数目標未達ケース（3指標）</button>
              </section>
            </div>
          </article>
        </section>
      )}

      {view === "summary" && (
        <section className="page-grid summary-grid">
          <ProjectDepreciationInputNotice items={missingProjectDepreciation} context="診断" />
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
          <div className="section-intro"><div><h2>過去3期の実績を入力</h2></div><p>まずB/S、会社全体PL、補助事業PLの過去3期を入力します。</p></div>
          <p id="grid-operation-status" className="grid-operation-status" aria-live="polite">セルを選択して、Excelから複数セルをそのまま貼り付けできます。空欄は未設定、0は明示的なゼロとして区別して保存します。直前の変更はCtrl＋Zで戻せます。</p>
          <article className="panel application-category-panel">
            <div className="panel-heading"><div><h2>申請区分・制度前提</h2></div><span className={`pill ${applicationCategory ? "green" : ""}`}>{applicationCategory ? "選択済み" : "必須選択"}</span></div>
            <div className="application-category-control">
              <div className="application-category-copy"><strong>申請区分</strong><small>選択した区分に応じて、制度上の投資額・賃上げ率を自動設定します。</small></div>
              <select aria-label="申請区分" required value={applicationCategory} onChange={(event) => { clearAdjustment(); setApplicationCategory(event.target.value as ApplicationCategory); }}><option value="">選択してください</option>{Object.entries(applicationCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
            {statutoryRequirements ? <div className="benchmark-note statutory-summary"><strong>自動設定される制度条件</strong><span>補助事業投資額 {statutoryRequirements.investmentMinimum}億円以上</span><span>補助事業1人当たり給与支給総額の年平均上昇率 {statutoryRequirements.projectPayCagrMinimum.toFixed(1)}%以上</span><span>基準年度の1人当たり給与支給総額は最新決算期以上</span><span>申請補助金額は50億円以下かつ投資額の1/3以下</span></div> : <p className="default-note">申請区分を選択するまで、制度上の必須条件は確定しません。</p>}
          </article>
          <article className="panel">
            <div className="panel-heading"><div><h2>申請書の年度設定</h2></div><span className="pill">過去3期＋将来{timeline.baseYear + 3 - timeline.latestYear}期</span></div>
            <div className="driver-grid timeline-grid">
              <label className="fixed"><span>最新決算期の年度<small>この年度を含めて過去3期を入力</small></span><input type="number" step="1" value={timeline.latestYear} onChange={(event) => updateTimeline({ latestYear: Number(event.target.value) })} /></label>
              <label className="fixed"><span>補助事業完了年度（基準年）<small>最新決算期の翌年～6年後</small></span><input type="number" min={timeline.latestYear + 1} max={timeline.latestYear + 6} step="1" value={timeline.baseYear} onChange={(event) => updateTimeline({ baseYear: Number(event.target.value) })} /></label>
            </div>
            <p className="footnote">入力範囲：{timeline.latestYear - 2}年度（前々期）～{timeline.baseYear + 3}年度（事業化報告3年目）。第6次様式の最大枠は、過去3期＋将来9期です。</p>
          </article>
          <article className="panel table-panel">
            <div className="panel-heading"><div><h2>1-1～1-25 貸借対照表等（過去3期）</h2></div><span className="pill green">公式番号に準拠</span></div>
            <div className="balance-sheet-display-options">
              <label>
                <input type="checkbox" checked={omitSimulationUnusedBalanceSheet} onChange={(event) => setOmitSimulationUnusedBalanceSheet(event.target.checked)} />
                <span>シミュレーションに使わないB/S項目を省略する</span>
              </label>
              <small>{omitSimulationUnusedBalanceSheet ? "過去の投資水準として使用する1-24だけを表示しています。入力済みのB/S値は保持されます。" : "第6次様式に沿ってB/S全項目を表示しています。"}</small>
            </div>
            <BalanceSheetEditor balanceSheets={balanceSheets} historical={historicalPlan} inputValues={inputValues} omitUnused={omitSimulationUnusedBalanceSheet} onChange={updateBalanceSheet} />
            <p className="footnote">{omitSimulationUnusedBalanceSheet ? "シミュレーションは1-24だけで実行できます。第6次申請書・提案書を完成させる場合は、チェックを外してB/S全項目を入力してください。" : "B/S残高の1-1～1-23・1-25と、過去実績の1-24を入力します。将来の1-24 新規設備投資による支出は「将来データ入力」の冒頭へ移しました。金額単位は億円です。"}</p>
          </article>
          <article className="panel formula-panel">
            <h2>B/SとP/Lの連動方針</h2>
            <code>設備投資 → 固定資産 → 減価償却費（P/L）　／　借入金 → 支払利息 → 経常利益（P/L）</code>
            <p>実務上は連動しますが、第6次の公式Excel自体はB/S残高から減価償却費や支払利息を自動算定していません。公式上の直接参照は主に、P/LのEBITDAを使う1-25 EBITDA有利子負債倍率です。本モデルでも、過去B/Sを入力しただけで手入力P/Lを上書きしません。将来の減価償却費・支払利息まで自動連動させるには、次段階で「固定資産台帳」と「借入返済表」を年度別に設けます。</p>
          </article>
          <article className="panel table-panel"><div className="panel-heading"><div><h2>会社全体PL・補助事業PL（過去3期）</h2></div><span className="pill green">必須手入力</span></div><HistoricalInputsEditor historical={historicalPlan} inputValues={inputValues} onHistoricalCompanyChange={updateHistoricalCompanyOfficial} onHistoricalProjectChange={updateHistoricalProjectOfficial} /></article>
          <div className="workflow-actions"><span>過去実績を入力できたら、次に現実的な将来水準を設定します。</span><button className="solve-button" onClick={() => goToView("targets")}>15指標・目標へ →</button></div>
        </section>
      )}

      {view === "future" && (
        <section className="content-stack">
          <div className="section-intro"><div><h2>自動予測を確認し、必要なセルだけ上書き</h2></div><p>青枠の空欄には原則として自動予測値を表示します。ただし、P2-4・P2-14の減価償却費は年度別の必須入力で、空欄は「未入力」として扱います。</p></div>
          <p id="grid-operation-status" className="grid-operation-status" aria-live="polite">セルを選択して、Excelから複数セルをそのまま貼り付けできます。直前の変更はCtrl＋Zで戻せます。</p>
          <article className="panel table-panel"><div className="panel-heading"><div><h2>1-24 新規設備投資による支出（過去3期参照 → 将来計画）</h2></div><span className="pill green">{futureCapex.some((row) => hasInputValue(inputValues, inputKey.futureCapex(row.year))) ? `入力合計 ${number(futureCapex.reduce((sum, row) => sum + row.value, 0), 2)} 億円` : "年度別計画 未入力"}</span></div><FutureCapexEditor balanceSheets={balanceSheets} historical={historicalPlan} futureCapex={futureCapex} inputValues={inputValues} onChange={updateFutureCapex} /><p className="footnote">左側の過去3期は参照表示です。年度別設備投資は補助事業投資額から自動配分しません。事業計画に基づく各年度の金額を入力してください。入力値は設備投資に関する診断へ反映します。</p></article>
          <article className="panel table-panel"><div className="panel-heading"><div><h2>補助事業期間 → 事業化報告3年目</h2></div><span className="pill blue-pill">P2-4・P2-14は必須入力</span></div><div className="future-basis-setting"><div><strong>将来PLの入力方式</strong><small>公式様式を直接作るか、事業別の詳細PLを積み上げるかを選びます</small></div><div className="mode-switch" role="group" aria-label="将来PLの入力方式"><button type="button" className={futureInputBasis === "company" ? "active" : ""} aria-pressed={futureInputBasis === "company"} onClick={() => changeFutureInputBasis("company")}>全社PLを入力</button><button type="button" className={futureInputBasis === "other" ? "active" : ""} aria-pressed={futureInputBasis === "other"} onClick={() => changeFutureInputBasis("other")}>ベース事業PLを入力</button></div></div>{missingAccountingAssumptions.length ? <p className="default-note" role="alert">②15指標・目標で「会計内訳・利益前提」を設定してください。給与・賞与、役員報酬・賞与、研究開発費、営業外損益、特別損益、税率が未設定のまま将来PLを補完することはありません。減価償却費は③将来データ入力でP2-4とP2-14を直接入力します。</p> : <FutureInputsEditor historical={historicalPlan} autoPlan={autoPlan} effectivePlan={sourcePlan} overrides={forecastOverrides} inputValues={inputValues} futureInputBasis={futureInputBasis} drivers={calculationDrivers} onForecastChange={updateForecastOverride} />}<p className="footnote">「全社PLを入力」は、会社全体2-1～2-36と補助事業7-1～7-20・内部管理P2-Xを入力して公式Excelを完成させる方式です。「ベース事業PLを入力」は、補助事業とベース事業を同じ詳細項目で入力し、合計から会社全体PLを作る方式です。</p></article>
          <div className="workflow-actions"><div><span>上書きしたセルを固定して再最適化できます。再最適化後もこの画面に留まります。</span>{adjustedPlan && <p className="solve-note">{solveNote}</p>}</div><div className="target-action-buttons"><button className="reset-button" onClick={() => goToView("targets")}>← 15指標・目標へ戻る</button><button className="solve-button" disabled={isSolving} aria-busy={isSolving} onClick={() => void solve()}>{isSolving ? "計算中…" : "上書き内容を反映して再最適化"}</button><button className="reset-button" onClick={() => goToView("pl")}>年度別PLへ →</button></div></div>
        </section>
      )}

      {view === "pl" && (
        <section className="content-stack">
          <div className="section-intro"><div><h2>第6次Excelの項目番号・並び順で表示</h2></div><p>会社全体は2-1～2-36、補助事業は7-1～7-20に合わせています。2-21以降は給与・付加価値・人数・EBITDAのP/L関連計算項目です。</p></div>
          <ProjectDepreciationInputNotice items={missingProjectDepreciation} context="年度別PL" />
          {adjustedPlan && <div className="comparison-banner"><strong>入力値は保存されています。</strong><span>各セルを「入力値 → 調整案」で表示しています。</span></div>}
          <CompanyTable plan={plan} sourcePlan={adjustedPlan ? sourcePlan : undefined} />
          <OfficialProjectTable plan={plan} sourcePlan={adjustedPlan ? sourcePlan : undefined} drivers={calculationDrivers} missingKeys={missingProjectDepreciationKeys} />
          <PlTable title="ベース事業PL（モデル内訳・申請書外）" plan={plan} sourcePlan={adjustedPlan ? sourcePlan : undefined} segment="other" />
          <div className="workflow-actions"><span>年度別PLを確認したら、診断画面で計画推移と妥当性を確認します。</span><div className="target-action-buttons"><button className="reset-button" onClick={() => goToView("future")}>← 将来データ入力に戻る</button><button className="solve-button" onClick={() => goToView("summary")}>診断タブに進む →</button></div></div>
        </section>
      )}

      {view === "targets" && (
        <section className="content-stack">
          <div className="section-intro"><div><h2>目標・制度条件・競合管理</h2></div><p>事業を「補助事業」と「ベース事業」に分け、それぞれに目標数値・水準を設定します。計画値・判定・自動調整には第6次定義を使用し、複数目標が矛盾する場合は未達と修正候補を明示します。</p></div>
          <article className="panel">
            <div className="panel-heading"><div><h2>将来予測・調整水準</h2><span className={`pill ${forecastSettingsReady ? "green" : ""}`}>{forecastSettingsReady ? "設定済み" : "未設定"}</span></div><button className="default-button" onClick={confirmAndApplyHistoricalDefaults}>{forecastSettingsStarted ? "過去3期から再設定" : "過去3期からデフォルト設定"}</button></div>
            {missingAccountingAssumptions.length > 0 && <p className="default-note" role="alert">会計内訳・利益前提が未設定です。補助事業・ベース事業の各6項目と共通の実効税率を設定するまで、③将来データ入力では自動予測を表示しません。</p>}
            <div className="wide-table spreadsheet-grid driver-target-table"><table><thead><tr><th rowSpan={2}>調整条件<small>C-1～（Condition）</small></th>{historicalPlan.slice(1).map((row) => <th rowSpan={2} className="driver-reference-heading" key={row.year}>{row.year}<small>過去実績・参考値<br />{YEAR_ROLE_LABELS[row.role]}</small></th>)}<th rowSpan={2} className="driver-statutory-heading">制度上の必須条件<small>編集不可</small></th><th colSpan={2} className="driver-period-heading">設備導入期間<small>最新決算期 → 基準年</small></th><th colSpan={2} className="driver-period-heading">基準年後<small>基準年 → 事業化報告3年目</small></th></tr><tr><th className="driver-bound-heading">下限</th><th className="driver-bound-heading">上限</th><th className="driver-bound-heading">下限</th><th className="driver-bound-heading">上限</th></tr></thead><tbody>
              {driverComparisonGroups.flatMap((group) => [
                <tr className="driver-group-heading" key={`group-${group.label}`}><th><strong>{group.label}</strong></th><td aria-hidden="true" colSpan={7}></td></tr>,
                ...group.rows.map((comparisonRow, rowIndex) => {
                  const keys = [comparisonRow.equipment, comparisonRow.postBase, comparisonRow.fixed].filter((key): key is keyof Drivers => Boolean(key));
                  const referenceKey = keys[0];
                  const info = driverLabels[referenceKey]!;
                  const tablePresentation = driverTablePresentation(referenceKey, info.label);
                  const history = historicalDriverSeries[referenceKey];
                  const codes = keys.map((key) => driverItemCodes[key]).filter(Boolean).join("／");
                  const requirementLabels = [...new Set(keys.map((key) => driverRequirementLabel(key, applicationCategory, drivers.investment)).filter((label) => label !== "—"))];
                  const constraintError = keys.some((key) => driverConstraintFailure(key, applicationCategory, drivers));
                  const adjustable = keys.some((key) => adjustableDriverKeys.includes(key));
                  return <tr className={`${adjustable ? "driver-adjustable" : "driver-fixed"} ${constraintError ? "driver-validation-error" : ""}`} key={`${group.label}-${rowIndex}`}>
                    <th><span className="driver-item-code">{codes}:</span> {tablePresentation.label}{tablePresentation.note && <small className="driver-period-note">{tablePresentation.note}</small>}<small>{info.unit}／{history.referenceLevels ? "各期率＋前年差改善pt" : history.mode === "change" ? "前年差・前年比" : history.mode === "level" ? "各期の水準" : "過去比較なし"}</small></th>
                    {history.values.slice(1).map((value, referenceIndex) => {
                      const index = referenceIndex + 1;
                      const referenceLevel = history.referenceLevels?.[index];
                      if (referenceLevel !== undefined && Number.isFinite(referenceLevel)) {
                        const improvement = Number.isFinite(value) ? value * 100 : undefined;
                        const improvementLabel = improvement === undefined ? "—" : improvement > 0 ? `+${number(improvement, 2)}pt 改善` : improvement < 0 ? `${number(improvement, 2)}pt（悪化）` : "+0.00pt 改善";
                        return <td className="driver-history driver-rate-history" key={`${referenceKey}-${historicalPlan[index].year}`}><strong>{improvementLabel}</strong><small>当期率 {number(referenceLevel * 100, 2)}%</small></td>;
                      }
                      return <td className="driver-history" key={`${referenceKey}-${historicalPlan[index].year}`}>{Number.isFinite(value) ? <><strong>{number(percentDriver(referenceKey) ? value * 100 : value, 2)}</strong><small>{history.mode === "change" ? `${historicalPlan[index - 1]?.year}→${historicalPlan[index].year}` : info.unit}</small></> : "—"}</td>;
                    })}
                    <td className="statutory-condition"><strong>{requirementLabels.join("／") || "—"}</strong></td>
                    {comparisonRow.fixed ? renderFixedDriverCells(comparisonRow.fixed) : <>{renderDriverPeriodCells(comparisonRow.equipment)}{renderDriverPeriodCells(comparisonRow.postBase)}</>}
                  </tr>;
                }),
              ])}
            </tbody></table></div>
            <p className="footnote">前期・最新決算期は、計画値ではなく過去実績の参考値です。可変条件は許容下限・上限の中点を最適化前の計画値とし、表では独立した「計画初期値」欄を設けません。固定条件は下限・上限を持たないため、期間内の2列を結合した入力欄で表示します。表示されている下限・上限がそのまま最適化の探索範囲であり、別の非表示上限は設けません。制度条件や計算上成立しない値は別途バリデーションします。減価償却費は調整水準では生成せず、③将来データ入力のP2-4・P2-14で年度別に入力します。</p>
            <div className="benchmark-note"><strong>基準年後のデフォルト</strong><span>売上高成長率 22%［15～30%］</span><span>補助事業1人当たり給与支給総額の年平均上昇率 7%［5～10%］</span><span>常時使用する従業員数（就業時間換算）の成長率 4%［0～8%］</span><span>原価率改善 1.5pt［0～2pt］</span><span>その他販管費率 過去平均-1.5pt［過去平均-4～+1pt］</span><span>役員1人当たり給与支給総額の年平均上昇率は過去3期の役員1人当たり給与から推計（計算不能時のみ7%［5～10%］）</span><span>ベース事業はシナジーを見込み、基準年後の売上成長率を設備導入期間＋2.0pt、原価率改善・給与・人員成長率を＋0.5pt</span><a href="https://chukentou-seichotoushi-hojo.jp/assets/documents/common/5ji_median.pdf" target="_blank" rel="noreferrer">第5次公募・採択者中央値PDF ↗</a></div>
            {defaultNote && <p className="default-note">{defaultNote}</p>}
          </article>
          <article className="panel table-panel">
            <div className="metric-group-controls">
              {metricLinkGroups.map((group) => {
                const basis = metricGroupBases[group.key];
                return <label className="metric-group-control" key={group.key}><span><strong>{group.label}</strong><small>{group.relation}</small></span><select aria-label={`${group.label}の目標設定方法`} value={basis} onChange={(event) => { clearAdjustment(); setMetricGroupBases((current) => ({ ...current, [group.key]: event.target.value as MetricGroupBasis })); }}><option value="rate">{group.rateLabel}に目標設定（{group.amountLabel}は自動算出）</option><option value="amount">{group.amountLabel}に目標設定（{group.rateLabel}は自動算出）</option><option value="both">両方に目標設定（2指標を同時に最適化）</option></select></label>;
              })}
            </div>
            <div className="targets-table-wrap"><table className="targets-table"><thead><tr><th>No.</th><th>指標・第6次定義</th>{historicalPlan.slice(1).map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}<th>第5次公式参考値<small>採択者／申請者</small></th><th>投資計画 計画値<small>{adjustedPlan ? "入力 → 調整案" : "計算結果"}</small></th><th>制度上の必須条件<small>編集不可</small></th><th>目標値</th><th>優先度</th><th>判定</th></tr></thead><tbody>
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
                return <tr className={rowClass} key={definition.key}><td>{index + 1}</td><td><strong>{definition.label}</strong><small className="metric-definition">第6次定義：{definition.round6Formula}</small><small>{definition.sourceRound}</small><span className={`metric-role-badge ${basisRole}`}>{roleLabel}</span></td>{history.values.map((value, historyIndex) => <td className="historical-metric" key={`${definition.key}-${historicalPlan[historyIndex].year}`}>{Number.isFinite(value) ? <><strong>{number(value)}</strong><small>{history.mode === "change" ? `${historicalPlan[historyIndex - 1]?.year}→${historicalPlan[historyIndex].year}（1年間）／${definition.unit}` : definition.unit}</small>{scaleDependent && history.mode === "change" && <small className="period-equivalent">同額ペースの{targetComparisonYears}年単純換算：{number(value * targetComparisonYears)} {definition.unit}</small>}</> : "—"}</td>).slice(1)}<Round5BenchmarkCell metricKey={definition.key} unit={definition.unit} /><td className="numeric">{adjustedPlan && <small className="before-metric">{number(sourceActual[definition.key])} →</small>}{number(actual[definition.key])} {definition.unit}</td><td className="statutory-condition"><strong>{metricRequirementLabel(definition.key, applicationCategory)}</strong></td><td><input disabled={basisRole === "result"} aria-label={`${definition.label}目標値`} type="number" step="0.1" value={getInputValue(inputValues, inputKey.target(definition.key, "value"))} placeholder={scaleDependent ? "デフォルト設定後に算出" : "未設定"} onChange={(event) => updateTargetBound(definition.key, "value", event.target.value === "" ? null : Number(event.target.value))} /></td><td><input disabled={basisRole === "result"} type="number" min="1" max="10" step="1" value={integerPriority(target.weight)} onChange={(event) => updateTarget(definition.key, { weight: integerPriority(Number(event.target.value)) })} /></td><td className="target-judgement"><span className={`result-badge ${basisRole === "result" || !targetSet || status.ok ? "ok" : "bad"}`}>{basisRole === "result" ? "自動算出" : !targetSet ? "未設定" : status.ok ? "目標達成" : "目標未達"}</span></td></tr>;
              })}
            </tbody></table></div>
            <p className="footnote round5-source-note">第5次公式参考値は、申請者全体と採択者の公表代表値です。原則は中央値ですが、「補助事業売上高／全社売上高」のみ平均値です。役員関連2指標は第5次に公表値がありません。<a href="https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/5ji_median.pdf" target="_blank" rel="noreferrer">第5次公式資料 ↗</a></p>
            <p className="footnote">目標値を入力した指標はすべて最適化対象となり、未入力の指標は診断表示だけに使います。上振れの現実性は「将来予測・調整水準」の許容下限・上限で管理するため、指標側の計画上限と扱い区分は設けません。「自動算出」の指標はPLから計算して確認する項目で、保存済みの目標値は切替時のため保持しますが現在の最適化には使いません。「両方に目標設定」では2指標を同時に評価し、調整水準を許容範囲内で最適化します。過去の成長率・増加額は各1年間、計画の増加額は基準年から事業化報告3年目までの{targetComparisonYears}年間です。金額指標の「単純換算」は過去1年間の増加額が同額で続く場合の比較用参考値であり、複利予測ではありません。14・15の役員関連2指標は第6次の評価対象外であり、計算結果の参考表示に限定します。ローカルベンチマークは外部で算出した点数の固定入力であり、目標判定・最適化・PL計算の対象外です。</p>
            <div className={`target-action-bar ${adjustedPlan && hardSummary.failed.length > 0 ? "target-action-warning" : ""}`}>
              <div>
                <strong>15指標の設定後に実行</strong>
                <small>目標値と優先度を確認してから、調整水準の許容範囲内でPLを目標へ近づけます。</small>
                <p className={`solve-note ${statutoryFailures.length ? "statutory-failure" : ""}`}>{statutoryFailures.length ? `制度条件：${statutoryFailures.join("／")}` : "制度上の必須条件を満たしています。"}</p>
                {solveNote !== "未実行" && <p className="solve-note">{solveNote}</p>}
                {adjustedPlan && hardSummary.failed.length > 0 && <p className="target-unmet-guidance" role="alert">
                  未達の指標があります。下の「<strong>未達成項目と修正案</strong>」で採用する案を選び、許容範囲を更新して再最適化してください。
                </p>}
              </div>
              <div className="target-action-buttons">
                <button className="solve-button" disabled={isSolving} aria-busy={isSolving} onClick={() => void solve()}>{isSolving ? "計算中…" : "設定した目標に近づける"}</button>
                {adjustedPlan && <button className="reset-button" onClick={clearAdjustment}>入力値表示に戻す</button>}
              </div>
            </div>
            {adjustedPlan && hardSummary.failed.length > 0 && <section className="unmet-target-panel" aria-label="未達成項目と修正案">
              <div className="unmet-target-heading">
                <div><strong>未達成項目と修正案</strong><small>採用する修正案を複数選択できます。適用すると許容範囲を更新し、そのまま再最適化します。</small></div>
                <button
                  className="apply-selected-suggestions"
                  type="button"
                  disabled={isSolving || !Object.values(selectedAdjustmentSuggestions).some(Boolean)}
                  aria-busy={isSolving}
                  onClick={() => { void applySelectedDriverRangeSuggestions(); }}
                >
                  {isSolving ? "再最適化中…" : "選択した修正案を適用して再最適化"}
                </button>
              </div>
              <div className="wide-table"><table className="unmet-target-table"><thead><tr><th>未達成項目</th><th>目標数値</th><th>最適化結果</th><th>修正案</th></tr></thead><tbody>
                {targetManagedMetrics.filter((definition) => {
                  const target = optimizationTargets[definition.key];
                  return target.policy === "hard" && !targetStatus(definition, actual[definition.key], target).ok;
                }).map((definition) => {
                  const suggestions = targetAdjustmentSuggestions[definition.key] ?? [];
                  return <tr key={definition.key}><th>{standaloneMetricLabel(definition)}<small>第6次定義：{definition.round6Formula}</small></th><td>{number(optimizationTargets[definition.key].value)} {definition.unit}</td><td><strong>{number(actual[definition.key])} {definition.unit}</strong></td><td>{suggestions.length ? <div className="unmet-target-suggestions">{suggestions.map((suggestion) => <label className="target-adjustment-suggestion" key={driverRangeSuggestionId(definition.key, suggestion)}><input type="checkbox" checked={Boolean(selectedAdjustmentSuggestions[driverRangeSuggestionId(definition.key, suggestion)])} onChange={(event) => toggleDriverRangeSuggestion(definition.key, suggestion, event.target.checked)} /><span>{suggestion.text}</span></label>)}</div> : <span className="no-effective-suggestion">現在の許容範囲では有効な拡張候補を特定できません。入力済み将来PLまたは目標値との整合を確認してください。</span>}</td></tr>;
                })}
              </tbody></table></div>
            </section>}
          </article>
          <div className="workflow-actions"><span>水準と15指標を確認したら、将来PLの自動予測をセル単位で確認・上書きします。</span><button className="solve-button" onClick={() => goToView("future")}>将来データ入力へ →</button></div>
        </section>
      )}

      {view === "logic" && (
        <section className="content-stack">
          <div className="section-intro"><div><p className="eyebrow">AUDIT TRAIL</p><h2>数式と調整ロジック</h2></div><p>Excel化するときも、この順序と依存関係をそのままシートに移します。</p></div>
          <div className="logic-flow">
            <div><span>01</span><strong>実績・根拠</strong><p>過去PL、顧客別数量、単価、能力、常時使用する従業員数、賃金表</p></div><i>→</i><div><span>02</span><strong>補助事業／ベース事業PL</strong><p>売上・原価・給与・減価償却・販管費を年度別生成</p></div><i>→</i><div><span>03</span><strong>全社合算</strong><p>二つの事業区分を同じ年度・単位で足し上げる</p></div><i>→</i><div><span>04</span><strong>15指標</strong><p>計画値を算出し、設定した目標値と照合</p></div>
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
            <code>設備導入期間の許容範囲 = 過去実績の単純平均 ± 2×標準偏差　／　最適化前の計画値 = 許容下限・上限の中点</code>
            <code>基準年後の補助事業売上成長率 = 22%［15～30%］（第5次採択者中央値22%/年を中心）</code>
            <code>補助事業1人当たり給与支給総額の年平均上昇率 = 7%［5～10%］（第5次採択者中央値7%/年、一般企業の第6次要件5%以上）</code>
            <code>基準年後の常時使用する従業員数（就業時間換算）の成長率 = 4%［0～8%］（過去採択統計の給与支給総額伸びと1人当たり給与支給総額伸びの差から補完）</code>
            <code>基準年後の原価率改善 = 1.5pt［0～2pt］（悪化は初期許容範囲に含めず、設備効果を控えめに見込む）</code>
            <code>基準年後・ベース事業の許容範囲の中心 = 前々期×20% + 前期×30% + 最新期×50%（水準項目）</code>
            <code>基準年後・ベース事業の許容範囲の中心 = 前期までの変化率×40% + 最新期までの変化率×60%（成長項目）</code>
            <code>補助事業売上高(t) = 最新決算期売上高 × (1 + 基準年までの成長率)^経過年数　［最新決算期→基準年］</code>
            <code>補助事業売上高(t) = 基準年売上高 × (1 + 報告期間の成長率)^基準年後年数　［基準年→事業化報告3年目］</code>
            <code>期間末原価率 = 期間開始時原価率 − 原価率改善ポイント（プラスは改善、マイナスは悪化）</code>
            <code>各年度原価率 = 期間開始時原価率と期間末原価率を、経過年数に応じて直線補間</code>
            <code>設備導入期間末のその他販管費率 = 最新決算期のその他販管費率 − 改善ポイント（プラスは改善、マイナスは悪化）</code>
            <code>事業化報告3年目のその他販管費率 = 基準年度のその他販管費率 − 基準年後の改善ポイント（途中年度は3年間で段階反映）</code>
            <p>許容下限・上限は、過去3期の最小・最大に変動幅の50%（最低1pt、率水準は最低2pt）を加え、技術的な上下限内に収めます。過去実績から決められない投資額・補助金額などは自動変更しません。減価償却費は投資額や耐用年数から作らず、③将来データ入力で売上原価内P2-4と販管費内P2-14を年度別に入力します。公式7-10は両項目の合計として自動計算します。</p>
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

const balanceSheetInputRows: { code: string; label: string; field: BalanceSheetField; indentLevel?: 1 | 2 | 3 }[] = [
  { code: "1-1", label: "資産総額", field: "assets" },
  { code: "1-2", label: "うち流動資産", field: "currentAssets", indentLevel: 1 },
  { code: "1-3", label: "うち現金及び預金", field: "cash", indentLevel: 2 },
  { code: "1-4", label: "うち固定資産", field: "fixedAssets", indentLevel: 1 },
  { code: "1-5", label: "うち有形固定資産", field: "tangibleAssets", indentLevel: 2 },
  { code: "1-6", label: "うち建物及び構築物", field: "buildings", indentLevel: 3 },
  { code: "1-7", label: "うち機械装置等", field: "machinery", indentLevel: 3 },
  { code: "1-8", label: "うち土地", field: "land", indentLevel: 3 },
  { code: "1-9", label: "うち無形固定資産", field: "intangibleAssets", indentLevel: 2 },
  { code: "1-10", label: "うちソフトウェア", field: "software", indentLevel: 3 },
  { code: "1-13", label: "負債総額", field: "liabilities", indentLevel: 1 },
  { code: "1-14", label: "うち流動負債", field: "currentLiabilities", indentLevel: 2 },
  { code: "1-15", label: "うち短期借入金", field: "shortTermDebt", indentLevel: 3 },
  { code: "1-16", label: "うち固定負債", field: "fixedLiabilities", indentLevel: 2 },
  { code: "1-17", label: "うち長期借入金", field: "longTermDebt", indentLevel: 3 },
  { code: "1-19", label: "純資産総額", field: "netAssets", indentLevel: 1 },
  { code: "1-20", label: "うち株主資本", field: "shareholderEquity", indentLevel: 2 },
  { code: "1-21", label: "うち資本金", field: "capital", indentLevel: 3 },
  { code: "1-24", label: "新規設備投資による支出", field: "capex" },
];

function BalanceSheetEditor({ balanceSheets, historical, inputValues, omitUnused, onChange }: { balanceSheets: BalanceSheetPlan[]; historical: YearPlan[]; inputValues: InputValues; omitUnused: boolean; onChange: (yearIndex: number, field: keyof BalanceSheetPlan, value: number | null) => void }) {
  const [omitCalculated, setOmitCalculated] = useState(false);
  const rows: { code: string; label: string; field?: BalanceSheetField; indentLevel?: 1 | 2 | 3; percent?: boolean; multiple?: boolean; value?: (row: BalanceSheetPlan, index: number) => number }[] = [
    ...balanceSheetInputRows.slice(0, 10),
    { code: "1-11", label: "その他資産（自動計算）", indentLevel: 1, value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).otherAssets },
    { code: "1-12", label: "負債及び純資産合計（自動計算）", value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).liabilitiesAndNetAssets },
    ...balanceSheetInputRows.slice(10, 15),
    { code: "1-18", label: "その他負債（自動計算）", indentLevel: 2, value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).otherLiabilities },
    ...balanceSheetInputRows.slice(15, 18),
    { code: "1-22", label: "その他純資産（自動計算）", indentLevel: 2, value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).otherNetAssets },
    { code: "1-23", label: "自己資本比率（自動計算）", percent: true, value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).equityRatio },
    balanceSheetInputRows[18],
    { code: "1-25", label: "EBITDA有利子負債倍率（自動計算）", multiple: true, value: (row, index) => balanceSheetDerived(row, companyEbitda(historical[index])).ebitdaDebtMultiple },
  ];
  const scopeRows = omitUnused ? rows.filter((item) => item.code === "1-24") : rows;
  const visibleRows = omitCalculated ? scopeRows.filter((item) => item.field) : scopeRows;
  return <>
    <div className="historical-table-actions"><button type="button" className="calculated-row-toggle" aria-pressed={omitCalculated} disabled={omitUnused} onClick={() => setOmitCalculated((current) => !current)}>{omitCalculated ? "自動計算項目を表示する" : "自動計算項目を省略する"}</button></div>
    <div className="wide-table balance-sheet-table spreadsheet-grid actuals-three-year-table"><table><thead><tr><th>第6次様式項目（億円）</th>{balanceSheets.map((row, index) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[historical[index].role]}</small></th>)}</tr></thead><tbody>{visibleRows.map((item) => <tr className={!item.field ? "emphasis" : ""} key={item.code}><th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} />{item.percent && <small>%</small>}{item.multiple && <small>倍</small>}</th>{balanceSheets.map((row, index) => <td key={row.year}>{item.field ? <input type="number" step="0.01" value={getInputValue(inputValues, inputKey.balanceSheet(row.year, item.field))} placeholder="未入力" onChange={(event) => onChange(index, item.field!, event.target.value === "" ? null : Number(event.target.value))} /> : <strong>{number(item.value!(row, index), 2)}</strong>}</td>)}</tr>)}</tbody></table></div>
  </>;
}

function FutureCapexEditor({ balanceSheets, historical, futureCapex, inputValues, onChange }: { balanceSheets: BalanceSheetPlan[]; historical: YearPlan[]; futureCapex: { year: number; value: number }[]; inputValues: InputValues; onChange: (yearIndex: number, value: number | null) => void }) {
  return <div className="wide-table spreadsheet-grid future-capex-table"><table><thead><tr><th>第6次様式項目（億円）</th>{balanceSheets.map((row, index) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[historical[index].role]}・参照</small></th>)}{futureCapex.map((row) => <th className="forecast-heading" key={row.year}>{row.year}<small>将来計画・入力</small></th>)}</tr></thead><tbody><tr><th>1-24 新規設備投資による支出</th>{balanceSheets.map((row) => <td className="historical-reference" key={row.year}><strong>{hasInputValue(inputValues, inputKey.balanceSheet(row.year, "capex")) ? number(row.capex, 2) : "—"}</strong></td>)}{futureCapex.map((row, index) => <td key={row.year}><input type="number" step="0.01" value={getInputValue(inputValues, inputKey.futureCapex(row.year))} placeholder="未入力" onChange={(event) => onChange(index, event.target.value === "" ? null : Number(event.target.value))} /></td>)}</tr></tbody></table></div>;
}

function companyEbitda(row: YearPlan) {
  const company = total(row.project, row.other);
  return operatingProfit(company) + company.depreciation;
}

function ManualEditor({ plan, onChange }: { plan: YearPlan[]; onChange: (yearIndex: number, segment: SegmentKey, field: keyof SegmentPlan, value: number) => void }) {
  return <div className="manual-sections">{(["project", "other"] as SegmentKey[]).map((segment) => <div key={segment}><h3>{segment === "project" ? "補助事業PL" : "ベース事業PL"}</h3><div className="wide-table"><table><thead><tr><th>{segment === "other" ? "内部管理番号・項目" : "モデル入力項目"}</th>{plan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{plFields.map((field) => <tr key={field.key}><th>{segment === "other" ? `${field.modelCode} ` : ""}{field.label}<small>{field.unit}</small></th>{plan.map((row, index) => <td key={row.year}><input type="number" step="0.1" value={row[segment][field.key]} onChange={(event) => onChange(index, segment, field.key, Number(event.target.value))} /></td>)}</tr>)}</tbody></table></div></div>)}</div>;
}

type ProjectOfficialInputRow = { code: string; label: string; unit: string; digits?: number; indentLevel?: 1 | 2; get: (segment: SegmentPlan) => number; set: (segment: SegmentPlan, value: number) => Partial<SegmentPlan> };

const projectOfficialInputRows: ProjectOfficialInputRow[] = [
  { code: "7-1", label: "売上高", unit: "億円", get: (s) => s.sales, set: (_s, v) => ({ sales: v }) },
  { code: "7-4", label: "売上総利益", unit: "億円", get: (s) => s.sales - s.cogs, set: (s, v) => ({ cogs: s.sales - v }) },
  { code: "7-6", label: "営業利益", unit: "億円", get: operatingProfit, set: (s, v) => ({ otherSga: s.sales - s.cogs - s.employeePay - s.officerPay - sgaDepreciation(s) - researchDevelopment(s) - v }) },
  { code: "7-8", label: "従業員給与支給総額", unit: "億円", get: (s) => s.employeePay, set: (s, v) => { if (s.employeeSalary === undefined && s.employeeBonus === undefined) return { employeePay: v }; const salary = s.employeePay ? v * employeeSalary(s) / s.employeePay : v; return { employeePay: v, employeeSalary: salary, employeeBonus: v - salary }; } },
  { code: "7-9", label: "役員給与支給総額", unit: "億円", get: (s) => s.officerPay, set: (s, v) => { if (s.officerCompensation === undefined && s.officerBonus === undefined) return { officerPay: v }; const compensation = s.officerPay ? v * officerCompensation(s) / s.officerPay : v; return { officerPay: v, officerCompensation: compensation, officerBonus: v - compensation }; } },
  { code: "P2-4", label: "売上原価に含まれる減価償却費", unit: "億円", indentLevel: 1, get: cogsDepreciation, set: (s, v) => ({ cogsDepreciation: v, depreciation: v + sgaDepreciation(s) }) },
  { code: "P2-14", label: "販管費に含まれる減価償却費", unit: "億円", indentLevel: 1, get: sgaDepreciation, set: (s, v) => ({ sgaDepreciation: v, depreciation: cogsDepreciation(s) + v }) },
  { code: "7-13", label: "常時使用する従業員数（就業時間換算）", unit: "人", digits: 0, get: (s) => s.headcount, set: (_s, v) => ({ headcount: Math.max(0, Math.round(v)) }) },
  { code: "7-14", label: "役員数", unit: "人", digits: 0, get: (s) => s.officerCount, set: (_s, v) => ({ officerCount: Math.max(0, Math.round(v)) }) },
];

type ProjectOfficialDisplayRow = {
  code: string;
  label: string;
  unit: string;
  digits?: number;
  indentLevel?: 1 | 2;
  input?: ProjectOfficialInputRow;
  fixed?: boolean;
  get: (rows: YearPlan[], index: number, drivers: Drivers) => number | undefined;
};

const projectInputByCode = new Map(projectOfficialInputRows.map((item) => [item.code, item]));
const projectPayPerEmployee = (segment: SegmentPlan) => segment.headcount ? segment.employeePay / segment.headcount : 0;
const projectPayPerOfficer = (segment: SegmentPlan) => segment.officerCount ? segment.officerPay / segment.officerCount : 0;

const projectOfficialDisplayRows: ProjectOfficialDisplayRow[] = [
  { code: "7-1", label: "売上高", unit: "億円", input: projectInputByCode.get("7-1"), get: (rows, index) => rows[index].project.sales },
  { code: "7-2", label: "売上高成長率", unit: "%", indentLevel: 1, get: (rows, index) => growth(rows[index].project.sales, index ? rows[index - 1].project.sales : undefined) },
  { code: "7-3", label: "全社売上高に占める補助事業売上高の割合", unit: "%", indentLevel: 1, get: (rows, index) => rate(rows[index].project.sales, companySegment(rows, index).sales) },
  { code: "P2-4", label: "売上原価に含まれる減価償却費", unit: "億円", indentLevel: 1, input: projectInputByCode.get("P2-4"), get: (rows, index) => cogsDepreciation(rows[index].project) },
  { code: "7-4", label: "売上総利益", unit: "億円", input: projectInputByCode.get("7-4"), get: (rows, index) => rows[index].project.sales - rows[index].project.cogs },
  { code: "7-5", label: "売上総利益率", unit: "%", indentLevel: 1, get: (rows, index) => rate(rows[index].project.sales - rows[index].project.cogs, rows[index].project.sales) },
  { code: "7-6", label: "営業利益", unit: "億円", input: projectInputByCode.get("7-6"), get: (rows, index) => operatingProfit(rows[index].project) },
  { code: "7-7", label: "営業利益率", unit: "%", indentLevel: 1, get: (rows, index) => rate(operatingProfit(rows[index].project), rows[index].project.sales) },
  { code: "7-8", label: "給与支給総額（常時使用する従業員）", unit: "億円", input: projectInputByCode.get("7-8"), get: (rows, index) => rows[index].project.employeePay },
  { code: "7-9", label: "給与支給総額（役員）", unit: "億円", input: projectInputByCode.get("7-9"), get: (rows, index) => rows[index].project.officerPay },
  { code: "P2-14", label: "販管費に含まれる減価償却費", unit: "億円", indentLevel: 1, input: projectInputByCode.get("P2-14"), get: (rows, index) => sgaDepreciation(rows[index].project) },
  { code: "7-10", label: "減価償却費（合計）", unit: "億円", get: (rows, index) => cogsDepreciation(rows[index].project) + sgaDepreciation(rows[index].project) },
  { code: "7-11", label: "付加価値額", unit: "億円", get: (rows, index) => valueAdded(rows[index].project) },
  { code: "7-12", label: "付加価値増加率", unit: "%", indentLevel: 1, get: (rows, index) => growth(valueAdded(rows[index].project), index ? valueAdded(rows[index - 1].project) : undefined) },
  { code: "7-13", label: "常時使用する従業員数（就業時間換算）", unit: "人", digits: 0, input: projectInputByCode.get("7-13"), get: (rows, index) => rows[index].project.headcount },
  { code: "7-14", label: "役員数", unit: "人", digits: 0, input: projectInputByCode.get("7-14"), get: (rows, index) => rows[index].project.officerCount },
  { code: "7-15", label: "従業員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => projectPayPerEmployee(rows[index].project) },
  { code: "7-16", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, get: (rows, index) => growth(projectPayPerEmployee(rows[index].project), index ? projectPayPerEmployee(rows[index - 1].project) : undefined) },
  { code: "7-17", label: "役員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => projectPayPerOfficer(rows[index].project) },
  { code: "7-18", label: "役員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, get: (rows, index) => growth(projectPayPerOfficer(rows[index].project), index ? projectPayPerOfficer(rows[index - 1].project) : undefined) },
  { code: "7-19", label: "労働生産性", unit: "億円/人", get: (rows, index) => { const segment = rows[index].project; const people = segment.headcount + segment.officerCount; return people ? valueAdded(segment) / people : 0; } },
  { code: "7-20", label: "市場伸び率（年あたり）", unit: "%", fixed: true, get: (_rows, _index, drivers) => drivers.projectMarketGrowth * 100 },
];

type CompanyActualInputRow = {
  code: string;
  label: string;
  unit?: string;
  indentLevel?: 1 | 2;
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
  { code: "2-2", label: "売上高成長率", unit: "%", indentLevel: 1, get: (rows, index) => growth(companySegment(rows, index).sales, index ? companySegment(rows, index - 1).sales : undefined) },
  { code: "2-3", label: "売上原価", get: (rows, index) => companySegment(rows, index).cogs, set: (row, value) => ({ cogs: value - row.project.cogs }) },
  { code: "2-4", label: "うち減価償却費", indentLevel: 1, get: (rows, index) => cogsDepreciation(companySegment(rows, index)), set: (row, value) => { const next = value - cogsDepreciation(row.project); return { cogsDepreciation: next, depreciation: next + sgaDepreciation(row.other) }; } },
  { code: "2-5", label: "売上総利益", get: (rows, index) => { const company = companySegment(rows, index); return company.sales - company.cogs; } },
  { code: "2-6", label: "売上総利益率", unit: "%", indentLevel: 1, get: (rows, index) => { const company = companySegment(rows, index); return rate(company.sales - company.cogs, company.sales); } },
  { code: "2-7", label: "販売費及び一般管理費", get: (rows, index) => companySgaTotal(companySegment(rows, index)), set: (row, value) => ({ otherSga: value - companySgaTotal(row.project) - row.other.employeePay - row.other.officerPay - sgaDepreciation(row.other) - researchDevelopment(row.other) }) },
  { code: "2-8", label: "うち役員の人件費（自動計算）", indentLevel: 1, get: (rows, index) => companySegment(rows, index).officerPay },
  { code: "2-9", label: "うち役員報酬", indentLevel: 2, get: (rows, index) => officerCompensation(companySegment(rows, index)), set: (row, value) => { const next = value - officerCompensation(row.project); const nextPay = next + officerBonus(row.other); return preserveSgaTotal(row.other, { officerCompensation: next, officerPay: nextPay }, nextPay - row.other.officerPay); } },
  { code: "2-10", label: "うち役員賞与", indentLevel: 2, get: (rows, index) => officerBonus(companySegment(rows, index)), set: (row, value) => { const next = value - officerBonus(row.project); const nextPay = officerCompensation(row.other) + next; return preserveSgaTotal(row.other, { officerBonus: next, officerPay: nextPay }, nextPay - row.other.officerPay); } },
  { code: "2-11", label: "うち従業員の人件費（自動計算）", indentLevel: 1, get: (rows, index) => companySegment(rows, index).employeePay },
  { code: "2-12", label: "うち従業員の給与", indentLevel: 2, get: (rows, index) => employeeSalary(companySegment(rows, index)), set: (row, value) => { const next = value - employeeSalary(row.project); const nextPay = next + employeeBonus(row.other); return preserveSgaTotal(row.other, { employeeSalary: next, employeePay: nextPay }, nextPay - row.other.employeePay); } },
  { code: "2-13", label: "うち従業員の賞与", indentLevel: 2, get: (rows, index) => employeeBonus(companySegment(rows, index)), set: (row, value) => { const next = value - employeeBonus(row.project); const nextPay = employeeSalary(row.other) + next; return preserveSgaTotal(row.other, { employeeBonus: next, employeePay: nextPay }, nextPay - row.other.employeePay); } },
  { code: "2-14", label: "うち減価償却費", indentLevel: 1, get: (rows, index) => sgaDepreciation(companySegment(rows, index)), set: (row, value) => { const next = value - sgaDepreciation(row.project); return preserveSgaTotal(row.other, { sgaDepreciation: next, depreciation: cogsDepreciation(row.other) + next }, next - sgaDepreciation(row.other)); } },
  { code: "2-15", label: "うち研究開発費", indentLevel: 1, get: (rows, index) => researchDevelopment(companySegment(rows, index)), set: (row, value) => { const next = value - researchDevelopment(row.project); return preserveSgaTotal(row.other, { researchDevelopment: next }, next - researchDevelopment(row.other)); } },
  { code: "2-16", label: "営業利益", get: (rows, index) => operatingProfit(companySegment(rows, index)) },
  { code: "2-17", label: "営業利益率", unit: "%", indentLevel: 1, get: (rows, index) => { const company = companySegment(rows, index); return rate(operatingProfit(company), company.sales); } },
  { code: "2-18", label: "経常利益", get: (rows, index) => ordinaryIncome(companySegment(rows, index)), set: (row, value) => ({ ordinaryIncome: value - ordinaryIncome(row.project) }) },
  { code: "2-19", label: "税引前当期純利益", get: (rows, index) => preTaxIncome(companySegment(rows, index)), set: (row, value) => ({ preTaxIncome: value - preTaxIncome(row.project) }) },
  { code: "2-20", label: "当期純利益", get: (rows, index) => netIncome(companySegment(rows, index)), set: (row, value) => ({ netIncome: value - netIncome(row.project) }) },
  { code: "2-21", label: "給与支給総額（常時使用する従業員）", groupStart: true, get: (rows, index) => companySegment(rows, index).employeePay },
  { code: "2-22", label: "給与支給総額（役員）", get: (rows, index) => companySegment(rows, index).officerPay },
  { code: "2-23", label: "減価償却費（合計）", get: (rows, index) => companySegment(rows, index).depreciation },
  { code: "2-24", label: "付加価値額", get: (rows, index) => valueAdded(companySegment(rows, index)) },
  { code: "2-25", label: "付加価値増加率", unit: "%", indentLevel: 1, get: (rows, index) => growth(valueAdded(companySegment(rows, index)), index ? valueAdded(companySegment(rows, index - 1)) : undefined) },
  { code: "2-26", label: "売上高付加価値率", unit: "%", indentLevel: 1, get: (rows, index) => { const company = companySegment(rows, index); return rate(valueAdded(company), company.sales); } },
  { code: "2-27", label: "常時使用する従業員数（就業時間換算）", unit: "人", get: (rows, index) => companySegment(rows, index).headcount, set: (row, value) => ({ headcount: Math.max(0, Math.round(value - row.project.headcount)) }) },
  { code: "2-28", label: "役員数", unit: "人", get: (rows, index) => companySegment(rows, index).officerCount, set: (row, value) => ({ officerCount: Math.max(0, Math.round(value - row.project.officerCount)) }) },
  { code: "2-29", label: "従業員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => { const company = companySegment(rows, index); return company.headcount ? company.employeePay / company.headcount : 0; } },
  { code: "2-30", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, get: (rows, index) => { const current = companySegment(rows, index); const previous = index ? companySegment(rows, index - 1) : undefined; return growth(current.headcount ? current.employeePay / current.headcount : 0, previous?.headcount ? previous.employeePay / previous.headcount : undefined); } },
  { code: "2-31", label: "役員1人当たり給与支給総額", unit: "億円/人", get: (rows, index) => { const company = companySegment(rows, index); return company.officerCount ? company.officerPay / company.officerCount : 0; } },
  { code: "2-32", label: "役員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, get: (rows, index) => { const current = companySegment(rows, index); const previous = index ? companySegment(rows, index - 1) : undefined; return growth(current.officerCount ? current.officerPay / current.officerCount : 0, previous?.officerCount ? previous.officerPay / previous.officerCount : undefined); } },
  { code: "2-33", label: "労働生産性", unit: "億円/人", get: (rows, index) => { const company = companySegment(rows, index); const people = company.headcount + company.officerCount; return people ? valueAdded(company) / people : 0; } },
  { code: "2-34", label: "EBITDA", get: (rows, index) => { const company = companySegment(rows, index); return operatingProfit(company) + company.depreciation; } },
  { code: "2-35", label: "EBITDAマージン", unit: "%", indentLevel: 1, get: (rows, index) => { const company = companySegment(rows, index); return rate(operatingProfit(company) + company.depreciation, company.sales); } },
  { code: "2-36", label: "EBITDA増加率", unit: "%", indentLevel: 1, get: (rows, index) => { const company = companySegment(rows, index); const previous = index ? companySegment(rows, index - 1) : undefined; return growth(operatingProfit(company) + company.depreciation, previous ? operatingProfit(previous) + previous.depreciation : undefined); } },
];

function PlRowTitle({ code, label, indentLevel = 0 }: { code: string; label: string; indentLevel?: 0 | 1 | 2 | 3 }) {
  return <span className={`pl-row-title pl-row-indent-${indentLevel}`}>{code} {label}</span>;
}

function HistoricalInputsEditor({ historical, inputValues, onHistoricalCompanyChange, onHistoricalProjectChange }: {
  historical: YearPlan[];
  inputValues: InputValues;
  onHistoricalCompanyChange: (yearIndex: number, item: CompanyActualInputRow, value: number | null) => void;
  onHistoricalProjectChange: (yearIndex: number, item: ProjectOfficialInputRow, value: number | null) => void;
}) {
  const [omitCompanyActualCalculated, setOmitCompanyActualCalculated] = useState(false);
  const [omitProjectActualCalculated, setOmitProjectActualCalculated] = useState(false);
  const visibleCompanyActualRows = omitCompanyActualCalculated ? companyActualInputRows.filter((item) => item.set) : companyActualInputRows;
  const visibleProjectActualRows = omitProjectActualCalculated ? projectOfficialDisplayRows.filter((item) => item.input) : projectOfficialDisplayRows.filter((item) => !item.fixed);
  return <div className="manual-sections spreadsheet-grid">
    <div><h3 className="manual-table-heading"><span>会社全体にかかる損益計算書・関連計算項目（過去3期実績）</span><button type="button" className="calculated-row-toggle" aria-pressed={omitCompanyActualCalculated} onClick={() => setOmitCompanyActualCalculated((current) => !current)}>{omitCompanyActualCalculated ? "自動計算項目を表示する" : "自動計算項目を省略する"}</button></h3><div className="wide-table actuals-three-year-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{historical.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{visibleCompanyActualRows.map((item) => <tr className={`${!item.set ? "emphasis" : ""}${item.groupStart ? " official-related-start" : ""}`} key={item.code}><th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} />{item.groupStart && <small>P/L関連計算項目</small>}{item.unit && <small>{item.unit}</small>}</th>{historical.map((row, index) => { const value = item.get(historical, index); return <td key={row.year}>{item.set ? <input type="number" step={item.unit === "人" ? 1 : 0.01} value={getInputValue(inputValues, inputKey.companyActual(row.year, item.code))} placeholder="未入力" onChange={(event) => onHistoricalCompanyChange(index, item, event.target.value === "" ? null : Number(event.target.value))} /> : <strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong>}</td>; })}</tr>)}</tbody></table></div></div>
    <div>
      <h3 className="manual-table-heading">
        <span>補助事業PL（過去3期実績）</span>
        <button type="button" className="calculated-row-toggle" aria-pressed={omitProjectActualCalculated} onClick={() => setOmitProjectActualCalculated((current) => !current)}>
          {omitProjectActualCalculated ? "自動計算項目を表示する" : "自動計算項目を省略する"}
        </button>
      </h3>
      <div className="wide-table actuals-three-year-table"><table><thead><tr><th>第6次様式項目／補足項目（P2-Xは内部管理用）</th>{historical.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{visibleProjectActualRows.map((item) => <tr className={!item.input ? "calculated-row" : ""} key={item.code}><th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} /><small>{item.unit}／{item.input ? "必須入力" : "自動計算"}</small></th>{historical.map((row, index) => {
        if (item.input) return <td key={row.year}><input type="number" step={item.digits === 0 ? 1 : 0.01} value={getInputValue(inputValues, inputKey.projectActual(row.year, item.code))} placeholder="未入力" onChange={(event) => onHistoricalProjectChange(index, item.input!, event.target.value === "" ? null : Number(event.target.value))} /></td>;
        const calculatedValue = item.get(historical, index, emptyDrivers);
        return <td className="calculated-cell" key={row.year}><strong>{calculatedValue === undefined ? "—" : number(calculatedValue, item.digits ?? 2)}</strong><small>{item.code === "7-10" ? "P2-4＋P2-14" : "自動計算"}</small></td>;
      })}</tr>)}</tbody></table></div>
      <p className="footnote">7-2・7-3・7-5・7-7・7-10～7-12・7-15～7-19は入力済みの過去実績から自動計算します。P2-4とP2-14は補助事業の詳細PLを作るための必須入力です。公式7-10「減価償却費（合計）」は、各年度のP2-4＋P2-14として自動計算し、直接入力や配賦による補完は行いません。</p>
    </div>
    <p className="footnote">ベース事業の過去3期は「会社全体－補助事業」で自動算出するため、重複入力しません。</p>
  </div>;
}

function OfficialSectionHeading({ label, range, columns }: { label: string; range: string; columns: number }) {
  return <tr className="official-section-heading">
    <th><strong>{label}</strong><small>{range}</small></th>
    <td aria-hidden="true" colSpan={columns}></td>
  </tr>;
}

function ProjectDepreciationInputNotice({ items, context }: { items: MissingProjectDepreciationInput[]; context: "年度別PL" | "診断" }) {
  if (!items.length) return null;
  const years = [...new Set(items.map((item) => item.year))];
  return <aside className="project-input-shortage" role="alert">
    <strong>補助事業の減価償却費が未入力です</strong>
    <p>{years.join("・")}年のP2-4またはP2-14が空欄です。空欄は自動予測せず、{context}は入力不足として表示しています。③将来データ入力で年度別計画値を入力してください。</p>
  </aside>;
}

function DetailedProjectInputsTable({ historical, effectivePlan, overrides, omitCalculated, onToggleCalculated, onForecastChange }: {
  historical: YearPlan[];
  effectivePlan: YearPlan[];
  overrides: ForecastOverrides;
  omitCalculated: boolean;
  onToggleCalculated: () => void;
  onForecastChange: (year: number, segment: ForecastSegment, item: string, value: number | null) => void;
}) {
  const futureRows = effectivePlan.slice(historical.length);
  const visibleRows = omitCalculated ? projectDetailedDisplayRows.filter((item) => item.input) : projectDetailedDisplayRows;
  const rawPlaceholder = (value: number, digits = 2) => String(roundedInput(value, digits));
  return <div>
    <h3 className="manual-table-heading"><span>補助事業PL・関連計算項目（公式7-1～7-19＋内部管理P2-X：過去3期参照 → 事業化報告3年目）</span><button type="button" className="calculated-row-toggle" aria-pressed={omitCalculated} onClick={onToggleCalculated}>{omitCalculated ? "自動計算項目を表示する" : "自動計算項目を省略する"}</button></h3>
    <div className="wide-table"><table><thead><tr><th>公式Excel項目／補足項目（P2-Xは内部管理用）</th>{historical.map((row) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・参照</small></th>)}{futureRows.map((row) => <th key={row.year} className="forecast-heading">{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・空欄は原則自動予測</small></th>)}</tr></thead>
      <tbody>
        <OfficialSectionHeading label="損益計算書" range="公式7-1～7-7／補足P2-X" columns={historical.length + futureRows.length} />
        {visibleRows.flatMap((item) => [
          (omitCalculated ? item.code === "7-13" : item.code === "7-8") ? <OfficialSectionHeading key="project-detail-related" label="P/L関連計算項目" range="公式7-8～7-19／補足P2-X" columns={historical.length + futureRows.length} /> : null,
          <tr className={!item.input ? "calculated-row" : ""} key={item.code}>
            <th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} /><small>{item.unit}／{item.input ? "入力・上書き可" : "自動計算"}{item.code.startsWith("P2-") ? "／内部管理用" : ""}</small></th>
            {historical.map((row, index) => {
              const value = item.get(historical, index);
              return <td className={`historical-reference${item.input ? "" : " calculated-cell"}`} key={row.year}><strong>{value === undefined ? "—" : number(value, item.digits ?? 2)}</strong></td>;
            })}
            {futureRows.map((row) => {
              const index = effectivePlan.findIndex((candidate) => candidate.year === row.year);
              const value = item.get(effectivePlan, index);
              if (!item.input) return <td className="calculated-cell" key={row.year}><strong>{value === undefined ? "—" : number(value, item.digits ?? 2)}</strong>{value !== undefined && <small>自動計算</small>}</td>;
              const input = item.input;
              const key = forecastOverrideKey(row.year, "project", input.key);
              const overridden = Object.prototype.hasOwnProperty.call(overrides, key);
              const required = requiredProjectDepreciationDetailedKeys.has(input.key);
              return <td className={required && !overridden ? "required-input-missing" : undefined} key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={input.digits === 0 ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={required ? "未入力" : rawPlaceholder(value ?? 0, input.digits ?? 2)} aria-invalid={required && !overridden} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : required ? "必須・未入力" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "project", input.key, event.target.value === "" ? null : Number(event.target.value))} /></td>;
            })}
          </tr>,
        ])}
      </tbody>
    </table></div>
    <p className="footnote">第6次公式Excelに対応する項目は7-1～7-19で表示し、給与・賞与の内訳、減価償却費の区分、経常利益以下など公式様式だけでは不足する項目に限りP2-Xを付けています。P2-4・P2-14は年度別の必須入力で、空欄を自動予測または前年度値から補完しません。営業外損益（純額）は「経常利益－営業利益」、特別損益（純額）は「税引前当期純利益－経常利益」で自動計算します。補助事業の経常利益以下が未入力の場合、純額は0として表示します。P2-Xは補助事業の詳細PLを作るための内部管理用番号で、公式Excelへ直接転記する番号ではありません。7-20市場伸び率は「15指標・目標」の固定前提を参照します。</p>
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
  const [omitProjectCalculated, setOmitProjectCalculated] = useState(false);
  const [omitCompanyCalculated, setOmitCompanyCalculated] = useState(false);
  const [omitOtherCalculated, setOmitOtherCalculated] = useState(false);
  const visibleProjectRows = omitProjectCalculated ? projectOfficialDisplayRows.filter((item) => item.input || item.fixed) : projectOfficialDisplayRows;
  const visibleCompanyRows = omitCompanyCalculated ? companyActualInputRows.filter((item) => item.set) : companyActualInputRows;
  const visibleOtherRows = omitOtherCalculated ? otherPlDisplayRows.filter((item) => item.input) : otherPlDisplayRows;
  return <div className="manual-sections spreadsheet-grid">
    {futureInputBasis === "company" ? <div>
      <h3 className="manual-table-heading"><span>補助事業収支計画（7-1～7-20：過去3期参照 → 事業化報告3年目）</span><button type="button" className="calculated-row-toggle" aria-pressed={omitProjectCalculated} onClick={() => setOmitProjectCalculated((current) => !current)}>{omitProjectCalculated ? "自動計算項目を表示する" : "自動計算項目を省略する"}</button></h3>
      <div className="wide-table"><table><thead><tr><th>第6次様式項目</th>{historical.map((row) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・参照</small></th>)}{futureRows.map((row) => <th key={row.year} className="forecast-heading">{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・空欄は原則自動予測</small></th>)}</tr></thead>
        <tbody>{visibleProjectRows.map((item) => <tr className={!item.input ? "calculated-row" : ""} key={item.code}>
          <th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} /><small>{item.unit}／{item.input ? "入力・上書き可" : item.fixed ? "固定前提" : "自動計算"}</small></th>
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
            const required = requiredProjectDepreciationCodes.has(item.code);
            return <td className={required && !overridden ? "required-input-missing" : undefined} key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={item.digits === 0 ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={required ? "未入力" : rawPlaceholder(value ?? 0, item.digits ?? 2)} aria-invalid={required && !overridden} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : required ? "必須・未入力" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "project", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>;
          })}
        </tr>)}</tbody>
      </table></div>
      <p className="footnote">7-1・7-4・7-6・7-8・7-9・7-13・7-14と、内部管理用のP2-4・P2-14が入力値です。P2-4・P2-14は年度別の必須入力で、空欄を自動予測または前年度値から補完しません。7-10はP2-4＋P2-14として自動計算します。7-2・7-3・7-5・7-7・7-11・7-12・7-15～7-19は第6次Excelと同じ関係式で自動計算し、7-20は「15指標・目標」の市場伸び率を参照します。</p>
    </div> : <DetailedProjectInputsTable historical={historical} effectivePlan={effectivePlan} overrides={overrides} omitCalculated={omitProjectCalculated} onToggleCalculated={() => setOmitProjectCalculated((current) => !current)} onForecastChange={onForecastChange} />}
    <div>
      <h3 className="manual-table-heading"><span>会社全体の損益計算書・関連計算項目（2-1～2-36：過去3期参照 → 将来）</span><button type="button" className="calculated-row-toggle" aria-pressed={omitCompanyCalculated} onClick={() => setOmitCompanyCalculated((current) => !current)}>{omitCompanyCalculated ? "自動計算項目を表示する" : "自動計算項目を省略する"}</button></h3>
      <div className="wide-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{historical.map((row) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・参照</small></th>)}{futureRows.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead>
        <tbody>
          <OfficialSectionHeading label="損益計算書" range="2-1～2-20" columns={historical.length + futureRows.length} />
          {visibleCompanyRows.flatMap((item) => [
          (omitCompanyCalculated ? item.code === "2-27" : item.groupStart) ? <OfficialSectionHeading key="section-related" label="P/L関連計算項目" range="2-21～2-36" columns={historical.length + futureRows.length} /> : null,
          <tr className={!item.set ? "emphasis" : ""} key={item.code}>
          <th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} />{item.unit && <small>{item.unit}</small>}</th>
          {historical.map((row, index) => { const value = item.get(historical, index); return <td className="historical-reference" key={row.year}><strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong></td>; })}
          {futureRows.map((row) => {
            const index = effectivePlan.findIndex((candidate) => candidate.year === row.year);
            const value = item.get(effectivePlan, index);
            if (futureInputBasis !== "company" || !item.set) return <td className={!item.set ? "calculated-cell" : undefined} key={row.year}><strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong>{!item.set && value !== undefined && <small>自動計算</small>}</td>;
            const key = forecastOverrideKey(row.year, "company", item.code);
            const overridden = Object.prototype.hasOwnProperty.call(overrides, key);
            return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={item.unit === "人" ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(value ?? 0, item.unit === "人" ? 0 : 2)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "company", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>;
          })}
        </tr>])}</tbody>
      </table></div>
      <p className="footnote">2-1～2-20を損益計算書、2-21～2-36を給与・付加価値・人数・EBITDAの「P/L関連計算項目」として区切っています。2-18～2-20・2-27・2-28は第6次様式に合わせた入力項目です。将来の2-18～2-20は直近実績の営業外損益率・特別損益率・税引後利益率を基に自動予測し、必要な年度だけ上書きできます。</p>
    </div>
    <div>
      <h3 className="manual-table-heading"><span>ベース事業PL・関連計算項目（M2-1～M2-36：過去3期参照 → 事業化報告3年目）</span><button type="button" className="calculated-row-toggle" aria-pressed={omitOtherCalculated} onClick={() => setOmitOtherCalculated((current) => !current)}>{omitOtherCalculated ? "自動計算項目を表示する" : "自動計算項目を省略する"}</button></h3>
      <div className="wide-table"><table><thead><tr><th>第6次様式2-1～2-36準拠の内部管理項目</th>{historical.map((row) => <th className="historical-heading" key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・全社－補助事業</small></th>)}{futureRows.map((row) => <th key={row.year} className={futureInputBasis === "other" ? "forecast-heading" : undefined}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・{futureInputBasis === "other" ? "空欄は自動予測" : "自動算出"}</small></th>)}</tr></thead>
        <tbody>
          <OfficialSectionHeading label="損益計算書" range="M2-1～M2-20" columns={historical.length + futureRows.length} />
          {visibleOtherRows.flatMap((item) => [
            (omitOtherCalculated ? item.code === "M2-27" : item.code === "M2-21") ? <OfficialSectionHeading key="other-section-related" label="P/L関連計算項目" range="M2-21～M2-36" columns={historical.length + futureRows.length} /> : null,
            <tr className={!item.input ? "calculated-row" : ""} key={item.code}>
              <th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} /><small>{item.unit}／{item.input ? "入力・上書き可" : "自動計算"}</small></th>
              {historical.map((row, index) => { const value = futureInputBasis === "company" && companyModeUnsupportedOtherCodes.has(item.code) ? undefined : item.get(historical, index); return <td className={`historical-reference${item.input ? "" : " calculated-cell"}`} key={row.year}><strong>{value === undefined ? "—" : number(value, item.digits ?? 2)}</strong></td>; })}
              {futureRows.map((row) => {
                const index = effectivePlan.findIndex((candidate) => candidate.year === row.year);
                const value = futureInputBasis === "company" && companyModeUnsupportedOtherCodes.has(item.code) ? undefined : item.get(effectivePlan, index);
                if (futureInputBasis === "company" || !item.input) return <td className={!item.input ? "calculated-cell" : undefined} key={row.year}><strong>{value === undefined ? "—" : number(value, item.digits ?? 2)}</strong>{!item.input && value !== undefined && <small>自動計算</small>}</td>;
                const input = item.input;
                const key = forecastOverrideKey(row.year, "other", input.key);
                const overridden = Object.prototype.hasOwnProperty.call(overrides, key);
                return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={input.digits === 0 ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(value ?? 0, input.digits ?? 2)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "other", input.key, event.target.value === "" ? null : Number(event.target.value))} /></td>;
              })}
            </tr>,
          ])}
        </tbody>
      </table></div>
      <p className="footnote">「ベース事業PLを入力」では、会社全体2-1～2-36と同じ会計順序で入力します。「全社PLを入力」では、公式7-1～7-20から確実に差額算出できる項目だけを表示し、補助事業側の内訳が不足する賞与・減価償却費区分・経常利益以下などは「—」とします。</p>
    </div>
  </div>;
}

function AutoRequiredInputsEditor({ historical, autoPlan, effectivePlan, overrides, futureInputBasis, onHistoricalCompanyChange, onHistoricalProjectChange, onForecastChange }: { historical: YearPlan[]; autoPlan: YearPlan[]; effectivePlan: YearPlan[]; overrides: ForecastOverrides; futureInputBasis: FutureInputBasis; onHistoricalCompanyChange: (yearIndex: number, item: CompanyActualInputRow, value: number) => void; onHistoricalProjectChange: (yearIndex: number, item: ProjectOfficialInputRow, value: number) => void; onForecastChange: (year: number, segment: ForecastSegment, item: string, value: number | null) => void }) {
  const futureProjectRows = autoPlan.slice(historical.length);
  const effectiveProjectByYear = new Map(effectivePlan.map((row) => [row.year, row.project]));
  const effectiveOtherByYear = new Map(effectivePlan.map((row) => [row.year, row.other]));
  const rawPlaceholder = (value: number) => String(roundedInput(value));
  return <div className="manual-sections spreadsheet-grid">
    <div><h3>会社全体にかかる損益計算書（過去3期実績 → 事業化報告3年目）</h3><div className="wide-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{effectivePlan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{companyActualInputRows.map((item) => <tr className={!item.set ? "emphasis" : ""} key={item.code}><th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} />{item.unit && <small>{item.unit}</small>}</th>{effectivePlan.map((row, index) => { const isActual = index < historical.length; const value = item.get(isActual ? historical : effectivePlan, index); if (isActual) return <td key={row.year}>{item.set ? <input type="number" step={item.unit === "人" ? 1 : 0.1} value={value ?? 0} onChange={(event) => onHistoricalCompanyChange(index, item, Number(event.target.value))} /> : <strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong>}</td>; if (futureInputBasis !== "company") return <td key={row.year}><span className="future-empty">—</span></td>; if (!item.set) return <td key={row.year}><strong>{value === undefined ? "—" : number(value, item.unit === "人" ? 0 : 2)}</strong></td>; const key = forecastOverrideKey(row.year, "company", item.code); const overridden = Object.prototype.hasOwnProperty.call(overrides, key); return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={item.unit === "人" ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(value ?? 0)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "company", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>; })}</tr>)}</tbody></table></div><p className="footnote">「全社PLを入力」を選ぶと将来欄が青枠になり、ベース事業PLを「全社－補助事業」で自動計算します。「ベース事業PLを入力」では将来欄を空欄表示します。</p></div>
    <div><h3>補助事業PL（過去3期実績 → 補助事業期間 → 基準年 → 事業化報告3年目）</h3><div className="wide-table"><table><thead><tr><th>第6次様式項目</th>{historical.map((row) => <th key={`actual-${row.year}`}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}{futureProjectRows.map((row) => <th key={`future-${row.year}`} className="forecast-heading">{row.year}<small>{YEAR_ROLE_LABELS[row.role]}・空欄は原則自動予測</small></th>)}</tr></thead><tbody>{projectOfficialInputRows.map((item) => <tr key={item.code}><th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} /><small>{item.unit}</small></th>{historical.map((row, index) => <td key={`actual-${row.year}`}><input type="number" step="0.1" value={item.get(row.project)} onChange={(event) => onHistoricalProjectChange(index, item, Number(event.target.value))} /></td>)}{futureProjectRows.map((row) => { const key = forecastOverrideKey(row.year, "project", item.code); const overridden = Object.prototype.hasOwnProperty.call(overrides, key); const effective = effectiveProjectByYear.get(row.year)!; const required = requiredProjectDepreciationCodes.has(item.code); return <td className={required && !overridden ? "required-input-missing" : undefined} key={`future-${row.year}`}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step="0.1" value={overridden ? overrides[key] : ""} placeholder={required ? "未入力" : rawPlaceholder(item.get(effective))} aria-invalid={required && !overridden} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : required ? "必須・未入力" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "project", item.code, event.target.value === "" ? null : Number(event.target.value))} /></td>; })}</tr>)}</tbody></table></div><p className="footnote">過去3期は白枠の必須入力です。補助事業期間～事業化報告3年目は原則として空欄を自動予測しますが、P2-4・P2-14は年度別の必須入力です。</p></div>
    <div><h3>ベース事業PL（過去3期自動算出 → 事業化報告3年目）</h3><div className="wide-table"><table><thead><tr><th>内部管理番号・項目</th>{autoPlan.map((row) => <th key={row.year} className={row.year > historical.at(-1)!.year && futureInputBasis === "other" ? "forecast-heading" : undefined}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}{row.year > historical.at(-1)!.year ? futureInputBasis === "other" ? "・入力" : "・自動算出" : "・自動算出"}</small></th>)}</tr></thead><tbody>{otherPlInputFields.map((item) => <tr key={item.key}><th><PlRowTitle code={item.modelCode} label={item.label} indentLevel={item.indentLevel} /><small>{item.unit}</small></th>{autoPlan.map((row, index) => { const isActual = index < historical.length; const effective = effectiveOtherByYear.get(row.year)!; const value = item.get(effective); if (isActual || futureInputBasis === "company") return <td key={row.year}><strong>{number(value, item.digits ?? 2)}</strong></td>; const key = forecastOverrideKey(row.year, "other", item.key); const overridden = Object.prototype.hasOwnProperty.call(overrides, key); return <td key={row.year}><input className={`forecast-override${overridden ? " is-fixed" : ""}`} type="number" step={item.digits === 0 ? 1 : 0.1} value={overridden ? overrides[key] : ""} placeholder={rawPlaceholder(value)} aria-label={`${row.year}年 ${item.label}（${overridden ? "手入力固定値" : "空欄は自動予測"}）`} onChange={(event) => onForecastChange(row.year, "other", item.key, event.target.value === "" ? null : Number(event.target.value))} /></td>; })}</tr>)}</tbody></table></div><p className="footnote">「ベース事業PLを入力」を選ぶと将来欄が青枠になります。「全社PLを入力」では、将来値を「全社PL－補助事業PL」で自動表示します。</p></div>
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

type MoneyDisplayUnit = "億円" | "百万円" | "千円";

const moneyDisplayMultiplier: Record<MoneyDisplayUnit, number> = {
  "億円": 1,
  "百万円": 100,
  "千円": 100000,
};

const chartValueDigits = (unit: string) => {
  if (unit === "億円/人") return 3;
  if (unit === "億円") return 2;
  if (unit === "百万円/人" || unit === "百万円") return 1;
  if (unit === "千円/人" || unit === "千円") return 0;
  return 1;
};

function TrendChart({ title, subtitle, unit, plan, series, zeroBaseline }: { title: string; subtitle: string; unit: string; plan: YearPlan[]; series: ChartSeries[]; zeroBaseline: boolean }) {
  const width = 720;
  const height = 270;
  const margin = { top: 22, right: 22, bottom: 42, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const latestIndex = Math.max(0, plan.findIndex((row) => row.role === "latest"));
  const baseIndex = plan.findIndex((row) => row.role === "base");
  const finiteValues = series.flatMap((item) => item.values).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const scale = niceChartScale(finiteValues, { zeroBaseline });
  const minValue = scale.min;
  const maxValue = scale.max;
  const span = maxValue > minValue ? maxValue - minValue : 1;
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
  const axisLabel = (value: number) => number(value, scale.decimals);

  return <article className="trend-chart-card">
    <div className="trend-chart-title"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{unit}</span></div>
    <svg className="trend-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}の年度推移。実線は過去実績、破線は将来予測。`}>
      <rect className="trend-chart-future-area" x={x(latestIndex)} y={margin.top} width={Math.max(0, width - margin.right - x(latestIndex))} height={plotHeight} />
      {[...scale.ticks].reverse().map((gridValue) => {
        const gridY = y(gridValue);
        return <g key={gridValue}><line className="trend-chart-gridline" x1={margin.left} y1={gridY} x2={width - margin.right} y2={gridY} /><text className="trend-chart-axis-label" x={margin.left - 9} y={gridY + 4} textAnchor="end">{axisLabel(gridValue)}</text></g>;
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
      return <span key={item.label}><i style={{ background: item.color }} />{item.label}<strong>{lastValue === undefined ? "—" : number(lastValue, chartValueDigits(unit))}</strong></span>;
    })}</div>
  </article>;
}

function DiagnosticCharts({ plan }: { plan: YearPlan[] }) {
  const [zeroBaseline, setZeroBaseline] = useState(true);
  const [moneyUnit, setMoneyUnit] = useState<MoneyDisplayUnit>("千円");
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
  const moneyMultiplier = moneyDisplayMultiplier[moneyUnit];
  const displayMoney = (value: number | undefined) => value === undefined ? undefined : value * moneyMultiplier;

  return <section className="diagnostic-charts" aria-labelledby="diagnostic-chart-heading">
    <div className="diagnostic-chart-heading"><div><h2 id="diagnostic-chart-heading">主要指標の推移チャート</h2></div><div className="diagnostic-chart-controls"><label className="chart-unit-control"><span>金額単位</span><select value={moneyUnit} onChange={(event) => setMoneyUnit(event.target.value as MoneyDisplayUnit)} aria-label="金額系チャートの表示単位"><option value="千円">千円（第6次様式）</option><option value="百万円">百万円</option><option value="億円">億円</option></select><small>金額系チャートに反映</small></label><div className="chart-scale-control"><span>縦軸の最小値</span><div className="mode-switch" role="group" aria-label="チャートの縦軸最小値"><button type="button" className={zeroBaseline ? "active" : ""} aria-pressed={zeroBaseline} onClick={() => setZeroBaseline(true)}>0から開始</button><button type="button" className={!zeroBaseline ? "active" : ""} aria-pressed={!zeroBaseline} onClick={() => setZeroBaseline(false)}>データ範囲を拡大</button></div><small>負の値を含む場合は、値が切れない範囲まで自動調整します。</small></div></div></div>
    <div className="diagnostic-chart-grid">
      <TrendChart title="売上高" subtitle="全社と事業別の規模・成長ペース" unit={moneyUnit} plan={plan} zeroBaseline={zeroBaseline} series={[
        { label: "全社", color: colors.company, values: company.map((segment) => displayMoney(segment.sales)) },
        { label: "補助事業", color: colors.project, values: plan.map((row) => displayMoney(row.project.sales)) },
        { label: "ベース事業", color: colors.other, values: plan.map((row) => displayMoney(row.other.sales)) },
      ]} />
      <TrendChart title="収益性（全社）" subtitle="原価・その他販管費・営業利益の率" unit="%" plan={plan} zeroBaseline={zeroBaseline} series={[
        { label: "売上原価率", color: colors.project, values: company.map((segment) => chartRate(segment.cogs, segment.sales)) },
        { label: "その他販管費率", color: colors.other, values: company.map((segment) => chartRate(segment.otherSga, segment.sales)) },
        { label: "営業利益率", color: colors.company, values: company.map((segment) => chartRate(operatingProfit(segment), segment.sales)) },
      ]} />
      <TrendChart title="人員・1人当たり給与" subtitle="最新決算期を100とした全社指数" unit="指数" plan={plan} zeroBaseline={zeroBaseline} series={[
        { label: "従業員数", color: colors.other, values: indexed(company.map((segment) => segment.headcount)) },
        { label: "従業員1人当たり給与", color: colors.company, values: indexed(company.map(perEmployee)) },
      ]} />
      <TrendChart title="労働生産性" subtitle="付加価値額÷（従業員数＋役員数）" unit={`${moneyUnit}/人`} plan={plan} zeroBaseline={zeroBaseline} series={[
        { label: "全社", color: colors.company, values: company.map((segment) => displayMoney(productivity(segment))) },
        { label: "補助事業", color: colors.project, values: plan.map((row) => displayMoney(productivity(row.project))) },
        { label: "ベース事業", color: colors.other, values: plan.map((row) => displayMoney(productivity(row.other))) },
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
  return <article className="panel table-panel behavior-change-panel"><div className="panel-heading"><div><h2>行動変容に係る数値（自動計算）</h2></div><span className="pill green">4-1～4-7</span></div><div className="wide-table"><table><thead><tr><th>第6次様式項目</th><th>全社</th><th>補助事業</th><th>HTMLでの計算根拠</th></tr></thead><tbody>{rows.map((row) => <tr key={row.code}><th>{row.code} {row.label}<small>{row.unit}</small></th><td><strong>{display(row.company, row.unit)}</strong></td><td><strong>{row.project === undefined ? "—" : display(row.project, row.unit)}</strong></td><td className="formula-cell">{row.formula}</td></tr>)}</tbody></table></div><p className="footnote">第6次入力ガイドの②補助事業情報 4-1～4-7を再現しています。賃上げ率は基準年の従業員数が0人の場合のみ、役員1人当たり給与支給総額で代替します。投資額はHTML内部の億円から公式様式の千円へ換算しています。</p></article>;
}

type OfficialRow = {
  code: string;
  label: string;
  unit?: "%" | "人" | "億円/人";
  emphasis?: boolean;
  groupStart?: boolean;
  indentLevel?: 1 | 2;
  value: (rows: YearPlan[], index: number) => number | undefined;
  missing?: (year: number) => boolean;
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

const diagnosticSeriesColor = (label: string) => {
  if (label === "補助") return "var(--chart-project)";
  if (label === "ベース") return "var(--chart-other)";
  return "var(--chart-company)";
};

function diagnosticChartSeries(plan: YearPlan[], row: DiagnosticRow): ChartSeries[] {
  const labels = Array.from(new Set(plan.flatMap((year, index) => row.values(year, index).map((entry) => entry.label))));
  return labels.map((label) => ({
    label,
    color: diagnosticSeriesColor(label),
    values: plan.map((year, index) => row.values(year, index).find((entry) => entry.label === label)?.value),
  }));
}

function DiagnosticSparkline({ plan, row, selected, onSelect }: { plan: YearPlan[]; row: DiagnosticRow; selected: boolean; onSelect: () => void }) {
  const width = 116;
  const height = 44;
  const padding = 4;
  const series = diagnosticChartSeries(plan, row);
  const values = series.flatMap((item) => item.values).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const spread = Math.max(maximum - minimum, Math.max(Math.abs(maximum), 1) * 0.08);
  const lower = minimum - spread * 0.12;
  const upper = maximum + spread * 0.12;
  const x = (index: number) => padding + (plan.length <= 1 ? (width - padding * 2) / 2 : (width - padding * 2) * index / (plan.length - 1));
  const y = (value: number) => padding + (height - padding * 2) * (1 - (value - lower) / (upper - lower || 1));
  const path = (item: ChartSeries) => {
    let open = false;
    return item.values.map((value, index) => {
      if (value === undefined || !Number.isFinite(value)) {
        open = false;
        return "";
      }
      const command = open ? "L" : "M";
      open = true;
      return `${command}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    }).join(" ");
  };

  return <button type="button" className="diagnostic-sparkline-button" aria-pressed={selected} aria-label={`${row.name}の詳細チャートを表示`} onClick={onSelect}>
    <svg className="diagnostic-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${row.name}の年度推移`}>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      {series.map((item) => <path key={item.label} d={path(item)} stroke={item.color} />)}
    </svg>
  </button>;
}

function FinancialDiagnostics({ plan, balanceSheets, futureCapex }: { plan: YearPlan[]; balanceSheets: BalanceSheetPlan[]; futureCapex: { year: number; value: number }[] }) {
  const company = (row: YearPlan) => total(row.project, row.other);
  const segments = (row: YearPlan) => [
    { label: "全社", value: company(row) },
    { label: "補助", value: row.project },
    { label: "ベース", value: row.other },
  ];
  const segmentValues = (row: YearPlan, calculator: (segment: SegmentPlan) => number | undefined) =>
    segments(row).map((entry) => ({ label: entry.label, value: calculator(entry.value) }));
  const pairedValues = (row: YearPlan, calculator: (segment: SegmentPlan) => number | undefined) => [
    { label: "補助", value: calculator(row.project) },
    { label: "ベース", value: calculator(row.other) },
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
      title: "5. 補助事業とベース事業の比較",
      rows: [
        { name: "補助事業売上構成比", formula: "補助事業売上高 ÷ 全社売上高", check: "全社が補助事業へ過度に依存していないか", unit: "%", values: (row) => [{ label: "構成比", value: safeRate(row.project.sales, company(row).sales) }] },
        { name: "事業別売上成長率", formula: "当年売上高 ÷ 前年売上高－1", check: "片方の事業だけが不自然に急成長・縮小していないか", unit: "%", values: (row, index) => [{ label: "補助", value: previousSegment(index, "project")?.sales ? (row.project.sales / previousSegment(index, "project")!.sales - 1) * 100 : undefined }, { label: "ベース", value: previousSegment(index, "other")?.sales ? (row.other.sales / previousSegment(index, "other")!.sales - 1) * 100 : undefined }] },
        { name: "売上原価率差", formula: "補助事業原価率－ベース事業原価率", check: "補助事業の採算を過度に良く置いていないか", unit: "pt", values: (row) => [{ label: "差", value: (safeRate(row.project.cogs, row.project.sales) ?? 0) - (safeRate(row.other.cogs, row.other.sales) ?? 0) }] },
        { name: "営業利益率差", formula: "補助事業営業利益率－ベース事業営業利益率", check: "事業間の利益率差に合理的な根拠があるか", unit: "pt", values: (row) => [{ label: "差", value: (opMargin(row.project) ?? 0) - (opMargin(row.other) ?? 0) }] },
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
  const allRows = groups.flatMap((group) => group.rows.map((row) => ({ key: `${group.title}:${row.name}`, row })));
  const [selectedKey, setSelectedKey] = useState(allRows[0]?.key ?? "");
  const selected = allRows.find((entry) => entry.key === selectedKey) ?? allRows[0];
  const diagnosticsRef = useRef<HTMLElement>(null);
  const selectedChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = diagnosticsRef.current;
    const chart = selectedChartRef.current;
    if (!root || !chart) return;
    const updateStickyChartHeight = () => {
      root.style.setProperty("--diagnostic-sticky-chart-height", `${chart.offsetHeight}px`);
    };
    updateStickyChartHeight();
    const observer = new ResizeObserver(updateStickyChartHeight);
    observer.observe(chart);
    return () => observer.disconnect();
  }, [selectedKey]);

  return <section ref={diagnosticsRef} className="financial-diagnostics" aria-label="PL妥当性診断">
    <div className="diagnostic-heading"><div><h2>基本指標によるシミュレーション妥当性チェック</h2></div><p>「推移」の小さなチャートを選ぶと、詳細チャートが切り替わります。年度別数値は全社・補助事業・ベース事業の順です。</p></div>
    {selected && <div ref={selectedChartRef} className="diagnostic-selected-chart"><TrendChart title={selected.row.name} subtitle={`${selected.row.formula}｜${selected.row.check}`} unit={selected.row.unit} plan={plan} zeroBaseline series={diagnosticChartSeries(plan, selected.row)} /></div>}
    <div className="diagnostic-groups" aria-label="診断指標一覧">{groups.map((group) => <article className="panel table-panel diagnostic-panel" key={group.title}><h3>{group.title}</h3><div className="wide-table diagnostic-table"><table><thead><tr><th>指標名</th><th>計算式</th><th>主な確認点</th><th className="diagnostic-sparkline-column">推移</th>{plan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>{group.rows.map((item) => {
      const itemKey = `${group.title}:${item.name}`;
      const isSelected = itemKey === selected?.key;
      return <tr className={isSelected ? "diagnostic-selected-row" : undefined} key={item.name}><th>{item.name}<small>{item.unit}</small></th><td className="diagnostic-copy">{item.formula}</td><td className="diagnostic-copy">{item.check}</td><td className="diagnostic-sparkline-cell"><DiagnosticSparkline plan={plan} row={item} selected={isSelected} onSelect={() => setSelectedKey(itemKey)} /></td>{plan.map((row, index) => <td key={row.year}><div className="diagnostic-values">{item.values(row, index).map((entry) => <span key={entry.label}><small>{entry.label}</small><strong>{formatted(entry.value, item.unit)}</strong></span>)}</div></td>)}</tr>;
    })}</tbody></table></div></article>)}</div>
  </section>;
}

function OfficialRowsTable({ title, pill, plan, sourcePlan, rows, note }: { title: string; pill: string; plan: YearPlan[]; sourcePlan?: YearPlan[]; rows: OfficialRow[]; note?: string }) {
  const formatted = (value: number | undefined, unit?: OfficialRow["unit"]) => value === undefined ? "—" : `${number(value, unit === "%" ? 1 : 2)}${unit ? ` ${unit}` : ""}`;
  const hasSections = rows.some((item) => item.groupStart);
  return <article className="panel table-panel company-table"><div className="panel-heading"><div><h2>{title}</h2></div><span className="pill green">{pill}</span></div><div className="wide-table"><table><thead><tr><th>第6次様式項目（金額は億円）</th>{plan.map((row) => <th key={row.year}>{row.year}<small>{YEAR_ROLE_LABELS[row.role]}</small></th>)}</tr></thead><tbody>
    {hasSections && <OfficialSectionHeading label="損益計算書" range="2-1～2-20" columns={plan.length} />}
    {rows.flatMap((item) => [
      item.groupStart ? <OfficialSectionHeading key="section-related" label="P/L関連計算項目" range="2-21～2-36" columns={plan.length} /> : null,
      <tr className={item.emphasis ? "emphasis" : ""} key={item.code}><th><PlRowTitle code={item.code} label={item.label} indentLevel={item.indentLevel} /></th>{plan.map((year, index) => { const missing = item.missing?.(year.year) ?? false; const value = item.value(plan, index); const before = sourcePlan ? item.value(sourcePlan, index) : undefined; return <td className={missing ? "required-input-missing" : undefined} key={year.year}>{sourcePlan && !missing && <small className="before-cell">{formatted(before, item.unit)} →</small>}<strong className={sourcePlan && !missing ? "after-cell" : ""}>{missing ? "未入力" : formatted(value, item.unit)}</strong></td>; })}</tr>,
    ])}
  </tbody></table></div>{note && <p className="footnote">{note}</p>}</article>;
}

function CompanyTable({ plan, sourcePlan }: { plan: YearPlan[]; sourcePlan?: YearPlan[] }) {
  const emphasisCodes = new Set(["2-1", "2-5", "2-16", "2-18", "2-24", "2-34"]);
  const rows: OfficialRow[] = companyActualInputRows.map((item) => ({
    code: item.code,
    label: item.label,
    unit: item.unit as OfficialRow["unit"],
    emphasis: emphasisCodes.has(item.code),
    groupStart: item.groupStart,
    indentLevel: item.indentLevel,
    value: item.get,
  }));
  return <OfficialRowsTable title="会社全体にかかる損益計算書・関連計算項目" pill="2-1～2-36" plan={plan} sourcePlan={sourcePlan} rows={rows} note="2-1～2-20が損益計算書、2-21～2-36が給与・付加価値・人数・EBITDAの関連計算項目です。2-8は2-9＋2-10、2-11は2-12＋2-13、2-23は2-4＋2-14で自動計算します。2-18～2-20・2-27・2-28は第6次様式の入力項目で、将来値は自動予測後に上書きできます。" />;
}

function OfficialProjectTable({ plan, sourcePlan, drivers, missingKeys }: { plan: YearPlan[]; sourcePlan?: YearPlan[]; drivers: Drivers; missingKeys: Set<string> }) {
  const missing = (code: "P2-4" | "P2-14") => (year: number) => missingKeys.has(`${year}:${code}`);
  const missingTotal = (year: number) => missingKeys.has(`${year}:P2-4`) || missingKeys.has(`${year}:P2-14`);
  const rows: OfficialRow[] = [
    { code: "7-1", label: "売上高", emphasis: true, value: (p, i) => p[i].project.sales },
        { code: "7-2", label: "売上高成長率", unit: "%", indentLevel: 1, value: (p, i) => growth(p[i].project.sales, i ? p[i - 1].project.sales : undefined) },
        { code: "7-3", label: "全社売上高に占める補助事業売上高の割合", unit: "%", indentLevel: 1, value: (p, i) => rate(p[i].project.sales, companySegment(p, i).sales) },
        { code: "P2-4", label: "売上原価に含まれる減価償却費（内部管理用）", indentLevel: 1, value: (p, i) => cogsDepreciation(p[i].project), missing: missing("P2-4") },
        { code: "7-4", label: "売上総利益", emphasis: true, value: (p, i) => p[i].project.sales - p[i].project.cogs },
    { code: "7-5", label: "売上総利益率", unit: "%", indentLevel: 1, value: (p, i) => rate(p[i].project.sales - p[i].project.cogs, p[i].project.sales) },
    { code: "7-6", label: "営業利益", emphasis: true, value: (p, i) => operatingProfit(p[i].project) },
    { code: "7-7", label: "営業利益率", unit: "%", indentLevel: 1, value: (p, i) => rate(operatingProfit(p[i].project), p[i].project.sales) },
        { code: "7-8", label: "給与支給総額（常時使用する従業員）", value: (p, i) => p[i].project.employeePay },
        { code: "7-9", label: "給与支給総額（役員）", value: (p, i) => p[i].project.officerPay },
        { code: "P2-14", label: "販管費に含まれる減価償却費（内部管理用）", indentLevel: 1, value: (p, i) => sgaDepreciation(p[i].project), missing: missing("P2-14") },
        { code: "7-10", label: "減価償却費（合計）", value: (p, i) => cogsDepreciation(p[i].project) + sgaDepreciation(p[i].project), missing: missingTotal },
    { code: "7-11", label: "付加価値", emphasis: true, value: (p, i) => valueAdded(p[i].project) },
    { code: "7-12", label: "付加価値増加率", unit: "%", indentLevel: 1, value: (p, i) => growth(valueAdded(p[i].project), i ? valueAdded(p[i - 1].project) : undefined) },
    { code: "7-13", label: "常時使用する従業員数（就業時間換算）", unit: "人", value: (p, i) => p[i].project.headcount },
    { code: "7-14", label: "役員数", unit: "人", value: (p, i) => p[i].project.officerCount },
    { code: "7-15", label: "従業員1人当たり給与支給総額", unit: "億円/人", value: (p, i) => p[i].project.headcount ? p[i].project.employeePay / p[i].project.headcount : 0 },
    { code: "7-16", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, value: (p, i) => growth(p[i].project.headcount ? p[i].project.employeePay / p[i].project.headcount : 0, i && p[i - 1].project.headcount ? p[i - 1].project.employeePay / p[i - 1].project.headcount : undefined) },
    { code: "7-17", label: "役員1人当たり給与支給総額", unit: "億円/人", value: (p, i) => p[i].project.officerCount ? p[i].project.officerPay / p[i].project.officerCount : 0 },
    { code: "7-18", label: "役員1人当たり給与支給総額の上昇率", unit: "%", indentLevel: 1, value: (p, i) => growth(p[i].project.officerCount ? p[i].project.officerPay / p[i].project.officerCount : 0, i && p[i - 1].project.officerCount ? p[i - 1].project.officerPay / p[i - 1].project.officerCount : undefined) },
    { code: "7-19", label: "労働生産性", unit: "億円/人", value: (p, i) => { const s = p[i].project; return s.headcount + s.officerCount ? valueAdded(s) / (s.headcount + s.officerCount) : 0; } },
    { code: "7-20", label: "市場伸び率（年あたり）", unit: "%", value: (_p, i) => i === 0 ? drivers.projectMarketGrowth * 100 : undefined },
  ];
      return <OfficialRowsTable title="補助事業にかかる収支計画" pill="7-1～7-20" plan={plan} sourcePlan={sourcePlan} rows={rows} note="P2-4・P2-14は年度別の必須入力です。空欄は未入力として表示し、自動予測や前年度値による補完を行いません。7-10は両項目が入力済みの場合に、その合計として表示します。7-20市場伸び率は、第6次Excelと同じく単一の入力値として最初の列に表示しています。" />;
}
