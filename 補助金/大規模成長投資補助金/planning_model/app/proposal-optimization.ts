import { requiredMetricMinimums, type ApplicationCategory } from "./application-rules";
import { hasInputValue, inputKey, type InputValues } from "./input-values";
import { metricBasisRole, type MetricGroupBasis, type MetricGroupKey } from "./metric-groups";
import {
  calculateMetrics,
  createForecastProjectPeriodInputs,
  generatePlan,
  hardTargetSummary,
  isOptimizationExcludedMetric,
  objective,
  optimizeDrivers,
  type Drivers,
  type MetricKey,
  type Target,
  type TimelineSettings,
  type YearPlan,
} from "./model";

export function createOptimizationTargets(
  targets: Record<MetricKey, Target>,
  inputValues: InputValues,
  metricGroupBases: Record<MetricGroupKey, MetricGroupBasis>,
) {
  return Object.fromEntries((Object.keys(targets) as MetricKey[]).map((key) => [
    key,
    !isOptimizationExcludedMetric(key)
      && hasInputValue(inputValues, inputKey.target(key, "value"))
      && metricBasisRole(key, metricGroupBases) !== "result"
      ? { ...targets[key], policy: "hard", max: undefined }
      : { ...targets[key], policy: "monitor", max: undefined },
  ])) as Record<MetricKey, Target>;
}

type PlanningOptimizationInput = {
  drivers: Drivers;
  historicalPlan: YearPlan[];
  timeline: TimelineSettings;
  optimizationTargets: Record<MetricKey, Target>;
  driverRanges: Record<keyof Drivers, [number, number]>;
  applicationCategory: ApplicationCategory;
  planTransform: (plan: YearPlan[]) => YearPlan[];
};

export function runPlanningOptimization({
  drivers,
  historicalPlan,
  timeline,
  optimizationTargets,
  driverRanges,
  applicationCategory,
  planTransform,
}: PlanningOptimizationInput) {
  const sourceHistorical = historicalPlan.slice(0, 3);
  const periodInput = createForecastProjectPeriodInputs(sourceHistorical[2], drivers, timeline);
  const sourcePlan = planTransform(generatePlan(sourceHistorical, drivers, timeline, periodInput));
  const optimizationBounds = Object.fromEntries((Object.keys(driverRanges) as (keyof Drivers)[]).map((key) => {
    const [first, second] = driverRanges[key];
    const lower = Math.min(first, second);
    const upper = Math.max(first, second);
    return [key, key === "projectPayGrowthToBase" ? [Math.max(0, lower), Math.max(0, upper)] : [lower, upper]];
  })) as Record<keyof Drivers, [number, number]>;
  const beforeScore = objective(
    drivers,
    drivers,
    sourceHistorical,
    timeline,
    optimizationTargets,
    periodInput,
    sourcePlan,
    optimizationBounds,
    true,
    planTransform,
  );
  const result = optimizeDrivers(
    drivers,
    sourceHistorical,
    timeline,
    optimizationTargets,
    periodInput,
    sourcePlan,
    optimizationBounds,
    true,
    planTransform,
    requiredMetricMinimums(applicationCategory),
  );
  const solvedPeriodInput = createForecastProjectPeriodInputs(sourceHistorical[2], result.drivers, timeline);
  const plan = planTransform(generatePlan(sourceHistorical, result.drivers, timeline, solvedPeriodInput));
  const actual = calculateMetrics(plan, result.drivers);
  return {
    drivers: result.drivers,
    score: result.score,
    beforeScore,
    plan,
    actual,
    failed: hardTargetSummary(actual, optimizationTargets).failed,
  };
}
