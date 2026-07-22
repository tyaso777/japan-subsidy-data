export type SegmentKey = "project" | "other";
export type Mode = "auto" | "manual";

export type SegmentPlan = {
  sales: number;
  cogs: number;
  employeePay: number;
  officerPay: number;
  depreciation: number;
  otherSga: number;
  headcount: number;
  officerCount: number;
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
  projectSalesGrowthToBase: number;
  projectCogsImprovementToBase: number;
  projectPayGrowthToBase: number;
  projectHeadcountGrowthToBase: number;
  projectSgaImprovementToBase: number;
  projectOfficerPayGrowthToBase: number;
  otherSalesGrowthToBase: number;
  otherCogsImprovementToBase: number;
  otherPayGrowthToBase: number;
  otherHeadcountGrowthToBase: number;
  otherSgaImprovementToBase: number;
  projectSalesGrowth: number;
  otherSalesGrowth: number;
  projectCogsImprovementAfterBase: number;
  otherCogsImprovement: number;
  projectPayGrowth: number;
  otherPayGrowth: number;
  projectHeadcountGrowth: number;
  otherHeadcountGrowth: number;
  projectSgaRateEnd: number;
  otherSgaRateEnd: number;
  projectOfficerPayGrowth: number;
  usefulLife: number;
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

export const sampleBasePlan: YearPlan = {
  year: DEFAULT_TIMELINE.latestYear,
  role: "latest",
  project: {
    sales: 80,
    cogs: 54.4,
    employeePay: 6,
    officerPay: 0.4,
    depreciation: 2,
    otherSga: 10,
    headcount: 100,
    officerCount: 2,
  },
  other: {
    sales: 70,
    cogs: 47.6,
    employeePay: 8,
    officerPay: 0.6,
    depreciation: 1.5,
    otherSga: 8,
    headcount: 130,
    officerCount: 3,
  },
};

export const sampleBalanceSheets: BalanceSheetPlan[] = [
  { year: 2023, assets: 132, currentAssets: 67, cash: 24, fixedAssets: 65, tangibleAssets: 53, buildings: 19, machinery: 24, land: 10, intangibleAssets: 7, software: 5, liabilities: 75, currentLiabilities: 39, shortTermDebt: 12, fixedLiabilities: 36, longTermDebt: 29, netAssets: 57, shareholderEquity: 54, capital: 10, capex: 5 },
  { year: 2024, assets: 143, currentAssets: 72, cash: 25, fixedAssets: 71, tangibleAssets: 58, buildings: 20, machinery: 28, land: 10, intangibleAssets: 8, software: 6, liabilities: 79, currentLiabilities: 41, shortTermDebt: 12, fixedLiabilities: 38, longTermDebt: 31, netAssets: 64, shareholderEquity: 61, capital: 10, capex: 8 },
  { year: 2025, assets: 156, currentAssets: 78, cash: 27, fixedAssets: 78, tangibleAssets: 64, buildings: 22, machinery: 32, land: 10, intangibleAssets: 9, software: 7, liabilities: 83, currentLiabilities: 43, shortTermDebt: 11, fixedLiabilities: 40, longTermDebt: 32, netAssets: 73, shareholderEquity: 70, capital: 10, capex: 10 },
];

export const defaultProjectBasePlan: SegmentPlan = {
  sales: 120,
  cogs: 78,
  employeePay: 10,
  officerPay: 0.6,
  depreciation: 6.5,
  otherSga: 12,
  headcount: 115,
  officerCount: 2,
};

export const sampleDrivers: Drivers = {
  projectMarketGrowth: 0.05,
  projectSalesGrowthToBase: 0.21,
  projectCogsImprovementToBase: 0.07,
  projectPayGrowthToBase: 0.07,
  projectHeadcountGrowthToBase: 0.04,
  projectSgaImprovementToBase: 0.01,
  projectOfficerPayGrowthToBase: 0.06,
  otherSalesGrowthToBase: 0.04,
  otherCogsImprovementToBase: 0.005,
  otherPayGrowthToBase: 0.04,
  otherHeadcountGrowthToBase: 0.01,
  otherSgaImprovementToBase: 0.005,
  projectSalesGrowth: 0.21,
  otherSalesGrowth: 0.06,
  projectCogsImprovementAfterBase: 0,
  otherCogsImprovement: 0.01,
  projectPayGrowth: 0.07,
  otherPayGrowth: 0.045,
  projectHeadcountGrowth: 0.04,
  otherHeadcountGrowth: 0.015,
  projectSgaRateEnd: 0.09,
  otherSgaRateEnd: 0.10,
  projectOfficerPayGrowth: 0.06,
  usefulLife: 10,
  investment: 45,
  subsidy: 15,
  localBenchmark: 23,
};

const emptySegment = (): SegmentPlan => ({
  sales: 0,
  cogs: 0,
  employeePay: 0,
  officerPay: 0,
  depreciation: 0,
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
  projectSalesGrowthToBase: 0,
  projectCogsImprovementToBase: 0,
  projectPayGrowthToBase: 0,
  projectHeadcountGrowthToBase: 0,
  projectSgaImprovementToBase: 0,
  projectOfficerPayGrowthToBase: 0,
  otherSalesGrowthToBase: 0,
  otherCogsImprovementToBase: 0,
  otherPayGrowthToBase: 0,
  otherHeadcountGrowthToBase: 0,
  otherSgaImprovementToBase: 0,
  projectSalesGrowth: 0,
  otherSalesGrowth: 0,
  projectCogsImprovementAfterBase: 0,
  otherCogsImprovement: 0,
  projectPayGrowth: 0,
  otherPayGrowth: 0,
  projectHeadcountGrowth: 0,
  otherHeadcountGrowth: 0,
  projectSgaRateEnd: 0,
  otherSgaRateEnd: 0,
  projectOfficerPayGrowth: 0,
  usefulLife: 0,
  investment: 0,
  subsidy: 0,
  localBenchmark: 0,
};

export const driverBounds: Record<keyof Drivers, [number, number]> = {
  projectMarketGrowth: [-0.05, 0.3],
  projectSalesGrowthToBase: [-0.05, 0.4],
  projectCogsImprovementToBase: [0, 0.02],
  projectPayGrowthToBase: [-0.05, 0.1],
  projectHeadcountGrowthToBase: [-0.03, 0.2],
  projectSgaImprovementToBase: [0, 0.02],
  projectOfficerPayGrowthToBase: [0, 0.1],
  otherSalesGrowthToBase: [-0.1, 0.2],
  otherCogsImprovementToBase: [0, 0.02],
  otherPayGrowthToBase: [0, 0.08],
  otherHeadcountGrowthToBase: [-0.05, 0.1],
  otherSgaImprovementToBase: [0, 0.02],
  projectSalesGrowth: [-0.05, 0.4],
  otherSalesGrowth: [-0.1, 0.2],
  projectCogsImprovementAfterBase: [0, 0.03],
  otherCogsImprovement: [0, 0.03],
  projectPayGrowth: [0.045, 0.1],
  otherPayGrowth: [0, 0.08],
  projectHeadcountGrowth: [-0.03, 0.2],
  otherHeadcountGrowth: [-0.05, 0.1],
  projectSgaRateEnd: [0.04, 0.25],
  otherSgaRateEnd: [0.04, 0.25],
  projectOfficerPayGrowth: [0, 0.1],
  usefulLife: [5, 20],
  investment: [15, 200],
  subsidy: [1, 50],
  localBenchmark: [0, 100],
};

export const metrics: MetricDefinition[] = [
  { key: "companySalesCagr", label: "全社年平均売上高成長率", unit: "%/年", round3Formula: "基準年前年→事業化報告3年目（4年CAGR）", round6Formula: "基準年→事業化報告3年目（3年CAGR）", defaultTarget: 21, rangeMax: 35, direction: "min", sourceRound: "過去中央値は第5次採択者21%（期間差に注意）" },
  { key: "companySalesIncrease", label: "全社売上高増加額", unit: "億円", round3Formula: "事業化報告3年目 − 基準年前年", round6Formula: "事業化報告3年目 − 基準年", defaultTarget: 0, direction: "min", sourceRound: "全社売上高成長率の目標と基準年売上高から規模連動で設定" },
  { key: "companyPaySchedule", label: "全社の従業員1人当たり給与支給総額の年平均上昇率（最新決算期→基準年度）", unit: "%/年", round3Formula: "従業員＋役員の合算1人当たり給与支給総額：最新決算期→基準年度の年率", round6Formula: "全社の従業員1人当たり給与支給総額：最新決算期→基準年度の年平均上昇率（基準年度の常時使用する従業員数（就業時間換算）が0の場合のみ役員で代替）", defaultTarget: 3.5, rangeMax: 7, direction: "min", sourceRound: "第6次の足下賃上げ評価" },
  { key: "projectSalesShare", label: "補助事業売上高／全社売上高", unit: "%", round3Formula: "事業化報告3年目の補助事業売上高 ÷ 同年全社売上高", round6Formula: "事業化報告3年目の補助事業売上高 ÷ 同年全社売上高", defaultTarget: 70, rangeMax: 95, direction: "range", sourceRound: "第5次平均89%を参考に範囲管理" },
  { key: "projectSalesCagr", label: "補助事業年平均売上高成長率", unit: "%/年", round3Formula: "基準年→事業化報告3年目（3年CAGR）", round6Formula: "基準年→事業化報告3年目（3年CAGR）", defaultTarget: 22, rangeMax: 35, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "projectSalesIncrease", label: "補助事業売上高増加額", unit: "億円", round3Formula: "事業化報告3年目 − 基準年", round6Formula: "事業化報告3年目 − 基準年", defaultTarget: 0, direction: "min", sourceRound: "補助事業売上高成長率の目標と基準年売上高から規模連動で設定" },
  { key: "laborProductivityCagr", label: "補助事業年平均労働生産性の伸び", unit: "%/年", round3Formula: "付加価値額÷（常時使用する従業員数（就業時間換算）＋役員数）の基準年→3年目CAGR", round6Formula: "付加価値額÷（常時使用する従業員数（就業時間換算）＋役員数）の基準年→3年目CAGR", defaultTarget: 21, rangeMax: 35, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "valueAddedIncrease", label: "補助事業付加価値増加額", unit: "億円", round3Formula: "3年目付加価値額 − 基準年付加価値額", round6Formula: "3年目付加価値額 − 基準年付加価値額", defaultTarget: 0, direction: "min", sourceRound: "労働生産性目標と基準年付加価値・人員計画から規模連動で設定" },
  { key: "employeePayCagr", label: "補助事業1人当たり給与支給総額の年平均上昇率", unit: "%/年", round3Formula: "従業員給与支給総額÷常時使用する従業員数（就業時間換算）の基準年度→事業化報告3年目（本モデルの最終年度）CAGR", round6Formula: "補助事業1人当たり給与支給総額の基準年度→事業化報告3年目（本モデルの最終年度）の年平均上昇率（基準年度の常時使用する従業員数（就業時間換算）が0の場合のみ役員で代替）", defaultTarget: 7, rangeMax: 10, direction: "min", sourceRound: "第6次要件は一般5.0%・100億宣言4.5%以上" },
  { key: "employeePayIncrease", label: "補助事業従業員給与支給総額の増加額", unit: "億円", round3Formula: "3年目従業員給与総額 − 基準年総額", round6Formula: "3年目従業員給与総額 − 基準年総額", defaultTarget: 0, direction: "min", sourceRound: "1人当たり給与上昇率目標と基準年給与・人員計画から規模連動で設定" },
  { key: "investmentSalesRatio", label: "投資額／全社売上高", unit: "%", round3Formula: "補助事業投資額 ÷ 最新決算期全社売上高", round6Formula: "補助事業投資額 ÷ 最新決算期全社売上高", defaultTarget: 30, rangeMax: 70, direction: "range", sourceRound: "第5次中央値61%を参考に範囲管理" },
  { key: "valueAddedSubsidyRatio", label: "付加価値増加額／補助金額", unit: "%", round3Formula: "基準年→3年目の付加価値増加額 ÷ 補助金額", round6Formula: "基準年→3年目の付加価値増加額 ÷ 補助金額", defaultTarget: 213, rangeMax: 350, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "localBenchmark", label: "ローカルベンチマーク財務分析結果", unit: "点", round3Formula: "ローカルベンチマーク入力値", round6Formula: "ローカルベンチマーク入力値", defaultTarget: 23, rangeMax: 40, direction: "min", sourceRound: "第5次採択者中央値" },
  { key: "officerPayCagr", label: "年平均役員目標賃上げ率", unit: "%/年", round3Formula: "役員給与総額÷役員数の基準年→3年目CAGR", round6Formula: "役員給与総額÷役員数の基準年→3年目CAGR（参考管理）", defaultTarget: 6, rangeMax: 10, direction: "min", sourceRound: "第6次評価対象外・参考値" },
  { key: "officerPayIncrease", label: "役員給与支給総額の増加額", unit: "億円", round3Formula: "3年目役員給与総額 − 基準年総額", round6Formula: "3年目役員給与総額 − 基準年総額（参考管理）", defaultTarget: 0, direction: "min", sourceRound: "第6次評価対象外・参考値" },
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
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function operatingProfit(segment: SegmentPlan) {
  return segment.sales - segment.cogs - segment.employeePay - segment.officerPay - segment.depreciation - segment.otherSga;
}

export function valueAdded(segment: SegmentPlan) {
  return operatingProfit(segment) + segment.employeePay + segment.officerPay + segment.depreciation;
}

export function total(a: SegmentPlan, b: SegmentPlan): SegmentPlan {
  return {
    sales: a.sales + b.sales,
    cogs: a.cogs + b.cogs,
    employeePay: a.employeePay + b.employeePay,
    officerPay: a.officerPay + b.officerPay,
    depreciation: a.depreciation + b.depreciation,
    otherSga: a.otherSga + b.otherSga,
    headcount: a.headcount + b.headcount,
    officerCount: a.officerCount + b.officerCount,
  };
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
  return {
    sales: round(segment.sales * factor),
    cogs: round(segment.cogs * factor),
    employeePay: round(segment.employeePay * factor),
    officerPay: round(segment.officerPay * factor),
    depreciation: round(segment.depreciation * factor),
    otherSga: round(segment.otherSga * factor),
    headcount: round(segment.headcount * factor, 2),
    officerCount: segment.officerCount,
  };
}

export function createHistoricalPlan(latest: YearPlan = basePlan, settings: TimelineSettings = DEFAULT_TIMELINE): YearPlan[] {
  const timeline = normalizeTimeline(settings);
  return [
    { year: timeline.latestYear - 2, role: "prePrevious", project: scaleSegment(latest.project, 0.9), other: scaleSegment(latest.other, 0.92) },
    { year: timeline.latestYear - 1, role: "previous", project: scaleSegment(latest.project, 0.95), other: scaleSegment(latest.other, 0.96) },
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
  const startCogsRate = start.sales ? start.cogs / start.sales : 0.68;
  const targetCogsRate = Math.min(0.99, Math.max(0.01, startCogsRate - drivers.projectCogsImprovementToBase));
  const startSgaRate = start.sales ? start.otherSga / start.sales : drivers.projectSgaRateEnd;
  const startPayPerHead = start.headcount ? start.employeePay / start.headcount : 0;
  const annualNewDepreciation = drivers.usefulLife > 0 ? drivers.investment / drivers.usefulLife : 0;

  return Array.from({ length: years }, (_, index) => {
    const elapsed = index + 1;
    const progress = elapsed / years;
    const sales = start.sales * (1 + drivers.projectSalesGrowthToBase) ** elapsed;
    const headcount = start.headcount * (1 + drivers.projectHeadcountGrowthToBase) ** elapsed;
    return {
      year: timeline.latestYear + elapsed,
      project: {
        sales: round(sales),
        cogs: round(sales * lerp(startCogsRate, targetCogsRate, progress)),
        employeePay: round(startPayPerHead * (1 + drivers.projectPayGrowthToBase) ** elapsed * headcount),
        officerPay: round(start.officerPay * (1 + drivers.projectOfficerPayGrowthToBase) ** elapsed),
        depreciation: round(start.depreciation + annualNewDepreciation * progress),
        otherSga: round(sales * lerp(startSgaRate, Math.max(0, startSgaRate - drivers.projectSgaImprovementToBase), progress)),
        headcount: round(headcount, 2),
        officerCount: start.officerCount,
      },
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
  const baseProjectCogsRate = projectBase.sales ? projectBase.cogs / projectBase.sales : 0.68;
  const baseOtherCogsRate = latest.other.sales ? latest.other.cogs / latest.other.sales : 0.68;
  const yearsToBase = timeline.baseYear - timeline.latestYear;
  const otherBaseSales = latest.other.sales * (1 + drivers.otherSalesGrowthToBase) ** yearsToBase;
  const otherBaseHeadcount = latest.other.headcount * (1 + drivers.otherHeadcountGrowthToBase) ** yearsToBase;
  const otherBasePayPerHead = latest.other.headcount ? latest.other.employeePay / latest.other.headcount : 0;
  const otherBaseEmployeePay = otherBasePayPerHead * (1 + drivers.otherPayGrowthToBase) ** yearsToBase * otherBaseHeadcount;
  const otherBaseOfficerPay = latest.other.officerPay * (1 + Math.min(drivers.otherPayGrowthToBase, 0.05)) ** yearsToBase;
  const otherBaseCogsRate = Math.min(0.99, Math.max(0.01, baseOtherCogsRate - drivers.otherCogsImprovementToBase));
  const latestOtherSgaRate = latest.other.sales ? latest.other.otherSga / latest.other.sales : drivers.otherSgaRateEnd;
  const otherBaseSgaRate = Math.min(0.99, Math.max(0, latestOtherSgaRate - drivers.otherSgaImprovementToBase));
  const projectCogsRateEnd = Math.min(0.99, Math.max(0.01, baseProjectCogsRate - drivers.projectCogsImprovementAfterBase));
  const otherCogsRateEnd = Math.min(0.99, Math.max(0.01, otherBaseCogsRate - drivers.otherCogsImprovement));
  const baseProjectSgaRate = projectBase.sales ? projectBase.otherSga / projectBase.sales : drivers.projectSgaRateEnd;
  const baseProjectPayPerHead = projectBase.headcount ? projectBase.employeePay / projectBase.headcount : 0;
  const emptyProject: SegmentPlan = { sales: 0, cogs: 0, employeePay: 0, officerPay: 0, depreciation: 0, otherSga: 0, headcount: 0, officerCount: 0 };

  for (let i = 1; i <= n; i += 1) {
    const year = timeline.latestYear + i;
    const role = roleForYear(year, timeline);
    const yearsAfterBase = Math.max(0, year - timeline.baseYear);
    const projectProgress = yearsAfterBase / 3;
    const beforeOrAtBase = year <= timeline.baseYear;
    const otherProgress = beforeOrAtBase ? i / yearsToBase : yearsAfterBase / 3;
    const projectHeadcount = projectBase.headcount * (1 + drivers.projectHeadcountGrowth) ** yearsAfterBase;
    const otherHeadcount = beforeOrAtBase
      ? latest.other.headcount * (1 + drivers.otherHeadcountGrowthToBase) ** i
      : otherBaseHeadcount * (1 + drivers.otherHeadcountGrowth) ** yearsAfterBase;
    const projectSales = projectBase.sales * (1 + drivers.projectSalesGrowth) ** yearsAfterBase;
    const otherSales = beforeOrAtBase
      ? latest.other.sales * (1 + drivers.otherSalesGrowthToBase) ** i
      : otherBaseSales * (1 + drivers.otherSalesGrowth) ** yearsAfterBase;
    const otherCogsRate = beforeOrAtBase
      ? lerp(baseOtherCogsRate, otherBaseCogsRate, otherProgress)
      : lerp(otherBaseCogsRate, otherCogsRateEnd, otherProgress);
    const otherEmployeePay = beforeOrAtBase
      ? otherBasePayPerHead * (1 + drivers.otherPayGrowthToBase) ** i * otherHeadcount
      : (otherBaseHeadcount ? otherBaseEmployeePay / otherBaseHeadcount : 0) * (1 + drivers.otherPayGrowth) ** yearsAfterBase * otherHeadcount;
    const otherOfficerPay = beforeOrAtBase
      ? latest.other.officerPay * (1 + Math.min(drivers.otherPayGrowthToBase, 0.05)) ** i
      : otherBaseOfficerPay * (1 + Math.min(drivers.otherPayGrowth, 0.05)) ** yearsAfterBase;
    const otherSgaRate = beforeOrAtBase
      ? lerp(latestOtherSgaRate, otherBaseSgaRate, otherProgress)
      : lerp(otherBaseSgaRate, drivers.otherSgaRateEnd, otherProgress);
    const enteredProject = periodInputs.find((row) => row.year === year)?.project;
    const project = year <= timeline.baseYear ? structuredClone(enteredProject ?? emptyProject) : {
      sales: round(projectSales),
      cogs: round(projectSales * lerp(baseProjectCogsRate, projectCogsRateEnd, projectProgress)),
      employeePay: round(baseProjectPayPerHead * (1 + drivers.projectPayGrowth) ** yearsAfterBase * projectHeadcount),
      officerPay: round(projectBase.officerPay * (1 + drivers.projectOfficerPayGrowth) ** yearsAfterBase),
      depreciation: round(projectBase.depreciation),
      otherSga: round(projectSales * lerp(baseProjectSgaRate, drivers.projectSgaRateEnd, projectProgress)),
      headcount: round(projectHeadcount, 2),
      officerCount: projectBase.officerCount,
    };
    plan.push({
      year,
      role,
      project,
      other: {
        sales: round(otherSales),
        cogs: round(otherSales * otherCogsRate),
        employeePay: round(otherEmployeePay),
        officerPay: round(otherOfficerPay),
        depreciation: round(latest.other.depreciation),
        otherSga: round(otherSales * otherSgaRate),
        headcount: round(otherHeadcount, 2),
        officerCount: latest.other.officerCount,
      },
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
    projectHeadcountGrowth: { mode: "change", values: changes((row) => row.project.headcount) },
    otherHeadcountGrowth: { mode: "change", values: changes((row) => row.other.headcount) },
    projectSgaRateEnd: { mode: "level", values: levels((row) => ratio(row.project.otherSga, row.project.sales)) },
    otherSgaRateEnd: { mode: "level", values: levels((row) => ratio(row.other.otherSga, row.other.sales)) },
    projectOfficerPayGrowth: { mode: "change", values: changes((row) => perOfficer(row.project)) },
    usefulLife: unavailable(),
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

export function validatePlan(plan: YearPlan[], drivers: Drivers): Validation[] {
  const results: Validation[] = [];
  const fields: (keyof SegmentPlan)[] = ["sales", "cogs", "employeePay", "officerPay", "depreciation", "otherSga", "headcount", "officerCount"];
  for (const row of plan) {
    for (const segmentKey of ["project", "other"] as SegmentKey[]) {
      const segment = row[segmentKey];
      const name = segmentKey === "project" ? "補助事業" : "その他事業";
      for (const field of fields) {
        if (!Number.isFinite(segment[field]) || segment[field] < 0) {
          results.push({ level: "error", title: `${name}に負数または未入力`, detail: `${String(field)}は0以上の数値にしてください。`, year: row.year });
        }
      }
      const cogsRate = segment.sales ? segment.cogs / segment.sales : 0;
      const sgaRate = segment.sales ? segment.otherSga / segment.sales : 0;
      const margin = segment.sales ? operatingProfit(segment) / segment.sales : 0;
      if (cogsRate < 0.45 || cogsRate > 0.88) results.push({ level: "warning", title: `${name}の原価率が暫定レンジ外`, detail: `原価率${(cogsRate * 100).toFixed(1)}%。業種別実績で根拠確認が必要です。`, year: row.year });
      if (sgaRate < 0.04 || sgaRate > 0.25) results.push({ level: "warning", title: `${name}のその他販管費率が暫定レンジ外`, detail: `その他販管費率${(sgaRate * 100).toFixed(1)}%。固定費内訳を確認してください。`, year: row.year });
      if (margin < -0.05 || margin > 0.3) results.push({ level: "warning", title: `${name}の営業利益率を要確認`, detail: `営業利益率${(margin * 100).toFixed(1)}%。過去実績・同業比較・能力増強効果で説明してください。`, year: row.year });
      if (segment.employeePay > 0 && segment.headcount <= 0) results.push({ level: "error", title: `${name}の従業員給与と常時使用する従業員数が不整合`, detail: "従業員給与がある場合は、常時使用する従業員数（就業時間換算）を入力してください。", year: row.year });
      if (segment.officerPay > 0 && segment.officerCount <= 0) results.push({ level: "error", title: `${name}の役員給与と役員数が不整合`, detail: "役員給与がある場合は役員数を入力してください。", year: row.year });
    }
    const company = total(row.project, row.other);
    if (Math.abs(company.sales - row.project.sales - row.other.sales) > 0.0001) results.push({ level: "error", title: "全社合算不一致", detail: "補助事業とその他事業の合計が全社値と一致しません。", year: row.year });
  }

  for (let i = 1; i < plan.length; i += 1) {
    const previous = plan[i - 1];
    const current = plan[i];
    for (const segmentKey of ["project", "other"] as SegmentKey[]) {
      const previousSegment = previous[segmentKey];
      const currentSegment = current[segmentKey];
      const salesChange = previousSegment.sales ? currentSegment.sales / previousSegment.sales - 1 : 0;
      const payPerHeadBefore = previousSegment.employeePay / Math.max(previousSegment.headcount, 1);
      const payPerHeadAfter = currentSegment.employeePay / Math.max(currentSegment.headcount, 1);
      const payChange = payPerHeadBefore ? payPerHeadAfter / payPerHeadBefore - 1 : 0;
      if (Math.abs(salesChange) > 0.4) results.push({ level: "warning", title: "売上の年度変動が大きい", detail: `${segmentKey === "project" ? "補助事業" : "その他事業"}売上が前年比${(salesChange * 100).toFixed(1)}%。立上げ月・顧客別数量で説明が必要です。`, year: current.year });
      if (payChange < 0 || payChange > 0.1) results.push({ level: "warning", title: "従業員1人当たり給与支給総額の年度変動を要確認", detail: `前年比${(payChange * 100).toFixed(1)}%。賃金表・採用構成との整合を確認してください。`, year: current.year });
    }
  }

  if (!results.length) results.push({ level: "info", title: "暫定検証を通過", detail: "汎用レンジ内です。業種別・社内実績による根拠確認は別途必要です。" });
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
    "projectSalesGrowthToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase",
    "otherSalesGrowthToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase",
    "projectSalesGrowth", "otherSalesGrowth", "projectCogsImprovementAfterBase", "otherCogsImprovement",
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
) {
  const original = { ...initial };
  const keys: (keyof Drivers)[] = [
    "projectSalesGrowthToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase",
    "otherSalesGrowthToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase",
    "projectSalesGrowth", "otherSalesGrowth", "projectCogsImprovementAfterBase", "otherCogsImprovement",
    "projectPayGrowth", "otherPayGrowth", "projectHeadcountGrowth", "otherHeadcountGrowth",
    "projectSgaRateEnd", "otherSgaRateEnd", "projectOfficerPayGrowth",
  ];
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79];
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
      for (let sweep = 0; sweep < 4; sweep += 1) {
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

  // The coarse multi-start search can stop just short of a hard boundary because
  // each step size is allowed only four coordinate sweeps.  When that happens,
  // continue from the deterministic best candidate and give the hard constraints
  // lexical priority until no neighbouring coordinate can reduce their violation.
  // This pass is deliberately skipped for already-feasible solutions so normal
  // optimizations do not pay the extra cost.
  if (best.requiredViolation > constraintTolerance || best.hardViolation > constraintTolerance) {
    hardRepair: for (const fraction of [0.003, 0.001, 0.0003, 0.0001, 0.00003]) {
      for (let sweep = 0; sweep < 64; sweep += 1) {
        let next = best;
        for (const key of keys) {
          const [minimum, maximum] = bounds[key];
          const step = Math.max((maximum - minimum) * fraction, 0.000001);
          for (const direction of [-1, 1]) {
            const candidate = evaluate({ ...best.drivers, [key]: best.drivers[key] + direction * step });
            if (better(candidate, next)) next = candidate;
          }
        }
        if (next === best) break;
        best = next;
        if (best.requiredViolation <= constraintTolerance && best.hardViolation <= constraintTolerance) break hardRepair;
      }
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
