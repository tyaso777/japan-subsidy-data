// 標準提案の「過去3期から設定 → 初回最適化 → 一部将来入力 → 再最適化」を再現し、
// sample-proposals.ts に固定する調整水準・目標値・計画値を確認するための開発用スクリプト。
import {
  calculateMetrics,
  calculateHistoricalDriverSeries,
  calculateScaleDependentTargetDefaults,
  createForecastProjectPeriodInputs,
  createHistoricalPlan,
  DEFAULT_TIMELINE,
  defaultDrivers,
  defaultTargets,
  driverBounds,
  generatePlan,
  isSixthRoundReferenceMetric,
  optimizeDrivers,
  sampleBasePlan,
  sampleBalanceSheets,
  sampleDrivers,
  type Drivers,
  type MetricKey,
  type SegmentPlan,
  type Target,
  type YearPlan,
} from "../app/model";
import { maximumSubsidyAmount } from "../app/application-rules";
import { requiredMetricMinimums } from "../app/application-rules";
import { defaultMetricGroupBases, metricBasisRole } from "../app/metric-groups";

const round = (value: number) => Number(value.toFixed(2));
const historical = createHistoricalPlan(sampleBasePlan, DEFAULT_TIMELINE);
const adjustable = [
  "projectSalesGrowthToBase", "projectCogsImprovementToBase", "projectPayGrowthToBase", "projectHeadcountGrowthToBase", "projectSgaImprovementToBase", "projectOfficerPayGrowthToBase",
  "otherSalesGrowthToBase", "otherCogsImprovementToBase", "otherPayGrowthToBase", "otherHeadcountGrowthToBase", "otherSgaImprovementToBase",
  "projectSalesGrowth", "otherSalesGrowth", "projectCogsImprovementAfterBase", "otherCogsImprovement",
  "projectPayGrowth", "otherPayGrowth", "projectHeadcountGrowth", "otherHeadcountGrowth",
  "projectSgaRateEnd", "otherSgaRateEnd", "projectOfficerPayGrowth",
] satisfies (keyof Drivers)[];
const equipmentStatistical = new Set<keyof Drivers>(adjustable.slice(0, 11));
const postBaseBenchmarks: Partial<Record<keyof Drivers, { initial: number; lower: number; upper: number }>> = {
  projectSalesGrowth: { initial: 0.22, lower: 0.15, upper: 0.30 },
  projectCogsImprovementAfterBase: { initial: 0.015, lower: 0, upper: 0.03 },
  projectPayGrowth: { initial: 0.07, lower: 0.05, upper: 0.10 },
  projectHeadcountGrowth: { initial: 0.04, lower: 0, upper: 0.08 },
  projectOfficerPayGrowth: { initial: 0.07, lower: 0.05, upper: 0.10 },
};
const fallbacks: Partial<Record<keyof Drivers, { initial: number; lower: number; upper: number }>> = {
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
const clamp = (value: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, value));
const initialDrivers = structuredClone(defaultDrivers);
const workflowBounds = structuredClone(driverBounds);
initialDrivers.projectMarketGrowth = 0.05;
initialDrivers.usefulLife = 10;
const annualCapex = sampleBalanceSheets.reduce((sum, row) => sum + row.capex, 0) / sampleBalanceSheets.length;
initialDrivers.investment = round(annualCapex * (DEFAULT_TIMELINE.baseYear - DEFAULT_TIMELINE.latestYear));
initialDrivers.subsidy = maximumSubsidyAmount(initialDrivers.investment);
initialDrivers.localBenchmark = sampleDrivers.localBenchmark;
const historicalSeries = calculateHistoricalDriverSeries(historical, sampleBalanceSheets);
for (const key of adjustable) {
  const history = historicalSeries[key];
  const observed = history.values.filter(Number.isFinite);
  const [defaultLower, defaultUpper] = driverBounds[key];
  if (!observed.length) {
    const fallback = fallbacks[key] ?? postBaseBenchmarks[key];
    if (fallback) {
      initialDrivers[key] = clamp(fallback.initial, defaultLower, defaultUpper);
      workflowBounds[key] = [clamp(fallback.lower, defaultLower, defaultUpper), clamp(fallback.upper, defaultLower, defaultUpper)];
    }
    continue;
  }
  const useMeanAndDeviation = equipmentStatistical.has(key);
  const mean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
  const standardDeviation = Math.sqrt(observed.reduce((sum, value) => sum + (value - mean) ** 2, 0) / observed.length);
  const benchmark = postBaseBenchmarks[key];
  if (benchmark && key !== "projectOfficerPayGrowth") {
    initialDrivers[key] = clamp(benchmark.initial, defaultLower, defaultUpper);
    workflowBounds[key] = [clamp(benchmark.lower, defaultLower, defaultUpper), clamp(benchmark.upper, defaultLower, defaultUpper)];
    continue;
  }
  if (key === "projectSgaRateEnd") {
    initialDrivers[key] = clamp(mean - 0.015, defaultLower, defaultUpper);
    workflowBounds[key] = [clamp(mean - 0.04, defaultLower, defaultUpper), clamp(mean + 0.01, defaultLower, defaultUpper)];
    continue;
  }
  const initial = useMeanAndDeviation ? mean : history.mode === "change"
    ? observed.length > 1 ? observed.at(-2)! * 0.4 + observed.at(-1)! * 0.6 : observed[0]
    : observed.length >= 3 ? observed[0] * 0.2 + observed[1] * 0.3 + observed[2] * 0.5 : observed.at(-1)!;
  const observedLower = Math.min(...observed);
  const observedUpper = Math.max(...observed);
  const buffer = Math.max((observedUpper - observedLower) * 0.5, history.mode === "change" ? 0.01 : 0.02);
  const boundedInitial = clamp(initial, defaultLower, defaultUpper);
  initialDrivers[key] = boundedInitial;
  workflowBounds[key] = useMeanAndDeviation
    ? [clamp(mean - 2 * standardDeviation, defaultLower, defaultUpper), clamp(mean + 2 * standardDeviation, defaultLower, defaultUpper)]
    : [Math.min(boundedInitial, clamp(observedLower - buffer, defaultLower, defaultUpper)), Math.max(boundedInitial, clamp(observedUpper + buffer, defaultLower, defaultUpper))];
}
const lift = (afterBase: keyof Drivers, toBase: keyof Drivers, amount: number) => {
  const [lower, upper] = driverBounds[afterBase];
  initialDrivers[afterBase] = clamp(initialDrivers[toBase] + amount, lower, upper);
  workflowBounds[afterBase] = [
    Math.min(initialDrivers[afterBase], clamp(workflowBounds[toBase][0] + amount, lower, upper)),
    Math.max(initialDrivers[afterBase], clamp(workflowBounds[toBase][1] + amount, lower, upper)),
  ];
};
lift("otherSalesGrowth", "otherSalesGrowthToBase", 0.02);
lift("otherCogsImprovement", "otherCogsImprovementToBase", 0.005);
lift("otherPayGrowth", "otherPayGrowthToBase", 0.005);
lift("otherHeadcountGrowth", "otherHeadcountGrowthToBase", 0.005);
const latestOther = historical.at(-1)!.other;
const latestOtherSgaRate = latestOther.sales ? latestOther.otherSga / latestOther.sales : 0.10;
const otherBaseSgaRate = latestOtherSgaRate - initialDrivers.otherSgaImprovementToBase;
initialDrivers.otherSgaRateEnd = clamp(otherBaseSgaRate - Math.max(0, initialDrivers.otherSgaImprovementToBase + 0.005), driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]);
workflowBounds.otherSgaRateEnd = [
  clamp(initialDrivers.otherSgaRateEnd - 0.02, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]),
  clamp(initialDrivers.otherSgaRateEnd + 0.01, driverBounds.otherSgaRateEnd[0], driverBounds.otherSgaRateEnd[1]),
];
const initialPeriod = createForecastProjectPeriodInputs(historical[2], initialDrivers, DEFAULT_TIMELINE);
const initialPlan = generatePlan(historical, initialDrivers, DEFAULT_TIMELINE, initialPeriod);
const targets = structuredClone(defaultTargets);
for (const [key, values] of Object.entries(calculateScaleDependentTargetDefaults(initialPlan, targets)) as [MetricKey, { value: number; max: number }][]) {
  targets[key] = { ...targets[key], ...values };
}
targets.companySalesCagr.value = 20;
targets.companyPaySchedule.value = 2;
targets.projectSalesShare.value = 65;
targets.investmentSalesRatio.value = 15;
const optimizationTargets = Object.fromEntries((Object.keys(targets) as MetricKey[]).map((key) => [
  key,
  !isSixthRoundReferenceMetric(key) && metricBasisRole(key, defaultMetricGroupBases) !== "result"
    ? { ...targets[key], policy: "hard", max: undefined }
    : { ...targets[key], policy: "monitor", max: undefined },
])) as Record<MetricKey, Target>;

const first = optimizeDrivers(
  initialDrivers,
  historical,
  DEFAULT_TIMELINE,
  optimizationTargets,
  initialPeriod,
  initialPlan,
  workflowBounds,
  true,
  undefined,
  requiredMetricMinimums("general"),
);
const firstPeriod = createForecastProjectPeriodInputs(historical[2], first.drivers, DEFAULT_TIMELINE);
const firstPlan = generatePlan(historical, first.drivers, DEFAULT_TIMELINE, firstPeriod);
const firstInputYear = DEFAULT_TIMELINE.baseYear + 1;
const firstInputRow = firstPlan.find((row) => row.year === firstInputYear)!;
const overrides = {
  [`${firstInputYear}:other:sales`]: round(firstInputRow.other.sales * 1.01),
  [`${firstInputYear}:project:7-8`]: round(firstInputRow.project.employeePay * 0.95),
};

const applyOverrides = (plan: YearPlan[]) => {
  const result = structuredClone(plan);
  const fields: (keyof SegmentPlan)[] = ["sales"];
  for (const field of fields) {
    let anchored = false;
    for (let index = 3; index < result.length; index += 1) {
      const key = `${result[index].year}:other:${field}`;
      if (Object.hasOwn(overrides, key)) {
        result[index].other[field] = overrides[key as keyof typeof overrides];
        anchored = true;
      } else if (anchored) {
        const previousAuto = plan[index - 1].other[field];
        const previousEffective = result[index - 1].other[field];
        const currentAuto = plan[index].other[field];
        result[index].other[field] = round(Math.abs(previousAuto) > 1e-9
          ? previousEffective * currentAuto / previousAuto
          : previousEffective + currentAuto - previousAuto);
      }
    }
  }
  let projectPayAnchored = false;
  for (let index = 3; index < result.length; index += 1) {
    const key = `${result[index].year}:project:7-8`;
    if (Object.hasOwn(overrides, key)) {
      result[index].project.employeePay = overrides[key as keyof typeof overrides];
      projectPayAnchored = true;
    } else if (projectPayAnchored) {
      const previousAuto = plan[index - 1].project.employeePay;
      const previousEffective = result[index - 1].project.employeePay;
      const currentAuto = plan[index].project.employeePay;
      result[index].project.employeePay = round(Math.abs(previousAuto) > 1e-9
        ? previousEffective * currentAuto / previousAuto
        : previousEffective + currentAuto - previousAuto);
    }
  }
  return result;
};

const initialPlanWithInputs = applyOverrides(initialPlan);
const second = optimizeDrivers(
  initialDrivers,
  historical,
  DEFAULT_TIMELINE,
  optimizationTargets,
  initialPeriod,
  initialPlanWithInputs,
  workflowBounds,
  true,
  applyOverrides,
  requiredMetricMinimums("general"),
);
const secondPeriod = createForecastProjectPeriodInputs(historical[2], second.drivers, DEFAULT_TIMELINE);
const secondPlan = applyOverrides(generatePlan(historical, second.drivers, DEFAULT_TIMELINE, secondPeriod));

console.log(JSON.stringify({
  targets,
  workflowBounds,
  initialDrivers,
  first: { ...first, actual: calculateMetrics(firstPlan, first.drivers) },
  overrides,
  second: { ...second, actual: calculateMetrics(secondPlan, second.drivers) },
}, null, 2));
