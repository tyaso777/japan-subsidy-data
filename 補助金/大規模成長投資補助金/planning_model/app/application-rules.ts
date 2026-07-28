import type { Drivers, MetricKey, YearPlan } from "./model";
import { okuToInternalMoney, toDisplayMoney } from "./money";

export type ApplicationCategory = "" | "general" | "hundredBillion";
export const defaultApplicationCategory: Exclude<ApplicationCategory, ""> = "general";

export const applicationCategoryLabels: Record<Exclude<ApplicationCategory, "">, string> = {
  general: "一般企業（100億宣言企業以外）",
  hundredBillion: "100億宣言企業",
};

export function applicationRequirements(category: ApplicationCategory) {
  if (!category) return null;
  return {
    investmentMinimum: okuToInternalMoney(category === "hundredBillion" ? 15 : 20),
    projectPayCagrMinimum: category === "general" ? 5 : 4.5,
  };
}

export function maximumSubsidyAmount(investment: number) {
  const exactMaximum = Math.min(okuToInternalMoney(50), Math.max(0, investment) / 3);
  return Math.floor(exactMaximum / 1_000) * 1_000;
}

export function driverRequirementFloor(key: keyof Drivers, category: ApplicationCategory = "") {
  if (key === "projectPayGrowthToBase") return 0;
  if (key === "projectPayGrowth") {
    const requirements = applicationRequirements(category);
    return requirements ? requirements.projectPayCagrMinimum / 100 : undefined;
  }
  return undefined;
}

export function projectPayGrowthToBaseFloor(inflationPercent?: number | null) {
  if (inflationPercent === null || inflationPercent === undefined || !Number.isFinite(inflationPercent)) return 0;
  return Math.max(0, inflationPercent / 100);
}

export function driverReviewNote(key: keyof Drivers) {
  if (key === "projectPayGrowthToBase") {
    return "全社の足元賃上げは0%以上が必須。物価上昇率超を審査上重視";
  }
  return "";
}

export type InflationComparisonStatus = "above" | "equal" | "below";

export function comparePayGrowthWithInflation(planPercent: number, inflationPercent: number) {
  const difference = Math.round((planPercent - inflationPercent) * 1000) / 1000;
  const status: InflationComparisonStatus = difference > 1e-9 ? "above" : difference < -1e-9 ? "below" : "equal";
  return { difference, status };
}

export function normalizeDriverValueForRequirements(key: keyof Drivers, value: number) {
  const floor = driverRequirementFloor(key);
  return floor === undefined ? value : Math.max(floor, value);
}

export function normalizeDriverRangeForRequirements(key: keyof Drivers, range: [number, number]): [number, number] {
  const first = normalizeDriverValueForRequirements(key, range[0]);
  const second = normalizeDriverValueForRequirements(key, range[1]);
  return [first, second];
}

export function driverRangeOrderingFailure(lower: number | null, upper: number | null) {
  if (lower === null || upper === null) return null;
  return lower > upper ? "下限は上限以下にしてください" : null;
}

export function driverRangeRequirementFailure(
  key: keyof Drivers,
  category: ApplicationCategory,
  lower: number | null,
  inflationPercent?: number | null,
) {
  if (lower === null) return null;
  const floor = key === "projectPayGrowthToBase"
    ? projectPayGrowthToBaseFloor(inflationPercent)
    : driverRequirementFloor(key, category);
  if (floor === undefined || lower + 1e-12 >= floor) return null;
  const floorType = key === "projectPayGrowthToBase" && projectPayGrowthToBaseFloor(inflationPercent) > 0
    ? "外部前提下限"
    : "制度下限";
  return `${floorType}${(floor * 100).toFixed(1)}%/年以上で入力してください`;
}

export function driverRequirementLabel(key: keyof Drivers, category: ApplicationCategory, investment: number) {
  const requirements = applicationRequirements(category);
  if (key === "projectPayGrowthToBase") return "基準年度額が最新決算期額以上（成長率0%以上）";
  if (key === "projectPayGrowth") return requirements ? `制度下限${requirements.projectPayCagrMinimum.toFixed(1)}%/年（基準年→事業化報告3年目）` : "申請区分の選択後に確定";
  if (key === "investment") return requirements ? `${toDisplayMoney(requirements.investmentMinimum, "億円")}億円以上（専門家経費・外注費を除く補助対象経費）` : "申請区分の選択後に確定";
  if (key === "subsidy") return `50億円以下、かつ投資額の1/3以下（現在上限${toDisplayMoney(maximumSubsidyAmount(investment), "億円").toFixed(2)}億円）`;
  return "—";
}

export function driverConstraintFailure(key: keyof Drivers, category: ApplicationCategory, drivers: Drivers) {
  const requirements = applicationRequirements(category);
  if (key === "projectPayGrowthToBase" && drivers.projectPayGrowthToBase < 0) return "基準年度額が最新決算期額以上となるよう、0%以上で入力してください";
  if (key === "investment") {
    if (!requirements) return "申請区分を先に選択してください";
    if (drivers.investment < requirements.investmentMinimum) return `制度下限${toDisplayMoney(requirements.investmentMinimum, "億円")}億円以上で入力してください`;
  }
  if (key === "subsidy") {
    if (drivers.subsidy < 0) return "0億円以上で入力してください";
    if (drivers.subsidy > okuToInternalMoney(50)) return "制度上限50億円以下で入力してください";
    const maximum = maximumSubsidyAmount(drivers.investment);
    if (drivers.subsidy > maximum + 1e-9) return `投資額の1/3以下（現在${toDisplayMoney(maximum, "億円").toFixed(2)}億円以下）で入力してください`;
  }
  return null;
}

export function metricRequirementLabel(key: MetricKey, category: ApplicationCategory) {
  const requirements = applicationRequirements(category);
  if (key === "employeePayCagr") return requirements ? `${requirements.projectPayCagrMinimum.toFixed(1)}%/年以上` : "申請区分の選択後に確定";
  if (key === "companyPaySchedule") return "0.0%/年以上（物価上昇率超を審査上重視）";
  return "—";
}

export function requiredMetricMinimums(category: ApplicationCategory): Partial<Record<MetricKey, number>> {
  const requirements = applicationRequirements(category);
  return requirements ? { companyPaySchedule: 0, employeePayCagr: requirements.projectPayCagrMinimum } : {};
}

export function systemConstraintFailures(category: ApplicationCategory, drivers: Drivers, actual: Record<MetricKey, number>, _plan?: YearPlan[]) {
  const requirements = applicationRequirements(category);
  if (!requirements) return ["申請区分が未選択です"];
  const failures: string[] = [];
  const investmentFailure = driverConstraintFailure("investment", category, drivers);
  const subsidyFailure = driverConstraintFailure("subsidy", category, drivers);
  if (investmentFailure) failures.push(`補助事業投資額：${investmentFailure}`);
  if (subsidyFailure) failures.push(`申請補助金額：${subsidyFailure}`);
  if (!Number.isFinite(actual.companyPaySchedule) || actual.companyPaySchedule < -1e-9) {
    failures.push("全社の従業員1人当たり給与支給総額の年平均上昇率（最新決算期→基準年度）が制度下限0.0%を下回っています");
  }
  if (!Number.isFinite(actual.employeePayCagr) || actual.employeePayCagr < requirements.projectPayCagrMinimum) failures.push(`補助事業1人当たり給与支給総額の年平均上昇率が制度下限${requirements.projectPayCagrMinimum.toFixed(1)}%を下回っています`);
  return failures;
}
