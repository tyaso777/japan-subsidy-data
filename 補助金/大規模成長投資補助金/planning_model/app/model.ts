import { normalizeInternalMoney, okuToInternalMoney } from "./money";

export type SegmentKey = "project" | "other";
export type Mode = "auto" | "manual";

export type SegmentPlan = {
  sales: number;
  cogs: number;
  employeePay: number;
  officerPay: number;
  /** 第6次様式2-21。未入力時のみ販管費内訳のemployeePayへフォールバックする。 */
  employeePayrollTotal?: number;
  /** 第6次様式2-22。未入力時のみ販管費内訳のofficerPayへフォールバックする。 */
  officerPayrollTotal?: number;
  depreciation: number;
  otherSga: number;
  headcount: number;
  officerCount: number;
  employeeSalary?: number;
  employeeBonus?: number;
  officerCompensation?: number;
  officerBonus?: number;
  cogsDepreciation?: number;
  sgaDepreciation?: number;
  researchDevelopment?: number;
  ordinaryIncome?: number;
  preTaxIncome?: number;
  netIncome?: number;
};

export type YearPlan = {
  year: number;
  role: YearRole;
  project: SegmentPlan;
  other: SegmentPlan;
};

export type BalanceSheetPlan = {
  year: number;
  assets: number;
  currentAssets: number;
  cash: number;
  fixedAssets: number;
  tangibleAssets: number;
  buildings: number;
  machinery: number;
  land: number;
  intangibleAssets: number;
  software: number;
  liabilities: number;
  currentLiabilities: number;
  shortTermDebt: number;
  fixedLiabilities: number;
  longTermDebt: number;
  netAssets: number;
  shareholderEquity: number;
  capital: number;
  capex: number;
};

export type ProjectPeriodInput = {
  year: number;
  project: SegmentPlan;
};

export type YearRole = "prePrevious" | "previous" | "latest" | "projectPeriod" | "beforeBase" | "base" | "report1" | "report2" | "report3";

export type TimelineSettings = {
  latestYear: number;
  baseYear: number;
};

export type Drivers = {
  projectMarketGrowth: number;
  projectCogsRateWhenSalesZero: number;
  otherCogsRateWhenSalesZero: number;
  projectCogsRateToBase: number;
  otherCogsRateToBase: number;
  projectEmployeeSalaryShare: number;
  otherEmployeeSalaryShare: number;
  projectOfficerCompensationShare: number;
  otherOfficerCompensationShare: number;
  projectCogsDepreciationShare: number;
  otherCogsDepreciationShare: number;
  projectResearchDevelopmentRate: number;
  otherResearchDevelopmentRate: number;
  projectNonOperatingRate: number;
  otherNonOperatingRate: number;
  projectExtraordinaryRate: number;
  otherExtraordinaryRate: number;
  effectiveTaxRate: number;
  projectSalesGrowthToBase: number;
  projectFirstYearSales: number;
  projectBaseYearSales: number;
  projectCogsImprovementToBase: number;
  projectPayGrowthToBase: number;
  projectHeadcountGrowthToBase: number;
  projectSgaImprovementToBase: number;
  projectOfficerPayGrowthToBase: number;
  otherSalesGrowthToBase: number;
  otherCogsImprovementToBase: number;
  otherPayGrowthToBase: number;
  otherOfficerPayGrowthToBase: number;
  otherHeadcountGrowthToBase: number;
  otherSgaImprovementToBase: number;
  projectSalesGrowth: number;
  otherSalesGrowth: number;
  projectCogsImprovementAfterBase: number;
  otherCogsImprovement: number;
  projectPayGrowth: number;
  otherPayGrowth: number;
  otherOfficerPayGrowth: number;
  projectHeadcountGrowth: number;
  otherHeadcountGrowth: number;
  projectSgaRateEnd: number;
  otherSgaRateEnd: number;
  projectOfficerPayGrowth: number;
  investment: number;
  subsidy: number;
  localBenchmark: number;
};

export type MetricKey =
  | "companySalesCagr"
  | "companySalesIncrease"
  | "companyPaySchedule"
  | "projectSalesShare"
  | "projectSalesCagr"
  | "projectSalesIncrease"
  | "laborProductivityCagr"
  | "valueAddedIncrease"
  | "employeePayCagr"
  | "employeePayIncrease"
  | "officerPayCagr"
  | "officerPayIncrease"
  | "investmentSalesRatio"
  | "valueAddedSubsidyRatio"
  | "localBenchmark";

export const sixthRoundReferenceMetricKeys = new Set<MetricKey>(["officerPayCagr", "officerPayIncrease"]);
export const isSixthRoundReferenceMetric = (key: MetricKey) => sixthRoundReferenceMetricKeys.has(key);
export const isOptimizationExcludedMetric = (key: MetricKey) => key === "localBenchmark" || isSixthRoundReferenceMetric(key);

export type MetricDefinition = {
  key: MetricKey;
  label: string;
  unit: string;
  round3Formula: string;
  round6Formula: string;
  defaultTarget: number;
  direction: "min" | "range";
  rangeMax?: number;
  sourceRound: string;
};

export type Target = {
  value: number;
  max?: number;
  policy: "hard" | "soft" | "monitor";
  weight: number;
};

export type Validation = {
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
  year?: number;
};

export const DEFAULT_TIMELINE: TimelineSettings = { latestYear: 2025, baseYear: 2028 };
export const YEAR_ROLE_LABELS: Record<YearRole, string> = {
  prePrevious: "前々期決算期",
  previous: "前期決算期",
  latest: "最新決算期",
  projectPeriod: "補助事業期間",
  beforeBase: "基準年前年／補助事業期間",
  base: "基準年（完了年度）",
  report1: "事業化報告1年目",
  report2: "事業化報告2年目",
  report3: "事業化報告3年目",
};

const segmentFromLegacyOku = (segment: SegmentPlan): SegmentPlan => Object.fromEntries(
  Object.entries(segment).map(([key, value]) => [
    key,
    key === "headcount" || key === "officerCount" ? value : okuToInternalMoney(value),
  ]),
) as SegmentPlan;

const balanceSheetFromLegacyOku = (row: BalanceSheetPlan): BalanceSheetPlan => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, key === "year" ? value : okuToInternalMoney(value)]),
) as BalanceSheetPlan;

export const sampleBasePlan: YearPlan = {
  year: DEFAULT_TIMELINE.latestYear,
  role: "latest",
  project: segmentFromLegacyOku({
    sales: 80,
    cogs: 54.4,
    employeePay: 6,
    employeeSalary: 5.7,
    employeeBonus: 0.3,
    officerPay: 0.4,
    officerCompensation: 0.36,
    officerBonus: 0.04,
    depreciation: 2,
    cogsDepreciation: 0.5,
    sgaDepreciation: 1.5,
    researchDevelopment: 0.4,
    otherSga: 10,
    headcount: 100,
    officerCount: 2,
  }),
  other: segmentFromLegacyOku({
    sales: 70,
    cogs: 47.6,
    employeePay: 8,
    employeeSalary: 7.6,
    employeeBonus: 0.4,
    officerPay: 0.6,
    officerCompensation: 0.54,
    officerBonus: 0.06,
    depreciation: 1.5,
    cogsDepreciation: 0.3,
    sgaDepreciation: 1.2,
    researchDevelopment: 0.3,
    otherSga: 8,
    headcount: 130,
    officerCount: 3,
  }),
};

export const sampleBalanceSheets: BalanceSheetPlan[] = [
  { year: 2023, assets: 132, currentAssets: 67, cash: 24, fixedAssets: 65, tangibleAssets: 53, buildings: 19, machinery: 24, land: 10, intangibleAssets: 7, software: 5, liabilities: 75, currentLiabilities: 39, shortTermDebt: 12, fixedLiabilities: 36, longTermDebt: 29, netAssets: 57, shareholderEquity: 54, capital: 10, capex: 5 },
  { year: 2024, assets: 143, currentAssets: 72, cash: 25, fixedAssets: 71, tangibleAssets: 58, buildings: 20, machinery: 28, land: 10, intangibleAssets: 8, software: 6, liabilities: 79, currentLiabilities: 41, shortTermDebt: 12, fixedLiabilities: 38, longTermDebt: 31, netAssets: 64, shareholderEquity: 61, capital: 10, capex: 8 },
  { year: 2025, assets: 156, currentAssets: 78, cash: 27, fixedAssets: 78, tangibleAssets: 64, buildings: 22, machinery: 32, land: 10, intangibleAssets: 9, software: 7, liabilities: 83, currentLiabilities: 43, shortTermDebt: 11, fixedLiabilities: 40, longTermDebt: 32, netAssets: 73, shareholderEquity: 70, capital: 10, capex: 10 },
].map(balanceSheetFromLegacyOku);

export const defaultProjectBasePlan: SegmentPlan = segmentFromLegacyOku({
  sales: 120,
  cogs: 78,
  employeePay: 10,
  officerPay: 0.6,
  depreciation: 6.5,
  cogsDepreciation: 1.63,
  sgaDepreciation: 4.87,
  otherSga: 12,
  headcount: 115,
  officerCount: 2,
});

export const sampleDrivers: Drivers = {
  projectMarketGrowth: 0.05,
  projectCogsRateWhenSalesZero: 0.68,
  otherCogsRateWhenSalesZero: 0.68,
  projectCogsRateToBase: 0.68,
  otherCogsRateToBase: 0.68,
  projectEmployeeSalaryShare: 0.95,
  otherEmployeeSalaryShare: 0.95,
  projectOfficerCompensationShare: 0.90,
  otherOfficerCompensationShare: 0.90,
  projectCogsDepreciationShare: 0.25,
  otherCogsDepreciationShare: 0.20,
  projectResearchDevelopmentRate: 0.005,
  otherResearchDevelopmentRate: 0.004,
  projectNonOperatingRate: 0,
  otherNonOperatingRate: -0.005,
  projectExtraordinaryRate: 0,
  otherExtraordinaryRate: 0,
  effectiveTaxRate: 0.30,
  projectSalesGrowthToBase: 0.21,
  projectFirstYearSales: 0,
  projectBaseYearSales: 0,
  projectCogsImprovementToBase: 0.07,
  projectPayGrowthToBase: 0.07,
  projectHeadcountGrowthToBase: 0.04,
  projectSgaImprovementToBase: 0.01,
  projectOfficerPayGrowthToBase: 0.06,
  otherSalesGrowthToBase: 0.04,
  otherCogsImprovementToBase: 0.005,
  otherPayGrowthToBase: 0.04,
  otherOfficerPayGrowthToBase: 0.04,
  otherHeadcountGrowthToBase: 0.01,
  otherSgaImprovementToBase: 0.005,
  projectSalesGrowth: 0.21,
  otherSalesGrowth: 0.06,
  projectCogsImprovementAfterBase: 0,
  otherCogsImprovement: 0.01,
  projectPayGrowth: 0.07,
  otherPayGrowth: 0.045,
  otherOfficerPayGrowth: 0.045,
  projectHeadcountGrowth: 0.04,
  otherHeadcountGrowth: 0.015,
  projectSgaRateEnd: 0.015,
  otherSgaRateEnd: 0.005,
  projectOfficerPayGrowth: 0.06,
  investment: okuToInternalMoney(45),
  subsidy: okuToInternalMoney(15),
  localBenchmark: 23,
};

const emptySegment = (): SegmentPlan => ({
  sales: 0,
  cogs: 0,
  employeePay: 0,
  officerPay: 0,
  depreciation: 0,
  cogsDepreciation: 0,
  sgaDepreciation: 0,
  otherSga: 0,
  headcount: 0,
  officerCount: 0,
});

export const basePlan: YearPlan = {
  year: DEFAULT_TIMELINE.latestYear,
  role: "latest",
  project: emptySegment(),
  other: emptySegment(),
};

export const defaultBalanceSheets: BalanceSheetPlan[] = [2023, 2024, 2025].map((year) => ({
  year,
  assets: 0,
  currentAssets: 0,
  cash: 0,
  fixedAssets: 0,
  tangibleAssets: 0,
  buildings: 0,
  machinery: 0,
  land: 0,
  intangibleAssets: 0,
  software: 0,
  liabilities: 0,
  currentLiabilities: 0,
  shortTermDebt: 0,
  fixedLiabilities: 0,
  longTermDebt: 0,
  netAssets: 0,
  shareholderEquity: 0,
  capital: 0,
  capex: 0,
}));

export const defaultDrivers: Drivers = {
  projectMarketGrowth: 0,
  projectCogsRateWhenSalesZero: 0,
  otherCogsRateWhenSalesZero: 0,
  projectCogsRateToBase: 0,
  otherCogsRateToBase: 0,
  projectEmployeeSalaryShare: 0,
  otherEmployeeSalaryShare: 0,
  projectOfficerCompensationShare: 0,
  otherOfficerCompensationShare: 0,
  projectCogsDepreciationShare: 0,
  otherCogsDepreciationShare: 0,
  projectResearchDevelopmentRate: 0,
  otherResearchDevelopmentRate: 0,
  projectNonOperatingRate: 0,
  otherNonOperatingRate: 0,
  projectExtraordinaryRate: 0,
  otherExtraordinaryRate: 0,
  effectiveTaxRate: 0,
  projectSalesGrowthToBase: 0,
  projectFirstYearSales: 0,
  projectBaseYearSales: 0,
  projectCogsImprovementToBase: 0,
  projectPayGrowthToBase: 0,
  projectHeadcountGrowthToBase: 0,
  projectSgaImprovementToBase: 0,
  projectOfficerPayGrowthToBase: 0,
  otherSalesGrowthToBase: 0,
  otherCogsImprovementToBase: 0,
  otherPayGrowthToBase: 0,
  otherOfficerPayGrowthToBase: 0,
  otherHeadcountGrowthToBase: 0,
  otherSgaImprovementToBase: 0,
  projectSalesGrowth: 0,
  otherSalesGrowth: 0,
  projectCogsImprovementAfterBase: 0,
  otherCogsImprovement: 0,
  projectPayGrowth: 0,
  otherPayGrowth: 0,
  otherOfficerPayGrowth: 0,
  projectHeadcountGrowth: 0,
  otherHeadcountGrowth: 0,
  projectSgaRateEnd: 0,
  otherSgaRateEnd: 0,
  projectOfficerPayGrowth: 0,
  investment: 0,
  subsidy: 0,
  localBenchmark: 0,
};

export const driverBounds: Record<keyof Drivers, [number, number]> = {
  projectMarketGrowth: [-0.05, 0.3],
  projectCogsRateWhenSalesZero: [0, 0.99],
  otherCogsRateWhenSalesZero: [0, 0.99],
  projectCogsRateToBase: [0, 0.99],
  otherCogsRateToBase: [0, 0.99],
  projectEmployeeSalaryShare: [0, 1],
  otherEmployeeSalaryShare: [0, 1],
  projectOfficerCompensationShare: [0, 1],
  otherOfficerCompensationShare: [0, 1],
  projectCogsDepreciationShare: [0, 1],
  otherCogsDepreciationShare: [0, 1],
  projectResearchDevelopmentRate: [0, 0.3],
  otherResearchDevelopmentRate: [0, 0.3],
  projectNonOperatingRate: [-0.5, 0.5],
  otherNonOperatingRate: [-0.5, 0.5],
  projectExtraordinaryRate: [-0.5, 0.5],
  otherExtraordinaryRate: [-0.5, 0.5],
  effectiveTaxRate: [0, 0.6],
  projectSalesGrowthToBase: [-0.05, 0.4],
  projectFirstYearSales: [0, okuToInternalMoney(100000)],
  projectBaseYearSales: [0, okuToInternalMoney(100000)],
  projectCogsImprovementToBase: [0, 0.02],
  projectPayGrowthToBase: [0, 0.1],
  projectHeadcountGrowthToBase: [-0.03, 0.2],
  projectSgaImprovementToBase: [0, 0.02],
  projectOfficerPayGrowthToBase: [0, 0.1],
  otherSalesGrowthToBase: [-0.1, 0.2],
  otherCogsImprovementToBase: [0, 0.02],
  otherPayGrowthToBase: [0, 0.08],
  otherOfficerPayGrowthToBase: [0, 0.08],
  otherHeadcountGrowthToBase: [-0.05, 0.1],
  otherSgaImprovementToBase: [0, 0.02],
  projectSalesGrowth: [-0.05, 0.4],
  otherSalesGrowth: [-0.1, 0.2],
  projectCogsImprovementAfterBase: [0, 0.03],
  otherCogsImprovement: [0, 0.03],
  projectPayGrowth: [0.045, 0.1],
  otherPayGrowth: [0, 0.08],
  otherOfficerPayGrowth: [0, 0.08],
  projectHeadcountGrowth: [-0.03, 0.2],
  otherHeadcountGrowth: [-0.05, 0.1],
  projectSgaRateEnd: [0, 0.03],
  otherSgaRateEnd: [0, 0.03],
  projectOfficerPayGrowth: [0, 0.1],
  investment: [okuToInternalMoney(15), okuToInternalMoney(200)],
  subsidy: [okuToInternalMoney(1), okuToInternalMoney(50)],
  localBenchmark: [0, 100],
};

export function suggestCogsRateRange(primaryRates: number[], fallbackRates: number[] = []) {
  const usable = (rates: number[]) => rates.filter((value) => Number.isFinite(value) && value > 0 && value < 1).slice(-3);
  const weightedAverage = (rates: number[]) => {
    const weights = [0.2, 0.3, 0.5].slice(3 - rates.length);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    return rates.reduce((sum, value, index) => sum + value * weights[index], 0) / weightTotal;
  };
  const makeRange = (rates: number[], minimumBuffer: number) => {
    const initial = weightedAverage(rates);
    const observedLower = Math.min(...rates);
    const observedUpper = Math.max(...rates);
    const buffer = Math.max((observedUpper - observedLower) * 0.5, minimumBuffer);
    return {
      initial: Math.min(0.99, Math.max(0, initial)),
      lower: Math.min(0.99, Math.max(0, observedLower - buffer)),
      upper: Math.min(0.99, Math.max(0, observedUpper + buffer)),
    };
  };
  const primary = usable(primaryRates);
  if (primary.length) return makeRange(primary, primary.length === 1 ? 0.03 : 0.02);
  const fallback = usable(fallbackRates);
  if (fallback.length) return makeRange(fallback, 0.05);
  return { initial: 0.68, lower: 0.58, upper: 0.78 };
}

export const metrics: MetricDefinition[] = [
  { key: "companySalesCagr", label: "全社年平均売上高成長率", unit: "%/年", round3Formula: "基準年前年→事業化報告3年目（4年CAGR）", round6Formula: "基準年→事業化報告3年目（3年CAGR）", defaultTarget: 21, rangeMax: 35, direction: "min", sourceRound: "過去中央値は第5次採択者21%（期間差に注意）" },
  { key: "companySalesIncrease", label: "全社売上高増加額", unit: "千円", round3Formula: "事業化報告3年目 − 基準年前年", round6Formula: "事業化報告3年目 − 基準年", defaultTarget: 0, direction: "min", sourceRound: "全社売上高成長率の目標と基準年売上高から規模連動で設定" },
  { key: "companyPaySchedule", label: "全社の従業員1人当たり給与支給総額の年平均上昇率（最新決算期→基準年度）", unit: "%/年", round3Formula: "従業員＋役員の合算1人当たり給与支給総額：最新決算期→基準年度の年率", round6Formula: "全社の従業員1人当たり給与支給総額：最新決算期→基準年度の年平均上昇率（基準年度の常時使用する従業員数（就業時間換算）が0の場合のみ役員で代替）", defaultTarget: 3.5, rangeMax: 7, direction: "min", sourceRound: "第6次の足下賃上げ評価" },
  { key: "projectSalesShare", label: "補助事業売上高／全社売上高", unit: "%", round3Formula: "事業化報告3年目の補助事業売上高 ÷ 同年全社売上高", round6Formula: "事業化報告3年目の補助事業売上高 ÷ 同年全社売上高", defaultTarget: 70, rangeMax: 95, direction: "range", sourceRound: "第5次平均89%を参考に範囲管理" },
  { key: "projectSalesCagr", label: "補助事業年平均売上高成長率", unit: "%/年", round3Formula: "基準年→事業化報告3年目（3年CAGR）", round6Formula: "基準年→事業化報告3年目（3年CAGR）", defaultTarget: 22, rangeMax: 35, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "projectSalesIncrease", label: "補助事業売上高増加額", unit: "千円", round3Formula: "事業化報告3年目 − 基準年", round6Formula: "事業化報告3年目 − 基準年", defaultTarget: 0, direction: "min", sourceRound: "補助事業売上高成長率の目標と基準年売上高から規模連動で設定" },
  { key: "laborProductivityCagr", label: "補助事業年平均労働生産性の伸び", unit: "%/年", round3Formula: "付加価値額÷（常時使用する従業員数（就業時間換算）＋役員数）の基準年→3年目CAGR", round6Formula: "付加価値額÷（常時使用する従業員数（就業時間換算）＋役員数）の基準年→3年目CAGR", defaultTarget: 21, rangeMax: 35, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "valueAddedIncrease", label: "補助事業付加価値増加額", unit: "千円", round3Formula: "3年目付加価値額 − 基準年付加価値額", round6Formula: "3年目付加価値額 − 基準年付加価値額", defaultTarget: 0, direction: "min", sourceRound: "労働生産性目標と基準年付加価値・人員計画から規模連動で設定" },
  { key: "employeePayCagr", label: "補助事業1人当たり給与支給総額の年平均上昇率", unit: "%/年", round3Formula: "従業員給与支給総額÷常時使用する従業員数（就業時間換算）の基準年度→事業化報告3年目（本モデルの最終年度）CAGR", round6Formula: "補助事業1人当たり給与支給総額の基準年度→事業化報告3年目（本モデルの最終年度）の年平均上昇率（基準年度の常時使用する従業員数（就業時間換算）が0の場合のみ役員で代替）", defaultTarget: 7, rangeMax: 10, direction: "min", sourceRound: "第6次要件は一般5.0%・100億宣言4.5%以上" },
  { key: "employeePayIncrease", label: "補助事業従業員給与支給総額の増加額", unit: "千円", round3Formula: "3年目従業員給与総額 − 基準年総額", round6Formula: "3年目従業員給与総額 − 基準年総額", defaultTarget: 0, direction: "min", sourceRound: "1人当たり給与上昇率目標と基準年給与・人員計画から規模連動で設定" },
  { key: "investmentSalesRatio", label: "投資額／全社売上高", unit: "%", round3Formula: "補助事業投資額 ÷ 最新決算期全社売上高", round6Formula: "補助事業投資額 ÷ 最新決算期全社売上高", defaultTarget: 30, rangeMax: 70, direction: "range", sourceRound: "第5次中央値61%を参考に範囲管理" },
  { key: "valueAddedSubsidyRatio", label: "付加価値増加額／補助金額", unit: "%", round3Formula: "基準年→3年目の付加価値増加額 ÷ 補助金額", round6Formula: "基準年→3年目の付加価値増加額 ÷ 補助金額", defaultTarget: 213, rangeMax: 350, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "localBenchmark", label: "ローカルベンチマーク財務分析結果", unit: "点", round3Formula: "ローカルベンチマーク入力値", round6Formula: "ローカルベンチマーク入力値", defaultTarget: 23, rangeMax: 40, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "officerPayCagr", label: "年平均役員目標賃上げ率", unit: "%/年", round3Formula: "役員給与総額÷役員数の基準年→3年目CAGR", round6Formula: "役員給与総額÷役員数の基準年→3年目CAGR（参考管理）", defaultTarget: 6, rangeMax: 10, direction: "min", sourceRound: "第6次評価対象外・参考値" },
  { key: "officerPayIncrease", label: "役員給与支給総額の増加額", unit: "千円", round3Formula: "3年目役員給与総額 − 基準年総額", round6Formula: "3年目役員給与総額 − 基準年総額（参考管理）", defaultTarget: 0, direction: "min", sourceRound: "第6次評価対象外・参考値" },
];

export const defaultTargets = Object.fromEntries(
  metrics.map((metric) => [
    metric.key,
    {
      value: metric.defaultTarget,
      max: metric.rangeMax,
      policy: metric.key === "investmentSalesRatio" || metric.key === "projectSalesShare" || isOptimizationExcludedMetric(metric.key) ? "monitor" : "soft",
      weight: 1,
    },
  ]),
) as Record<MetricKey, Target>;

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;
const round = (value: number) => normalizeInternalMoney(value);

export const employeeSalary = (segment: SegmentPlan) => segment.employeeSalary ?? segment.employeePay;
export const employeeBonus = (segment: SegmentPlan) => segment.employeeBonus ?? 0;
export const officerCompensation = (segment: SegmentPlan) => segment.officerCompensation ?? segment.officerPay;
export const officerBonus = (segment: SegmentPlan) => segment.officerBonus ?? 0;
export const cogsDepreciation = (segment: SegmentPlan) => segment.cogsDepreciation ?? 0;
export const sgaDepreciation = (segment: SegmentPlan) => segment.sgaDepreciation ?? 0;
export const researchDevelopment = (segment: SegmentPlan) => segment.researchDevelopment ?? 0;
export const ordinaryIncome = (segment: SegmentPlan) => segment.ordinaryIncome ?? operatingProfit(segment);
export const preTaxIncome = (segment: SegmentPlan) => segment.preTaxIncome ?? ordinaryIncome(segment);
// 当期純利益が未入力の過去セグメントには、税率を暗黙適用しない。
// 将来値は withDriverBreakdowns で明示した実効税率から必ず設定する。
export const netIncome = (segment: SegmentPlan) => segment.netIncome ?? 0;
export const nonOperatingProfitLoss = (segment: SegmentPlan) => ordinaryIncome(segment) - operatingProfit(segment);
export const extraordinaryProfitLoss = (segment: SegmentPlan) => preTaxIncome(segment) - ordinaryIncome(segment);

export function operatingProfit(segment: SegmentPlan) {
  return segment.sales - segment.cogs - segment.employeePay - segment.officerPay
    - sgaDepreciation(segment) - researchDevelopment(segment) - segment.otherSga;
}

export const employeePayrollTotal = (segment: SegmentPlan) => segment.employeePayrollTotal ?? segment.employeePay;
export const officerPayrollTotal = (segment: SegmentPlan) => segment.officerPayrollTotal ?? segment.officerPay;

export function valueAdded(segment: SegmentPlan) {
  return operatingProfit(segment) + employeePayrollTotal(segment) + officerPayrollTotal(segment) + segment.depreciation;
}

export function total(a: SegmentPlan, b: SegmentPlan): SegmentPlan {
  const combined: SegmentPlan = {
    sales: a.sales + b.sales,
    cogs: a.cogs + b.cogs,
    employeePay: a.employeePay + b.employeePay,
    officerPay: a.officerPay + b.officerPay,
    depreciation: a.depreciation + b.depreciation,
    otherSga: a.otherSga + b.otherSga,
    headcount: a.headcount + b.headcount,
    officerCount: a.officerCount + b.officerCount,
    employeeSalary: employeeSalary(a) + employeeSalary(b),
    employeeBonus: employeeBonus(a) + employeeBonus(b),
    officerCompensation: officerCompensation(a) + officerCompensation(b),
    officerBonus: officerBonus(a) + officerBonus(b),
    cogsDepreciation: cogsDepreciation(a) + cogsDepreciation(b),
    sgaDepreciation: sgaDepreciation(a) + sgaDepreciation(b),
    researchDevelopment: researchDevelopment(a) + researchDevelopment(b),
    ordinaryIncome: ordinaryIncome(a) + ordinaryIncome(b),
    preTaxIncome: preTaxIncome(a) + preTaxIncome(b),
    netIncome: netIncome(a) + netIncome(b),
  };
  if (a.employeePayrollTotal !== undefined || b.employeePayrollTotal !== undefined) {
    combined.employeePayrollTotal = employeePayrollTotal(a) + employeePayrollTotal(b);
  }
  if (a.officerPayrollTotal !== undefined || b.officerPayrollTotal !== undefined) {
    combined.officerPayrollTotal = officerPayrollTotal(a) + officerPayrollTotal(b);
  }
  return combined;
}

export function calculateScaleDependentTargetDefaults(
  plan: YearPlan[],
  targets: Record<MetricKey, Target>,
): Partial<Record<MetricKey, { value: number; max: number }>> {
  const base = plan.find((row) => row.role === "base");
  const report3 = plan.find((row) => row.role === "report3");
  if (!base || !report3) return {};
  const companyBase = total(base.project, base.other);
  const years = Math.max(1, report3.year - base.year);
  const increaseByRate = (baseValue: number, annualRate: number) => Math.max(0, baseValue * ((1 + annualRate / 100) ** years - 1));
  const ratePair = (key: MetricKey) => [targets[key].value, targets[key].max ?? targets[key].value] as const;
  const pair = (calculator: (annualRate: number) => number, rateKey: MetricKey) => {
    const [lowerRate, upperRate] = ratePair(rateKey);
    const value = round(calculator(lowerRate));
    const max = round(Math.max(value, calculator(upperRate)));
    return { value, max };
  };
  const projectBasePeople = base.project.headcount + base.project.officerCount;
  const projectReportPeople = report3.project.headcount + report3.project.officerCount;
  const baseProductivity = projectBasePeople ? valueAdded(base.project) / projectBasePeople : 0;
  const valueAddedIncrease = (annualRate: number) => Math.max(0, baseProductivity * (1 + annualRate / 100) ** years * projectReportPeople - valueAdded(base.project));
  const employeePayIncrease = (annualRate: number) => base.project.headcount
    ? Math.max(0, base.project.employeePay / base.project.headcount * (1 + annualRate / 100) ** years * report3.project.headcount - base.project.employeePay)
    : 0;
  return {
    companySalesIncrease: pair((rate) => increaseByRate(companyBase.sales, rate), "companySalesCagr"),
    projectSalesIncrease: pair((rate) => increaseByRate(base.project.sales, rate), "projectSalesCagr"),
    valueAddedIncrease: pair(valueAddedIncrease, "laborProductivityCagr"),
    employeePayIncrease: pair(employeePayIncrease, "employeePayCagr"),
  };
}

export function normalizeTimeline(settings: TimelineSettings): TimelineSettings {
  const latestYear = Math.round(settings.latestYear);
  const baseYear = Math.min(latestYear + 6, Math.max(latestYear + 1, Math.round(settings.baseYear)));
  return { latestYear, baseYear };
}

export function roleForYear(year: number, settings: TimelineSettings): YearRole {
  const { latestYear, baseYear } = normalizeTimeline(settings);
  if (year === latestYear - 2) return "prePrevious";
  if (year === latestYear - 1) return "previous";
  if (year === latestYear) return "latest";
  if (year === baseYear - 1) return "beforeBase";
  if (year === baseYear) return "base";
  if (year === baseYear + 1) return "report1";
  if (year === baseYear + 2) return "report2";
  if (year === baseYear + 3) return "report3";
  return "projectPeriod";
}

function scaleSegment(segment: SegmentPlan, factor: number): SegmentPlan {
  const scaled: SegmentPlan = {
    sales: round(segment.sales * factor),
    cogs: round(segment.cogs * factor),
    employeePay: round(segment.employeePay * factor),
    officerPay: round(segment.officerPay * factor),
    depreciation: round(segment.depreciation * factor),
    otherSga: round(segment.otherSga * factor),
    headcount: Math.max(0, Math.round(segment.headcount * factor)),
    officerCount: Math.max(0, Math.round(segment.officerCount)),
  };
  if (segment.employeeSalary !== undefined || segment.employeeBonus !== undefined) {
    scaled.employeeSalary = round(employeeSalary(segment) * factor);
    scaled.employeeBonus = round(employeeBonus(segment) * factor);
  }
  if (segment.officerCompensation !== undefined || segment.officerBonus !== undefined) {
    scaled.officerCompensation = round(officerCompensation(segment) * factor);
    scaled.officerBonus = round(officerBonus(segment) * factor);
  }
  if (segment.cogsDepreciation !== undefined || segment.sgaDepreciation !== undefined) {
    scaled.cogsDepreciation = round(cogsDepreciation(segment) * factor);
    scaled.sgaDepreciation = round(sgaDepreciation(segment) * factor);
  }
  if (segment.researchDevelopment !== undefined) scaled.researchDevelopment = round(researchDevelopment(segment) * factor);
  if (segment.ordinaryIncome !== undefined) scaled.ordinaryIncome = round(segment.ordinaryIncome * factor);
  if (segment.preTaxIncome !== undefined) scaled.preTaxIncome = round(segment.preTaxIncome * factor);
  if (segment.netIncome !== undefined) scaled.netIncome = round(segment.netIncome * factor);
  if (segment.employeePayrollTotal !== undefined) {
    scaled.employeePayrollTotal = round(segment.employeePayrollTotal * factor);
  }
  if (segment.officerPayrollTotal !== undefined) {
    scaled.officerPayrollTotal = round(segment.officerPayrollTotal * factor);
  }
  return scaled;
}

function withProportionalBreakdown(source: SegmentPlan, target: SegmentPlan): SegmentPlan {
  const result = { ...target };
  if (source.employeeSalary !== undefined || source.employeeBonus !== undefined) {
    const salaryShare = source.employeePay ? employeeSalary(source) / source.employeePay : 1;
    result.employeeSalary = round(target.employeePay * salaryShare);
    result.employeeBonus = round(target.employeePay - result.employeeSalary);
  }
  if (source.officerCompensation !== undefined || source.officerBonus !== undefined) {
    const compensationShare = source.officerPay ? officerCompensation(source) / source.officerPay : 1;
    result.officerCompensation = round(target.officerPay * compensationShare);
    result.officerBonus = round(target.officerPay - result.officerCompensation);
  }
  if (source.cogsDepreciation !== undefined || source.sgaDepreciation !== undefined) {
    const cogsShare = source.depreciation ? cogsDepreciation(source) / source.depreciation : 0;
    result.cogsDepreciation = round(target.depreciation * cogsShare);
    result.sgaDepreciation = round(target.depreciation - result.cogsDepreciation);
  }
  if (source.researchDevelopment !== undefined) {
    const salesFactor = source.sales ? target.sales / source.sales : 1;
    result.researchDevelopment = round(researchDevelopment(source) * salesFactor);
  }
  return result;
}

function withDriverBreakdowns(segment: SegmentPlan, drivers: Drivers, segmentKey: SegmentKey): SegmentPlan {
  const employeeSalaryShare = segmentKey === "project" ? drivers.projectEmployeeSalaryShare : drivers.otherEmployeeSalaryShare;
  const officerCompensationShare = segmentKey === "project" ? drivers.projectOfficerCompensationShare : drivers.otherOfficerCompensationShare;
  const cogsDepreciationShare = Math.max(0, Math.min(1,
    segmentKey === "project" ? drivers.projectCogsDepreciationShare : drivers.otherCogsDepreciationShare,
  ));
  const researchDevelopmentRate = segmentKey === "project" ? drivers.projectResearchDevelopmentRate : drivers.otherResearchDevelopmentRate;
  const nonOperatingRate = segmentKey === "project" ? drivers.projectNonOperatingRate : drivers.otherNonOperatingRate;
  const extraordinaryRate = segmentKey === "project" ? drivers.projectExtraordinaryRate : drivers.otherExtraordinaryRate;
  const totalDepreciation = round(segment.depreciation);
  const depreciationInCogs = round(totalDepreciation * cogsDepreciationShare);
  const result: SegmentPlan = {
    ...segment,
    employeeSalary: round(segment.employeePay * employeeSalaryShare),
    employeeBonus: round(segment.employeePay * (1 - employeeSalaryShare)),
    officerCompensation: round(segment.officerPay * officerCompensationShare),
    officerBonus: round(segment.officerPay * (1 - officerCompensationShare)),
    cogsDepreciation: depreciationInCogs,
    sgaDepreciation: round(totalDepreciation - depreciationInCogs),
    researchDevelopment: round(segment.sales * researchDevelopmentRate),
  };
  result.depreciation = totalDepreciation;
  result.ordinaryIncome = round(operatingProfit(result) + result.sales * nonOperatingRate);
  result.preTaxIncome = round(result.ordinaryIncome + result.sales * extraordinaryRate);
  result.netIncome = round(result.preTaxIncome * (1 - drivers.effectiveTaxRate));
  return result;
}

export function sellingGeneralAdministrativeExpenses(segment: SegmentPlan): number {
  return segment.employeePay
    + segment.officerPay
    + sgaDepreciation(segment)
    + researchDevelopment(segment)
    + segment.otherSga;
}

function withLatestExpenseDepreciationRatios(
  latest: SegmentPlan,
  target: SegmentPlan,
  drivers: Drivers,
  segmentKey: SegmentKey,
): SegmentPlan {
  const targetWithoutDepreciation = withDriverBreakdowns({
    ...target,
    depreciation: 0,
    cogsDepreciation: 0,
    sgaDepreciation: 0,
  }, drivers, segmentKey);
  const cogsRate = latest.cogs > 0 ? cogsDepreciation(latest) / latest.cogs : 0;
  const latestSga = sellingGeneralAdministrativeExpenses(latest);
  const sgaRate = latestSga > 0 ? sgaDepreciation(latest) / latestSga : 0;
  const targetSgaWithoutDepreciation =
    targetWithoutDepreciation.employeePay
    + targetWithoutDepreciation.officerPay
    + researchDevelopment(targetWithoutDepreciation)
    + targetWithoutDepreciation.otherSga;
  const nextCogsDepreciation = round(targetWithoutDepreciation.cogs * cogsRate);
  const nextSgaDepreciation = round(
    sgaRate > 0 && sgaRate < 1 ? targetSgaWithoutDepreciation * sgaRate / (1 - sgaRate) : 0,
  );
  return withDriverBreakdowns({
    ...targetWithoutDepreciation,
    cogsDepreciation: nextCogsDepreciation,
    sgaDepreciation: nextSgaDepreciation,
    depreciation: round(nextCogsDepreciation + nextSgaDepreciation),
  }, drivers, segmentKey);
}

function historicalSegmentWithPayGrowth(segment: SegmentPlan, factor: number, yearsBeforeLatest: number): SegmentPlan {
  const scaled = scaleSegment(segment, factor);
  if (segment.headcount > 0) {
    const latestPayPerEmployee = segment.employeePay / segment.headcount;
    scaled.employeePay = round(scaled.headcount * latestPayPerEmployee / 1.02 ** yearsBeforeLatest);
  }
  return withProportionalBreakdown(segment, scaled);
}

export function createHistoricalPlan(latest: YearPlan = basePlan, settings: TimelineSettings = DEFAULT_TIMELINE): YearPlan[] {
  const timeline = normalizeTimeline(settings);
  return [
    { year: timeline.latestYear - 2, role: "prePrevious", project: historicalSegmentWithPayGrowth(latest.project, 0.9, 2), other: historicalSegmentWithPayGrowth(latest.other, 0.92, 2) },
    { year: timeline.latestYear - 1, role: "previous", project: historicalSegmentWithPayGrowth(latest.project, 0.95, 1), other: historicalSegmentWithPayGrowth(latest.other, 0.96, 1) },
    { ...structuredClone(latest), year: timeline.latestYear, role: "latest" },
  ];
}

export function retimeHistoricalPlan(historical: YearPlan[], settings: TimelineSettings): YearPlan[] {
  const timeline = normalizeTimeline(settings);
  return historical.slice(0, 3).map((row, index) => ({
    ...structuredClone(row),
    year: timeline.latestYear - 2 + index,
    role: (["prePrevious", "previous", "latest"] as YearRole[])[index],
  }));
}

export function retimeBalanceSheets(balanceSheets: BalanceSheetPlan[], settings: TimelineSettings): BalanceSheetPlan[] {
  const timeline = normalizeTimeline(settings);
  return balanceSheets.slice(0, 3).map((row, index) => ({
    ...structuredClone(row),
    year: timeline.latestYear - 2 + index,
  }));
}

export function balanceSheetDerived(row: BalanceSheetPlan, ebitda: number) {
  const interestBearingDebt = row.shortTermDebt + row.longTermDebt;
  return {
    otherAssets: row.assets - row.currentAssets - row.fixedAssets,
    liabilitiesAndNetAssets: row.liabilities + row.netAssets,
    otherLiabilities: row.liabilities - row.currentLiabilities - row.fixedLiabilities,
    otherNetAssets: row.netAssets - row.shareholderEquity,
    equityRatio: row.liabilities + row.netAssets ? row.netAssets / (row.liabilities + row.netAssets) * 100 : 0,
    ebitdaDebtMultiple: ebitda ? (interestBearingDebt - row.cash) / ebitda : 0,
  };
}

export function createProjectPeriodInputs(settings: TimelineSettings = DEFAULT_TIMELINE, baseInput: SegmentPlan = defaultProjectBasePlan): ProjectPeriodInput[] {
  const timeline = normalizeTimeline(settings);
  const years = timeline.baseYear - timeline.latestYear;
  return Array.from({ length: years }, (_, index) => {
    const progress = (index + 1) / years;
    return { year: timeline.latestYear + index + 1, project: scaleSegment(baseInput, progress) };
  });
}

/**
 * 最新実績を起点に、調整水準を補助事業期間へ段階的に反映する。
 * createProjectPeriodInputs は旧サンプル互換用に残し、画面の自動予測はこちらを使う。
 */
export function createForecastProjectPeriodInputs(
  latest: YearPlan,
  drivers: Drivers,
  settings: TimelineSettings = DEFAULT_TIMELINE,
): ProjectPeriodInput[] {
  const timeline = normalizeTimeline(settings);
  const years = timeline.baseYear - timeline.latestYear;
  const start = latest.project;
  const startCogsRate = Number.isFinite(drivers.projectCogsRateToBase)
    ? drivers.projectCogsRateToBase
    : (start.sales ? start.cogs / start.sales : drivers.projectCogsRateWhenSalesZero);
  const startSgaRate = start.sales ? start.otherSga / start.sales : 0;
  const startPayPerHead = start.headcount ? start.employeePay / start.headcount : 0;

  return Array.from({ length: years }, (_, index) => {
    const elapsed = index + 1;
    const progress = elapsed / years;
    const cogsRate = Math.min(0.99, Math.max(0.01, startCogsRate - drivers.projectCogsImprovementToBase * index));
    const sales = start.sales > 0
      ? start.sales * (1 + drivers.projectSalesGrowthToBase) ** elapsed
      : years === 1
        ? drivers.projectBaseYearSales
        : index === years - 1
          ? drivers.projectBaseYearSales
          : index === 0
            ? drivers.projectFirstYearSales
            : 0;
    const headcount = start.headcount * (1 + drivers.projectHeadcountGrowthToBase) ** elapsed;
    return {
      year: timeline.latestYear + elapsed,
      project: withLatestExpenseDepreciationRatios(start, withProportionalBreakdown(start, {
        sales: round(sales),
        cogs: round(sales * cogsRate),
        employeePay: round(startPayPerHead * (1 + drivers.projectPayGrowthToBase) ** elapsed * headcount),
        officerPay: round(start.officerPay * (1 + drivers.projectOfficerPayGrowthToBase) ** elapsed),
        depreciation: 0,
        cogsDepreciation: 0,
        sgaDepreciation: 0,
        otherSga: round(sales * lerp(startSgaRate, Math.max(0, startSgaRate - drivers.projectSgaImprovementToBase), progress)),
        headcount: Math.max(0, Math.round(headcount)),
        officerCount: Math.max(0, Math.round(start.officerCount)),
      }), drivers, "project"),
    };
  });
}

export function retimeProjectPeriodInputs(inputs: ProjectPeriodInput[], settings: TimelineSettings): ProjectPeriodInput[] {
  const defaults = createProjectPeriodInputs(settings, inputs.at(-1)?.project ?? defaultProjectBasePlan);
  return defaults.map((row, index) => ({ ...row, project: structuredClone(inputs[index]?.project ?? row.project) }));
}

export function generatePlan(
  historical: YearPlan[],
  drivers: Drivers,
  settings: TimelineSettings = DEFAULT_TIMELINE,
  projectPeriodInput: SegmentPlan | ProjectPeriodInput[] = defaultProjectBasePlan,
): YearPlan[] {
  const timeline = normalizeTimeline(settings);
  const actuals = retimeHistoricalPlan(historical, timeline);
  const latest = actuals[2];
  const periodInputs = Array.isArray(projectPeriodInput)
    ? retimeProjectPeriodInputs(projectPeriodInput, timeline)
    : createProjectPeriodInputs(timeline, projectPeriodInput);
  const projectBase = structuredClone(periodInputs.at(-1)?.project ?? defaultProjectBasePlan);
  const plan: YearPlan[] = structuredClone(actuals);
  const n = timeline.baseYear + 3 - timeline.latestYear;
  const projectPostBaseInitialCogsRate = drivers.projectCogsRateWhenSalesZero;
  const historicalOtherCogsRate = latest.other.sales ? latest.other.cogs / latest.other.sales : drivers.otherCogsRateWhenSalesZero;
  const otherEquipmentCogsRate = Number.isFinite(drivers.otherCogsRateToBase)
    ? drivers.otherCogsRateToBase
    : historicalOtherCogsRate;
  const yearsToBase = timeline.baseYear - timeline.latestYear;
  const otherBaseSales = latest.other.sales * (1 + drivers.otherSalesGrowthToBase) ** yearsToBase;
  const otherBaseHeadcount = latest.other.headcount * (1 + drivers.otherHeadcountGrowthToBase) ** yearsToBase;
  const otherBasePayPerHead = latest.other.headcount ? latest.other.employeePay / latest.other.headcount : 0;
  const otherBaseEmployeePay = otherBasePayPerHead * (1 + drivers.otherPayGrowthToBase) ** yearsToBase * otherBaseHeadcount;
  const otherBaseOfficerPay = latest.other.officerPay * (1 + drivers.otherOfficerPayGrowthToBase) ** yearsToBase;
  const latestOtherSgaRate = latest.other.sales ? latest.other.otherSga / latest.other.sales : 0;
  const otherBaseSgaRate = Math.min(0.99, Math.max(0, latestOtherSgaRate - drivers.otherSgaImprovementToBase));
  const baseProjectSgaRate = projectBase.sales ? projectBase.otherSga / projectBase.sales : 0;
  const projectSgaRateEnd = Math.min(0.99, Math.max(0, baseProjectSgaRate - drivers.projectSgaRateEnd));
  const otherSgaRateEnd = Math.min(0.99, Math.max(0, otherBaseSgaRate - drivers.otherSgaRateEnd));
  const baseProjectPayPerHead = projectBase.headcount ? projectBase.employeePay / projectBase.headcount : 0;
  const emptyProject: SegmentPlan = { sales: 0, cogs: 0, employeePay: 0, officerPay: 0, depreciation: 0, cogsDepreciation: 0, sgaDepreciation: 0, otherSga: 0, headcount: 0, officerCount: 0 };

  for (let i = 1; i <= n; i += 1) {
    const year = timeline.latestYear + i;
    const role = roleForYear(year, timeline);
    const yearsAfterBase = Math.max(0, year - timeline.baseYear);
    const beforeOrAtBase = year <= timeline.baseYear;
    const otherProgress = beforeOrAtBase ? i / yearsToBase : yearsAfterBase / 3;
    const projectProgress = yearsAfterBase / 3;
    const projectHeadcount = projectBase.headcount * (1 + drivers.projectHeadcountGrowth) ** yearsAfterBase;
    const otherHeadcount = beforeOrAtBase
      ? latest.other.headcount * (1 + drivers.otherHeadcountGrowthToBase) ** i
      : otherBaseHeadcount * (1 + drivers.otherHeadcountGrowth) ** yearsAfterBase;
    const projectSales = projectBase.sales * (1 + drivers.projectSalesGrowth) ** yearsAfterBase;
    const otherSales = beforeOrAtBase
      ? latest.other.sales * (1 + drivers.otherSalesGrowthToBase) ** i
      : otherBaseSales * (1 + drivers.otherSalesGrowth) ** yearsAfterBase;
    const otherCogsRate = beforeOrAtBase
      ? Math.min(0.99, Math.max(0.01, otherEquipmentCogsRate - drivers.otherCogsImprovementToBase * (i - 1)))
      : Math.min(0.99, Math.max(0.01, drivers.otherCogsRateWhenSalesZero - drivers.otherCogsImprovement * Math.max(0, yearsAfterBase - 1)));
    const otherEmployeePay = beforeOrAtBase
      ? otherBasePayPerHead * (1 + drivers.otherPayGrowthToBase) ** i * otherHeadcount
      : (otherBaseHeadcount ? otherBaseEmployeePay / otherBaseHeadcount : 0) * (1 + drivers.otherPayGrowth) ** yearsAfterBase * otherHeadcount;
    const otherOfficerPay = beforeOrAtBase
      ? latest.other.officerPay * (1 + drivers.otherOfficerPayGrowthToBase) ** i
      : otherBaseOfficerPay * (1 + drivers.otherOfficerPayGrowth) ** yearsAfterBase;
    const otherSgaRate = beforeOrAtBase
      ? lerp(latestOtherSgaRate, otherBaseSgaRate, otherProgress)
      : lerp(otherBaseSgaRate, otherSgaRateEnd, otherProgress);
    const enteredProject = periodInputs.find((row) => row.year === year)?.project;
    const rawProject = year <= timeline.baseYear ? structuredClone(enteredProject ?? emptyProject) : withLatestExpenseDepreciationRatios(latest.project, withProportionalBreakdown(projectBase, {
      sales: round(projectSales),
      cogs: round(projectSales * Math.min(0.99, Math.max(0.01, projectPostBaseInitialCogsRate - drivers.projectCogsImprovementAfterBase * Math.max(0, yearsAfterBase - 1)))),
      employeePay: round(baseProjectPayPerHead * (1 + drivers.projectPayGrowth) ** yearsAfterBase * projectHeadcount),
      officerPay: round(projectBase.officerPay * (1 + drivers.projectOfficerPayGrowth) ** yearsAfterBase),
      depreciation: 0,
      cogsDepreciation: 0,
      sgaDepreciation: 0,
      otherSga: round(projectSales * lerp(baseProjectSgaRate, projectSgaRateEnd, projectProgress)),
      headcount: Math.max(0, Math.round(projectHeadcount)),
      officerCount: Math.max(0, Math.round(projectBase.officerCount)),
    }), drivers, "project");
    const project = withDriverBreakdowns(rawProject, drivers, "project");
    const other = withLatestExpenseDepreciationRatios(latest.other, withProportionalBreakdown(latest.other, {
      sales: round(otherSales),
      cogs: round(otherSales * otherCogsRate),
      employeePay: round(otherEmployeePay),
      officerPay: round(otherOfficerPay),
      depreciation: 0,
      cogsDepreciation: 0,
      sgaDepreciation: 0,
      otherSga: round(otherSales * otherSgaRate),
      headcount: Math.max(0, Math.round(otherHeadcount)),
      officerCount: Math.max(0, Math.round(latest.other.officerCount)),
    }), drivers, "other");
    plan.push({
      year,
      role,
      project,
      other,
    });
  }
  return plan;
}

const cagr = (start: number, end: number, years: number) =>
  start > 0 && end >= 0 ? ((end / start) ** (1 / years) - 1) * 100 : Number.NaN;

export function calculateMetrics(plan: YearPlan[], drivers: Drivers): Record<MetricKey, number> {
  const latest = plan.find((row) => row.role === "latest")!;
  const base = plan.find((row) => row.role === "base")!;
  const report3 = plan.find((row) => row.role === "report3")!;
  const latestCompany = total(latest.project, latest.other);
  const baseCompany = total(base.project, base.other);
  const report3Company = total(report3.project, report3.other);
  const companyPayUsesEmployees = baseCompany.headcount > 0;
  const latestCompanyPay = companyPayUsesEmployees
    ? latestCompany.employeePay / latestCompany.headcount
    : latestCompany.officerPay / latestCompany.officerCount;
  const baseCompanyPay = companyPayUsesEmployees
    ? baseCompany.employeePay / baseCompany.headcount
    : baseCompany.officerPay / baseCompany.officerCount;
  const projectPayUsesEmployees = base.project.headcount > 0;
  const baseProjectPay = projectPayUsesEmployees
    ? base.project.employeePay / base.project.headcount
    : base.project.officerPay / base.project.officerCount;
  const report3ProjectPay = projectPayUsesEmployees
    ? report3.project.employeePay / report3.project.headcount
    : report3.project.officerPay / report3.project.officerCount;
  const baseOfficerPay = base.project.officerPay / base.project.officerCount;
  const report3OfficerPay = report3.project.officerPay / report3.project.officerCount;
  const baseProductivity = valueAdded(base.project) / (base.project.headcount + base.project.officerCount);
  const report3Productivity = valueAdded(report3.project) / (report3.project.headcount + report3.project.officerCount);
  const vaIncrease = valueAdded(report3.project) - valueAdded(base.project);

  return {
    companySalesCagr: cagr(baseCompany.sales, report3Company.sales, 3),
    companySalesIncrease: report3Company.sales - baseCompany.sales,
    companyPaySchedule: cagr(latestCompanyPay, baseCompanyPay, base.year - latest.year),
    projectSalesShare: (report3.project.sales / report3Company.sales) * 100,
    projectSalesCagr: cagr(base.project.sales, report3.project.sales, 3),
    projectSalesIncrease: report3.project.sales - base.project.sales,
    laborProductivityCagr: cagr(baseProductivity, report3Productivity, 3),
    valueAddedIncrease: vaIncrease,
    employeePayCagr: cagr(baseProjectPay, report3ProjectPay, 3),
    employeePayIncrease: report3.project.employeePay - base.project.employeePay,
    officerPayCagr: cagr(baseOfficerPay, report3OfficerPay, 3),
    officerPayIncrease: report3.project.officerPay - base.project.officerPay,
    investmentSalesRatio: (drivers.investment / latestCompany.sales) * 100,
    valueAddedSubsidyRatio: drivers.subsidy > 0 ? (vaIncrease / drivers.subsidy) * 100 : Number.NaN,
    localBenchmark: drivers.localBenchmark,
  };
}

export type HistoricalMetricComparison = Record<MetricKey, [number, number]>;
export type HistoricalSeries = {
  mode: "change" | "level" | "unavailable";
  values: [number, number, number];
  referenceLevels?: [number, number, number];
};

export function calculateHistoricalMetricComparisons(
  historical: YearPlan[],
  balanceSheets: BalanceSheetPlan[],
): HistoricalMetricComparison {
  const compare = (start: YearPlan, end: YearPlan, endBalance?: BalanceSheetPlan): Record<MetricKey, number> => {
    const startCompany = total(start.project, start.other);
    const endCompany = total(end.project, end.other);
    const companyUsesEmployees = endCompany.headcount > 0;
    const startCompanyPay = companyUsesEmployees
      ? startCompany.employeePay / startCompany.headcount
      : startCompany.officerPay / startCompany.officerCount;
    const endCompanyPay = companyUsesEmployees
      ? endCompany.employeePay / endCompany.headcount
      : endCompany.officerPay / endCompany.officerCount;
    const projectUsesEmployees = end.project.headcount > 0;
    const startProjectPay = projectUsesEmployees
      ? start.project.employeePay / start.project.headcount
      : start.project.officerPay / start.project.officerCount;
    const endProjectPay = projectUsesEmployees
      ? end.project.employeePay / end.project.headcount
      : end.project.officerPay / end.project.officerCount;
    const startProductivity = valueAdded(start.project) / (start.project.headcount + start.project.officerCount);
    const endProductivity = valueAdded(end.project) / (end.project.headcount + end.project.officerCount);

    return {
      companySalesCagr: cagr(startCompany.sales, endCompany.sales, 1),
      companySalesIncrease: endCompany.sales - startCompany.sales,
      companyPaySchedule: cagr(startCompanyPay, endCompanyPay, 1),
      projectSalesShare: endCompany.sales ? (end.project.sales / endCompany.sales) * 100 : Number.NaN,
      projectSalesCagr: cagr(start.project.sales, end.project.sales, 1),
      projectSalesIncrease: end.project.sales - start.project.sales,
      laborProductivityCagr: cagr(startProductivity, endProductivity, 1),
      valueAddedIncrease: valueAdded(end.project) - valueAdded(start.project),
      employeePayCagr: cagr(startProjectPay, endProjectPay, 1),
      employeePayIncrease: end.project.employeePay - start.project.employeePay,
      officerPayCagr: cagr(start.project.officerPay / start.project.officerCount, end.project.officerPay / end.project.officerCount, 1),
      officerPayIncrease: end.project.officerPay - start.project.officerPay,
      investmentSalesRatio: endBalance?.capex > 0 && endCompany.sales ? (endBalance.capex / endCompany.sales) * 100 : Number.NaN,
      valueAddedSubsidyRatio: Number.NaN,
      localBenchmark: Number.NaN,
    };
  };

  const first = compare(historical[0], historical[1], balanceSheets[1]);
  const second = compare(historical[1], historical[2], balanceSheets[2]);
  return Object.fromEntries(metrics.map((metric) => [metric.key, [first[metric.key], second[metric.key]]])) as HistoricalMetricComparison;
}

export function calculateHistoricalMetricSeries(
  historical: YearPlan[],
  balanceSheets: BalanceSheetPlan[],
): Record<MetricKey, HistoricalSeries> {
  const comparisons = calculateHistoricalMetricComparisons(historical, balanceSheets);
  const companyAt = (index: number) => total(historical[index].project, historical[index].other);
  const projectSalesShare = historical.map((row, index) => {
    const company = companyAt(index);
    return company.sales ? (row.project.sales / company.sales) * 100 : Number.NaN;
  }) as [number, number, number];
  const investmentSalesRatio = historical.map((_, index) => {
    const company = companyAt(index);
    return company.sales && balanceSheets[index]?.capex > 0 ? (balanceSheets[index].capex / company.sales) * 100 : Number.NaN;
  }) as [number, number, number];

  return Object.fromEntries(metrics.map((metric) => {
    if (metric.key === "projectSalesShare") return [metric.key, { mode: "level", values: projectSalesShare }];
    if (metric.key === "investmentSalesRatio") return [metric.key, { mode: "level", values: investmentSalesRatio }];
    if (metric.key === "valueAddedSubsidyRatio" || metric.key === "localBenchmark") {
      return [metric.key, { mode: "unavailable", values: [Number.NaN, Number.NaN, Number.NaN] }];
    }
    const [first, second] = comparisons[metric.key];
    return [metric.key, { mode: "change", values: [Number.NaN, first, second] }];
  })) as Record<MetricKey, HistoricalSeries>;
}

export function calculateHistoricalDriverSeries(
  historical: YearPlan[],
  balanceSheets: BalanceSheetPlan[],
): Record<keyof Drivers, HistoricalSeries> {
  const change = (start: number, end: number) => start ? end / start - 1 : Number.NaN;
  const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : Number.NaN;
  const perEmployee = (segment: SegmentPlan) => ratio(segment.employeePay, segment.headcount);
  const perOfficer = (segment: SegmentPlan) => ratio(segment.officerPay, segment.officerCount);
  const changes = (value: (row: YearPlan) => number): [number, number, number] => [
    Number.NaN,
    change(value(historical[0]), value(historical[1])),
    change(value(historical[1]), value(historical[2])),
  ];
  const improvements = (value: (row: YearPlan) => number): [number, number, number] => [
    Number.NaN,
    value(historical[0]) - value(historical[1]),
    value(historical[1]) - value(historical[2]),
  ];
  const levels = (value: (row: YearPlan, index: number) => number): [number, number, number] => [
    value(historical[0], 0), value(historical[1], 1), value(historical[2], 2),
  ];
  const unavailable = (): HistoricalSeries => ({ mode: "unavailable", values: [Number.NaN, Number.NaN, Number.NaN] });

  return {
    projectMarketGrowth: unavailable(),
    projectCogsRateWhenSalesZero: { mode: "level", values: levels((row) => ratio(row.project.cogs, row.project.sales)) },
    otherCogsRateWhenSalesZero: { mode: "level", values: levels((row) => ratio(row.other.cogs, row.other.sales)) },
    projectCogsRateToBase: { mode: "level", values: levels((row) => ratio(row.project.cogs, row.project.sales)) },
    otherCogsRateToBase: { mode: "level", values: levels((row) => ratio(row.other.cogs, row.other.sales)) },
    projectEmployeeSalaryShare: { mode: "level", values: levels((row) => ratio(employeeSalary(row.project), row.project.employeePay)) },
    otherEmployeeSalaryShare: { mode: "level", values: levels((row) => ratio(employeeSalary(row.other), row.other.employeePay)) },
    projectOfficerCompensationShare: { mode: "level", values: levels((row) => ratio(officerCompensation(row.project), row.project.officerPay)) },
    otherOfficerCompensationShare: { mode: "level", values: levels((row) => ratio(officerCompensation(row.other), row.other.officerPay)) },
    // 補助事業の公式入力は減価償却費合計のみのため、初期配分率は
    // ベース事業の実績内訳を参照し、②で明示的に上書きできるようにする。
    projectCogsDepreciationShare: { mode: "level", values: levels((row) => ratio(cogsDepreciation(row.other), row.other.depreciation)) },
    otherCogsDepreciationShare: { mode: "level", values: levels((row) => ratio(cogsDepreciation(row.other), row.other.depreciation)) },
    projectResearchDevelopmentRate: { mode: "level", values: levels((row) => ratio(researchDevelopment(row.project), row.project.sales)) },
    otherResearchDevelopmentRate: { mode: "level", values: levels((row) => ratio(researchDevelopment(row.other), row.other.sales)) },
    projectNonOperatingRate: { mode: "level", values: levels((row) => ratio(nonOperatingProfitLoss(row.project), row.project.sales)) },
    otherNonOperatingRate: { mode: "level", values: levels((row) => ratio(nonOperatingProfitLoss(row.other), row.other.sales)) },
    projectExtraordinaryRate: { mode: "level", values: levels((row) => ratio(extraordinaryProfitLoss(row.project), row.project.sales)) },
    otherExtraordinaryRate: { mode: "level", values: levels((row) => ratio(extraordinaryProfitLoss(row.other), row.other.sales)) },
    effectiveTaxRate: {
      mode: "level",
      values: levels((row) => {
        const company = total(row.project, row.other);
        const beforeTax = preTaxIncome(company);
        return beforeTax ? 1 - netIncome(company) / beforeTax : Number.NaN;
      }),
    },
    projectSalesGrowthToBase: { mode: "change", values: changes((row) => row.project.sales) },
    projectCogsImprovementToBase: {
      mode: "change",
      values: improvements((row) => ratio(row.project.cogs, row.project.sales)),
      referenceLevels: levels((row) => ratio(row.project.cogs, row.project.sales)),
    },
    projectPayGrowthToBase: { mode: "change", values: changes((row) => perEmployee(row.project)) },
    projectHeadcountGrowthToBase: { mode: "change", values: changes((row) => row.project.headcount) },
    projectSgaImprovementToBase: {
      mode: "change",
      values: improvements((row) => ratio(row.project.otherSga, row.project.sales)),
      referenceLevels: levels((row) => ratio(row.project.otherSga, row.project.sales)),
    },
    projectOfficerPayGrowthToBase: { mode: "change", values: changes((row) => perOfficer(row.project)) },
    otherSalesGrowthToBase: { mode: "change", values: changes((row) => row.other.sales) },
    otherCogsImprovementToBase: {
      mode: "change",
      values: improvements((row) => ratio(row.other.cogs, row.other.sales)),
      referenceLevels: levels((row) => ratio(row.other.cogs, row.other.sales)),
    },
    otherPayGrowthToBase: { mode: "change", values: changes((row) => perEmployee(row.other)) },
    otherOfficerPayGrowthToBase: { mode: "change", values: changes((row) => perOfficer(row.other)) },
    otherHeadcountGrowthToBase: { mode: "change", values: changes((row) => row.other.headcount) },
    otherSgaImprovementToBase: {
      mode: "change",
      values: improvements((row) => ratio(row.other.otherSga, row.other.sales)),
      referenceLevels: levels((row) => ratio(row.other.otherSga, row.other.sales)),
    },
    projectSalesGrowth: { mode: "change", values: changes((row) => row.project.sales) },
    otherSalesGrowth: { mode: "change", values: changes((row) => row.other.sales) },
    projectCogsImprovementAfterBase: {
      mode: "change",
      values: improvements((row) => ratio(row.project.cogs, row.project.sales)),
      referenceLevels: levels((row) => ratio(row.project.cogs, row.project.sales)),
    },
    otherCogsImprovement: {
      mode: "change",
      values: improvements((row) => ratio(row.other.cogs, row.other.sales)),
      referenceLevels: levels((row) => ratio(row.other.cogs, row.other.sales)),
    },
    projectPayGrowth: { mode: "change", values: changes((row) => perEmployee(row.project)) },
    otherPayGrowth: { mode: "change", values: changes((row) => perEmployee(row.other)) },
    otherOfficerPayGrowth: { mode: "change", values: changes((row) => perOfficer(row.other)) },
    projectHeadcountGrowth: { mode: "change", values: changes((row) => row.project.headcount) },
    otherHeadcountGrowth: { mode: "change", values: changes((row) => row.other.headcount) },
    projectSgaRateEnd: {
      mode: "change",
      values: improvements((row) => ratio(row.project.otherSga, row.project.sales)),
      referenceLevels: levels((row) => ratio(row.project.otherSga, row.project.sales)),
    },
    otherSgaRateEnd: {
      mode: "change",
      values: improvements((row) => ratio(row.other.otherSga, row.other.sales)),
      referenceLevels: levels((row) => ratio(row.other.otherSga, row.other.sales)),
    },
    projectOfficerPayGrowth: { mode: "change", values: changes((row) => perOfficer(row.project)) },
    investment: { mode: "level", values: levels((_, index) => balanceSheets[index]?.capex > 0 ? balanceSheets[index].capex : Number.NaN) },
    subsidy: unavailable(),
    localBenchmark: unavailable(),
  };
}

export function targetStatus(definition: MetricDefinition, actual: number, target: Target) {
  if (!Number.isFinite(actual)) return { ok: false, gap: Number.NaN };
  const maximum = target.max;
  if (actual < target.value) return { ok: false, gap: actual - target.value };
  if (maximum !== undefined && actual > maximum) return { ok: false, gap: maximum - actual };
  return { ok: true, gap: 0 };
}

export function cogsImprovementAnnualWarningLimit(key: keyof Drivers): number | undefined {
  if (key === "projectCogsImprovementToBase" || key === "otherCogsImprovementToBase") return 0.02;
  if (key === "projectCogsImprovementAfterBase" || key === "otherCogsImprovement") return 0.03;
  return undefined;
}

function validateCogsTransitions(plan: YearPlan[], drivers: Drivers): Validation[] {
  const results: Validation[] = [];
  const report1 = plan.find((row) => row.role === "report1");
  const equipmentYears = plan.filter((row) => (
    row.role === "projectPeriod" || row.role === "beforeBase" || row.role === "base"
  )).length;
  const configurations = [
    {
      key: "project" as const,
      name: "補助事業",
      equipmentInitial: drivers.projectCogsRateToBase,
      equipmentAnnual: drivers.projectCogsImprovementToBase,
      equipmentAnnualKey: "projectCogsImprovementToBase" as const,
      postBaseInitial: drivers.projectCogsRateWhenSalesZero,
      postBaseAnnual: drivers.projectCogsImprovementAfterBase,
      postBaseAnnualKey: "projectCogsImprovementAfterBase" as const,
    },
    {
      key: "other" as const,
      name: "ベース事業",
      equipmentInitial: drivers.otherCogsRateToBase,
      equipmentAnnual: drivers.otherCogsImprovementToBase,
      equipmentAnnualKey: "otherCogsImprovementToBase" as const,
      postBaseInitial: drivers.otherCogsRateWhenSalesZero,
      postBaseAnnual: drivers.otherCogsImprovement,
      postBaseAnnualKey: "otherCogsImprovement" as const,
    },
  ];

  for (const configuration of configurations) {
    const equipmentTerminal = configuration.equipmentInitial
      - configuration.equipmentAnnual * Math.max(0, equipmentYears - 1);
    const postBaseTerminal = configuration.postBaseInitial - configuration.postBaseAnnual * 2;
    const periods = [
      {
        name: "設備導入期間",
        annual: configuration.equipmentAnnual,
        key: configuration.equipmentAnnualKey,
      },
      {
        name: "基準年後",
        annual: configuration.postBaseAnnual,
        key: configuration.postBaseAnnualKey,
      },
    ];
    for (const period of periods) {
      const limit = cogsImprovementAnnualWarningLimit(period.key);
      if (limit !== undefined && period.annual > limit + 0.000001) {
        results.push({
          level: "warning",
          title: `${configuration.name}の${period.name}の原価率改善が過大`,
          detail: `${(period.annual * 100).toFixed(2)}pt/年は、通常レンジの上限${(limit * 100).toFixed(2)}pt/年を超えています。設備効果や原価低減施策の根拠を確認してください。`,
        });
      }
    }
    if (equipmentTerminal < 0 || postBaseTerminal < 0) {
      results.push({
        level: "error",
        title: `${configuration.name}の原価率が0%を下回る設定`,
        detail: "期間初年度の原価率と年当たり改善ポイントの組合せを見直してください。",
      });
    }

    const boundaryChange = configuration.postBaseInitial - equipmentTerminal;
    if (boundaryChange > 0.000001) {
      results.push({
        level: "warning",
        title: `${configuration.name}の原価率が期間境界で悪化`,
        detail: `設備導入期間末の${(equipmentTerminal * 100).toFixed(2)}%から、基準年後初年度の${(configuration.postBaseInitial * 100).toFixed(2)}%へ悪化します。基準年後初年度の原価率または設備導入期間の年当たり改善ポイントを確認してください。`,
        year: report1?.year,
      });
    } else if (boundaryChange < -0.05) {
      results.push({
        level: "warning",
        title: `${configuration.name}の原価率が期間境界で急改善`,
        detail: `設備導入期間末の${(equipmentTerminal * 100).toFixed(2)}%から、基準年後初年度の${(configuration.postBaseInitial * 100).toFixed(2)}%へ5pt超改善します。設備効果などの根拠を確認してください。`,
        year: report1?.year,
      });
    }
  }
  return results;
}

export function validatePlan(plan: YearPlan[], drivers: Drivers): Validation[] {
  const results: Validation[] = [];
  const fields: (keyof SegmentPlan)[] = ["sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga", "headcount", "officerCount"];
  for (const row of plan) {
    for (const segmentKey of ["project", "other"] as SegmentKey[]) {
      const segment = row[segmentKey];
      const name = segmentKey === "project" ? "補助事業" : "ベース事業";
      for (const field of fields) {
        if (!Number.isFinite(segment[field]) || segment[field] < 0) {
          results.push({ level: "error", title: `${name}に負数または未入力`, detail: `${String(field)}は0以上の数値にしてください。`, year: row.year });
        }
      }
      if (segment.employeePay > 0 && segment.headcount <= 0) results.push({ level: "error", title: `${name}の従業員給与と常時使用する従業員数が不整合`, detail: "従業員給与がある場合は、常時使用する従業員数（就業時間換算）を入力してください。", year: row.year });
      if (segment.officerPay > 0 && segment.officerCount <= 0) results.push({ level: "error", title: `${name}の役員給与と役員数が不整合`, detail: "役員給与がある場合は役員数を入力してください。", year: row.year });
    }
    const company = total(row.project, row.other);
    if (Math.abs(company.sales - row.project.sales - row.other.sales) > 0.0001) results.push({ level: "error", title: "全社合算不一致", detail: "補助事業とベース事業の合計が全社値と一致しません。", year: row.year });
  }

  results.push(...validateCogsTransitions(plan, drivers));
  if (!results.length) results.push({ level: "info", title: "基本検証を通過", detail: "入力値の基本的な整合性に確認事項はありません。" });
  return results;
}

function normalizedShortfall(definition: MetricDefinition, actual: number, target: Target) {
  const status = targetStatus(definition, actual, target);
  if (status.ok || target.policy === "monitor") return 0;
  const scale = Math.max(Math.abs(target.value), 1);
  return Math.abs(status.gap) / scale;
}

export function objective(
  drivers: Drivers,
  original: Drivers,
  historical: YearPlan[],
  settings: TimelineSettings,
  targets: Record<MetricKey, Target>,
  projectPeriodInput: SegmentPlan | ProjectPeriodInput[] = defaultProjectBasePlan,
  referencePlan?: YearPlan[],
  bounds: Record<keyof Drivers, [number, number]> = driverBounds,
  rebuildProjectPeriod = false,
  planTransform?: (plan: YearPlan[]) => YearPlan[],
) {
  const effectiveProjectPeriodInput = rebuildProjectPeriod
    ? createForecastProjectPeriodInputs(retimeHistoricalPlan(historical, settings)[2], drivers, settings)
    : projectPeriodInput;
  const generatedPlan = generatePlan(historical, drivers, settings, effectiveProjectPeriodInput);
  const plan = planTransform ? planTransform(generatedPlan) : generatedPlan;
  const actual = calculateMetrics(plan, drivers);
  let score = 0;
  for (const definition of metrics) {
    if (isOptimizationExcludedMetric(definition.key)) continue;
    const target = targets[definition.key];
    const miss = normalizedShortfall(definition, actual[definition.key], target);
    const policyMultiplier = target.policy === "hard" ? 5000 : 250;
    score += policyMultiplier * target.weight * miss ** 2;
  }
  const adjustable: (keyof Drivers)[] = [
    "projectSalesGrowthToBase", "projectCogsRateToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase",
    "otherSalesGrowthToBase", "otherCogsRateToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase",
    "projectSalesGrowth", "otherSalesGrowth", "projectCogsRateWhenSalesZero", "otherCogsRateWhenSalesZero", "projectCogsImprovementAfterBase", "otherCogsImprovement",
    "projectPayGrowth", "otherPayGrowth", "projectHeadcountGrowth", "otherHeadcountGrowth",
    "projectSgaRateEnd", "otherSgaRateEnd", "projectOfficerPayGrowth",
  ];
  for (const key of adjustable) {
    const [minimum, maximum] = bounds[key];
    const span = Math.max(maximum - minimum, 0.001);
    score += 6 * ((drivers[key] - original[key]) / span) ** 2;
  }
  if (referencePlan) {
    const comparedFields: (keyof SegmentPlan)[] = ["sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga", "headcount", "officerCount"];
    for (let yearIndex = 1; yearIndex < Math.min(plan.length, referencePlan.length); yearIndex += 1) {
      for (const segmentKey of ["project", "other"] as SegmentKey[]) {
        for (const field of comparedFields) {
          const reference = referencePlan[yearIndex][segmentKey][field];
          const candidate = plan[yearIndex][segmentKey][field];
          const scale = Math.max(Math.abs(reference), 1);
          score += 8 * ((candidate - reference) / scale) ** 2;
        }
      }
    }
  }
  const validations = validatePlan(plan, drivers);
  score += validations.filter((item) => item.level === "error").length * 10000;
  score += validations.filter((item) => item.level === "warning").length * 20;
  return score;
}

export function optimizeDrivers(
  initial: Drivers,
  historical: YearPlan[],
  settings: TimelineSettings,
  targets: Record<MetricKey, Target>,
  projectPeriodInput: SegmentPlan | ProjectPeriodInput[] = defaultProjectBasePlan,
  referencePlan?: YearPlan[],
  bounds: Record<keyof Drivers, [number, number]> = driverBounds,
  rebuildProjectPeriod = false,
  planTransform?: (plan: YearPlan[]) => YearPlan[],
  requiredMinimums: Partial<Record<MetricKey, number>> = {},
  hardRepairStrategy: "full-range" | "legacy-fixed-step" = "full-range",
) {
  const original = { ...initial };
  const keys: (keyof Drivers)[] = [
    "projectSalesGrowthToBase", "projectCogsRateToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase",
    "otherSalesGrowthToBase", "otherCogsRateToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase",
    "projectSalesGrowth", "otherSalesGrowth", "projectCogsRateWhenSalesZero", "otherCogsRateWhenSalesZero", "projectCogsImprovementAfterBase", "otherCogsImprovement",
    "projectPayGrowth", "otherPayGrowth", "projectHeadcountGrowth", "otherHeadcountGrowth",
    "projectSgaRateEnd", "otherSgaRateEnd", "projectOfficerPayGrowth",
  ];
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101];
  const clampDrivers = (candidate: Drivers) => {
    const result = { ...candidate };
    for (const key of keys) {
      const [minimum, maximum] = bounds[key];
      result[key] = Math.min(maximum, Math.max(minimum, result[key]));
    }
    return result;
  };
  const transformedPlan = (drivers: Drivers) => {
    const effectiveProjectPeriodInput = rebuildProjectPeriod
      ? createForecastProjectPeriodInputs(retimeHistoricalPlan(historical, settings)[2], drivers, settings)
      : projectPeriodInput;
    const generated = generatePlan(historical, drivers, settings, effectiveProjectPeriodInput);
    return planTransform ? planTransform(generated) : generated;
  };
  const constraintViolations = (drivers: Drivers) => {
    const actual = calculateMetrics(transformedPlan(drivers), drivers);
    const hardViolation = metrics.reduce((sum, definition) => {
      if (isOptimizationExcludedMetric(definition.key)) return sum;
      const target = targets[definition.key];
      if (target.policy !== "hard") return sum;
      const status = targetStatus(definition, actual[definition.key], target);
      if (status.ok) return sum;
      const scale = Math.max(Math.abs(target.value), 1);
      const miss = Number.isFinite(status.gap) ? Math.abs(status.gap) / scale : 1e6;
      return sum + target.weight * miss ** 2;
    }, 0);
    const requiredViolation = Object.entries(requiredMinimums).reduce((sum, [key, minimum]) => {
      const actualValue = actual[key as MetricKey];
      if (minimum === undefined || (Number.isFinite(actualValue) && actualValue >= minimum)) return sum;
      const scale = Math.max(Math.abs(minimum), 1);
      const miss = Number.isFinite(actualValue) ? (minimum - actualValue) / scale : 1e6;
      return sum + miss ** 2;
    }, 0);
    return { requiredViolation, hardViolation };
  };
  type Candidate = { drivers: Drivers; requiredViolation: number; hardViolation: number; score: number };
  const evaluate = (drivers: Drivers): Candidate => {
    const candidate = clampDrivers(drivers);
    const violations = constraintViolations(candidate);
    return {
      drivers: candidate,
      ...violations,
      score: objective(candidate, original, historical, settings, targets, projectPeriodInput, referencePlan, bounds, rebuildProjectPeriod, planTransform),
    };
  };
  const constraintTolerance = 1e-15;
  const better = (left: Candidate, right: Candidate) => {
    if (left.requiredViolation + constraintTolerance < right.requiredViolation) return true;
    if (right.requiredViolation + constraintTolerance < left.requiredViolation) return false;
    if (left.hardViolation + constraintTolerance < right.hardViolation) return true;
    if (right.hardViolation + constraintTolerance < left.hardViolation) return false;
    return left.score + 1e-9 < right.score;
  };
  const halton = (index: number, base: number) => {
    let result = 0;
    let fraction = 1 / base;
    let value = index;
    while (value > 0) {
      result += fraction * (value % base);
      value = Math.floor(value / base);
      fraction /= base;
    }
    return result;
  };

  const seeds: Candidate[] = [evaluate(original)];
  const midpoint = { ...original };
  const lowerCorner = { ...original };
  const upperCorner = { ...original };
  for (const key of keys) {
    const [minimum, maximum] = bounds[key];
    midpoint[key] = (minimum + maximum) / 2;
    lowerCorner[key] = minimum;
    upperCorner[key] = maximum;
  }
  seeds.push(evaluate(midpoint), evaluate(lowerCorner), evaluate(upperCorner));
  for (let sample = 1; sample <= 320; sample += 1) {
    const candidate = { ...original };
    keys.forEach((key, index) => {
      const [minimum, maximum] = bounds[key];
      candidate[key] = minimum + halton(sample, primes[index]) * (maximum - minimum);
    });
    seeds.push(evaluate(candidate));
  }
  seeds.sort((left, right) => better(left, right) ? -1 : better(right, left) ? 1 : 0);

  const finalists: Candidate[] = [];
  for (const seed of seeds.slice(0, 8)) {
    let current = seed;
    for (const fraction of [0.12, 0.04, 0.012, 0.003]) {
      for (let sweep = 0; sweep < 10; sweep += 1) {
        let improved = false;
        for (const key of keys) {
          const [minimum, maximum] = bounds[key];
          const step = Math.max((maximum - minimum) * fraction, 0.0001);
          for (const direction of [-1, 1]) {
            const candidateDrivers = { ...current.drivers, [key]: current.drivers[key] + direction * step };
            const candidate = evaluate(candidateDrivers);
            if (better(candidate, current)) {
              current = candidate;
              improved = true;
            }
          }
        }
        if (!improved) break;
      }
    }
    finalists.push(current);
  }
  finalists.sort((left, right) => better(left, right) ? -1 : better(right, left) ? 1 : 0);
  let best = finalists[0];

  const legacyRepair = (start: Candidate) => {
    let repaired = start;
    legacyRepairLoop: for (const fraction of [0.003, 0.001, 0.0003, 0.0001, 0.00003]) {
      for (let sweep = 0; sweep < 64; sweep += 1) {
        let next = repaired;
        for (const key of keys) {
          const [minimum, maximum] = bounds[key];
          const step = Math.max((maximum - minimum) * fraction, 0.000001);
          for (const direction of [-1, 1]) {
            const candidate = evaluate({ ...repaired.drivers, [key]: repaired.drivers[key] + direction * step });
            if (better(candidate, next)) next = candidate;
          }
        }
        if (next === repaired) break;
        repaired = next;
        if (repaired.requiredViolation <= constraintTolerance && repaired.hardViolation <= constraintTolerance) break legacyRepairLoop;
      }
    }
    return repaired;
  };

  // Search each coordinate across its entire user-specified range. Forecast
  // values are stored to two decimals, so the objective contains flat sections
  // where several small moves appear to do nothing. A full-range scan crosses
  // those plateaus and evaluates both boundaries on every sweep.
  const fullRangeRepair = (start: Candidate) => {
    let repaired = start;
    fullRangeRepairLoop: for (let sweep = 0; sweep < 10; sweep += 1) {
      const sweepStart = repaired;
      for (const key of keys) {
        const [minimum, maximum] = bounds[key];
        if (!(maximum > minimum)) continue;
        const divisions = 16;
        let coordinateBest = repaired;
        let bestIndex = 0;
        for (let index = 0; index <= divisions; index += 1) {
          const value = minimum + (maximum - minimum) * index / divisions;
          const candidate = evaluate({ ...repaired.drivers, [key]: value });
          if (better(candidate, coordinateBest)) {
            coordinateBest = candidate;
            bestIndex = index;
          }
        }

        let intervalLower = minimum + (maximum - minimum) * Math.max(0, bestIndex - 1) / divisions;
        let intervalUpper = minimum + (maximum - minimum) * Math.min(divisions, bestIndex + 1) / divisions;
        for (let refinement = 0; refinement < 2; refinement += 1) {
          const refinementDivisions = 8;
          let refinedIndex = 0;
          for (let index = 0; index <= refinementDivisions; index += 1) {
            const value = intervalLower + (intervalUpper - intervalLower) * index / refinementDivisions;
            const candidate = evaluate({ ...repaired.drivers, [key]: value });
            if (better(candidate, coordinateBest)) {
              coordinateBest = candidate;
              refinedIndex = index;
            }
          }
          const previousLower = intervalLower;
          const previousUpper = intervalUpper;
          intervalLower = previousLower + (previousUpper - previousLower) * Math.max(0, refinedIndex - 1) / refinementDivisions;
          intervalUpper = previousLower + (previousUpper - previousLower) * Math.min(refinementDivisions, refinedIndex + 1) / refinementDivisions;
        }
        repaired = coordinateBest;
        if (repaired.requiredViolation <= constraintTolerance && repaired.hardViolation <= constraintTolerance) break fullRangeRepairLoop;
      }
      if (!better(repaired, sweepStart)) break;
    }
    return repaired;
  };

  if (best.requiredViolation > constraintTolerance || best.hardViolation > constraintTolerance) {
    if (hardRepairStrategy === "legacy-fixed-step") {
      best = legacyRepair(best);
    } else {
      best = fullRangeRepair(best);
    }
  }
  return {
    drivers: best.drivers,
    score: best.score,
    requiredViolation: best.requiredViolation,
    hardViolation: best.hardViolation,
    hardFeasible: best.requiredViolation <= constraintTolerance && best.hardViolation <= constraintTolerance,
  };
}

export function hardTargetSummary(actual: Record<MetricKey, number>, targets: Record<MetricKey, Target>) {
  const hard = metrics.filter((definition) => !isOptimizationExcludedMetric(definition.key) && targets[definition.key].policy === "hard");
  const failed = hard.filter((definition) => !targetStatus(definition, actual[definition.key], targets[definition.key]).ok);
  return { hardCount: hard.length, failed };
}
