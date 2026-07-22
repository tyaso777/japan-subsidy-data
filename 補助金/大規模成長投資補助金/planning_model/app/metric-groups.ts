import type { MetricKey } from "./model";

export type MetricGroupKey = "companySales" | "projectSales" | "laborProductivity" | "employeePay";
export type MetricGroupBasis = "rate" | "amount" | "both";

export type MetricLinkGroup = {
  key: MetricGroupKey;
  label: string;
  rateKey: MetricKey;
  amountKey: MetricKey;
  rateLabel: string;
  amountLabel: string;
  relation: string;
};

export const metricLinkGroups: MetricLinkGroup[] = [
  { key: "companySales", label: "全社売上高", rateKey: "companySalesCagr", amountKey: "companySalesIncrease", rateLabel: "年平均成長率", amountLabel: "売上高増加額", relation: "最新決算期の全社売上高を起点に相互換算" },
  { key: "projectSales", label: "補助事業売上高", rateKey: "projectSalesCagr", amountKey: "projectSalesIncrease", rateLabel: "年平均成長率", amountLabel: "売上高増加額", relation: "基準年の補助事業売上高を起点に相互換算" },
  { key: "laborProductivity", label: "労働生産性・付加価値", rateKey: "laborProductivityCagr", amountKey: "valueAddedIncrease", rateLabel: "労働生産性成長率", amountLabel: "付加価値増加額", relation: "付加価値額と常時使用する従業員数から連動" },
  { key: "employeePay", label: "従業員給与", rateKey: "employeePayCagr", amountKey: "employeePayIncrease", rateLabel: "1人当たり給与上昇率", amountLabel: "給与支給総額増加額", relation: "給与支給総額と常時使用する従業員数から連動" },
];

export const defaultMetricGroupBases: Record<MetricGroupKey, MetricGroupBasis> = {
  companySales: "rate",
  projectSales: "rate",
  laborProductivity: "rate",
  employeePay: "rate",
};

export const metricGroupByMetric = new Map(metricLinkGroups.flatMap((group) => [
  [group.rateKey, group] as const,
  [group.amountKey, group] as const,
]));

export function metricBasisRole(metric: MetricKey, bases: Record<MetricGroupKey, MetricGroupBasis>) {
  const group = metricGroupByMetric.get(metric);
  if (!group) return "independent" as const;
  const basis = bases[group.key];
  if (basis === "both") return "basis" as const;
  return (basis === "rate" ? group.rateKey : group.amountKey) === metric ? "basis" as const : "result" as const;
}
