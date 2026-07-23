import type { Drivers, MetricKey, YearPlan } from "./model";

export type ApplicationCategory = "" | "general" | "hundredBillion";
export const defaultApplicationCategory: Exclude<ApplicationCategory, ""> = "general";

export const applicationCategoryLabels: Record<Exclude<ApplicationCategory, "">, string> = {
  general: "一般企業（100億宣言企業以外）",
  hundredBillion: "100億宣言企業",
};

export function applicationRequirements(category: ApplicationCategory) {
  if (!category) return null;
  return {
    investmentMinimum: category === "hundredBillion" ? 15 : 20,
    projectPayCagrMinimum: category === "general" ? 5 : 4.5,
  };
}

export function maximumSubsidyAmount(investment: number) {
  const exactMaximum = Math.min(50, Math.max(0, investment) / 3);
  return Math.floor((exactMaximum + Number.EPSILON) * 100) / 100;
}

export function driverRequirementLabel(key: keyof Drivers, category: ApplicationCategory, investment: number) {
  const requirements = applicationRequirements(category);
  if (key === "projectPayGrowthToBase") return "基準年度額が最新決算期額以上（成長率0%以上）";
  if (key === "investment") return requirements ? `${requirements.investmentMinimum}億円以上（専門家経費・外注費を除く補助対象経費）` : "申請区分の選択後に確定";
  if (key === "subsidy") return `50億円以下、かつ投資額の1/3以下（現在上限${maximumSubsidyAmount(investment).toFixed(2)}億円）`;
  return "—";
}

export function driverConstraintFailure(key: keyof Drivers, category: ApplicationCategory, drivers: Drivers) {
  const requirements = applicationRequirements(category);
  if (key === "projectPayGrowthToBase" && drivers.projectPayGrowthToBase < 0) return "基準年度額が最新決算期額以上となるよう、0%以上で入力してください";
  if (key === "investment") {
    if (!requirements) return "申請区分を先に選択してください";
    if (drivers.investment < requirements.investmentMinimum) return `制度下限${requirements.investmentMinimum}億円以上で入力してください`;
  }
  if (key === "subsidy") {
    if (drivers.subsidy < 0) return "0億円以上で入力してください";
    if (drivers.subsidy > 50) return "制度上限50億円以下で入力してください";
    const maximum = maximumSubsidyAmount(drivers.investment);
    if (drivers.subsidy > maximum + 1e-9) return `投資額の1/3以下（現在${maximum.toFixed(2)}億円以下）で入力してください`;
  }
  return null;
}

export function metricRequirementLabel(key: MetricKey, category: ApplicationCategory) {
  const requirements = applicationRequirements(category);
  if (key === "employeePayCagr") return requirements ? `${requirements.projectPayCagrMinimum.toFixed(1)}%/年以上` : "申請区分の選択後に確定";
  if (key === "companyPaySchedule") return "制度必達ではない（物価上昇率超を審査上重視）";
  return "—";
}

export function requiredMetricMinimums(category: ApplicationCategory): Partial<Record<MetricKey, number>> {
  const requirements = applicationRequirements(category);
  return requirements ? { employeePayCagr: requirements.projectPayCagrMinimum } : {};
}

export function systemConstraintFailures(category: ApplicationCategory, drivers: Drivers, actual: Record<MetricKey, number>, plan?: YearPlan[]) {
  const requirements = applicationRequirements(category);
  if (!requirements) return ["申請区分が未選択です"];
  const failures: string[] = [];
  const investmentFailure = driverConstraintFailure("investment", category, drivers);
  const subsidyFailure = driverConstraintFailure("subsidy", category, drivers);
  if (investmentFailure) failures.push(`補助事業投資額：${investmentFailure}`);
  if (subsidyFailure) failures.push(`申請補助金額：${subsidyFailure}`);
  const latest = plan?.find((row) => row.role === "latest")?.project;
  const base = plan?.find((row) => row.role === "base")?.project;
  const usesEmployees = (base?.headcount ?? 0) > 0;
  const latestPay = latest && (usesEmployees ? latest.employeePay / latest.headcount : latest.officerPay / latest.officerCount);
  const basePay = base && (usesEmployees ? base.employeePay / base.headcount : base.officerPay / base.officerCount);
  const basePayFalls = latestPay !== undefined && basePay !== undefined && Number.isFinite(latestPay) && Number.isFinite(basePay) && basePay + 1e-9 < latestPay;
  if (basePayFalls || (!plan && drivers.projectPayGrowthToBase < 0)) failures.push("基準年度の補助事業1人当たり給与支給総額が最新決算期を下回っています");
  if (!Number.isFinite(actual.employeePayCagr) || actual.employeePayCagr < requirements.projectPayCagrMinimum) failures.push(`補助事業1人当たり給与支給総額の年平均上昇率が制度下限${requirements.projectPayCagrMinimum.toFixed(1)}%を下回っています`);
  return failures;
}
