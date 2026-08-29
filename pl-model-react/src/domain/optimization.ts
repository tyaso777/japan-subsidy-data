import type { ForecastModel, ForecastPeriod } from './forecast-engine';
import { buildForecastPl, projectForecastSeries } from './forecast-engine';
import { calculatePlSeries, combinePlInputs } from './financials';
import { createManagementMetricEvaluator, resolveMetricTarget } from './metrics';
import type { HistoricalPlCalculated, HistoricalPlInput, ProgramConfiguration } from './types';
import { clampToForecastRange, defaultForecastRange, isForecastRangeLocked, normalizeForecastRanges } from './forecast-range';
import { orderForecastSeriesByPl } from './forecast-series-order';

export type OptimizationChange = {
  seriesId: string;
  periodId: string;
  field: 'annualGrowthRate';
  before: number;
  after: number;
  delta: number;
  direction: 'up' | 'down' | 'flat';
  momentum: number;
};

export type OptimizationStrategy = 'minimum-change' | 'balanced' | 'sparse' | 'priority';
export type OptimizationRangeMode = 'within-levels' | 'outside-levels';

export type OptimizationProposal = {
  strategy: OptimizationStrategy;
  baseline: ForecastModel;
  optimized: ForecastModel;
  beforeScore?: number;
  afterScore?: number;
  changes: OptimizationChange[];
  feasibility: 'feasible' | 'infeasible' | 'unavailable';
  metricDiagnostics: OptimizationMetricDiagnostic[];
  boundDiagnostics: OptimizationBoundDiagnostic[];
  expansionPlan?: OptimizationExpansionPlan;
};

export type OptimizationExpansionEntry = {
  seriesId: string;
  seriesLabel: string;
  periodId: string;
  boundary: 'min' | 'max';
  before: number;
  after: number;
  affectedMetricLabels: string[];
};

export type OptimizationExpansionPlan = {
  status: 'feasible' | 'best-effort';
  expandedModel: ForecastModel;
  entries: OptimizationExpansionEntry[];
  metricDiagnostics: OptimizationMetricDiagnostic[];
};

export type OptimizationConstraintMeasurement = {
  id: string;
  label: string;
  value?: number;
  target: number;
  direction: 'min' | 'max';
  unit: string;
  tolerance?: number;
};

export type OptimizationMetricDiagnostic = OptimizationConstraintMeasurement & {
  status: 'met' | 'unmet' | 'unavailable';
  gap?: number;
};

export type OptimizationBoundEstimate = {
  metricId: string;
  metricLabel: string;
  requiredExpansion: number;
  proposedLimit: number;
  unit: string;
};

export type OptimizationBoundDiagnostic = {
  seriesId: string;
  seriesLabel: string;
  periodId: string;
  boundary: 'min' | 'max';
  value: number;
  limit: number;
  estimates: OptimizationBoundEstimate[];
};

type Options = { strategy?: OptimizationStrategy; iterations?: number; initialStep?: number; minimumStep?: number; movementWeight?: number; expansionIterations?: number; includeExpansionPlan?: boolean; preferredModel?: ForecastModel };

type SearchParameter = { seriesId: string; periodId: string; period: ForecastPeriod; baseline: number; min: number; max: number; preferredMin?: number; preferredMax?: number };
type SearchContext = {
  model: ForecastModel;
  parameters: SearchParameter[];
  evaluate: (candidate: ForecastModel) => number;
  initialScore: number;
  iterations: number;
  initialStep: number;
  minimumStep: number;
};

function improveParameter(context: SearchContext, parameter: SearchParameter, step: number, currentScore: number) {
  const period = parameter.period;
  const original = period.annualGrowthRate;
  let value = original;
  let score = currentScore;
  for (const direction of [1, -1]) {
    period.annualGrowthRate = Math.max(parameter.min, Math.min(parameter.max, original + step * direction));
    const candidateScore = context.evaluate(context.model);
    if (Number.isFinite(candidateScore) && candidateScore < score) { score = candidateScore; value = period.annualGrowthRate; }
  }
  period.annualGrowthRate = value;
  return { score, improved: score < currentScore };
}

function searchMinimumChange(context: SearchContext) {
  let score = context.initialScore;
  let step = context.initialStep;
  for (let iteration = 0; iteration < context.iterations; iteration += 1) {
    let improved = false;
    for (const parameter of context.parameters) {
      const result = improveParameter(context, parameter, step, score);
      score = result.score;
      improved ||= result.improved;
    }
    if (!improved) step /= 2;
    if (step < context.minimumStep || score === 0) break;
  }
  return score;
}

function searchByPriority(context: SearchContext) {
  let score = context.initialScore;
  for (const parameter of context.parameters) {
    let step = context.initialStep;
    for (let iteration = 0; iteration < context.iterations; iteration += 1) {
      const result = improveParameter(context, parameter, step, score);
      score = result.score;
      if (!result.improved) step /= 2;
      if (step < context.minimumStep || score === 0) break;
    }
  }
  return score;
}

function parameterPeriod(model: ForecastModel, parameter: SearchParameter) {
  return model.series.find((series) => series.id === parameter.seriesId)!.periods.find((period) => period.id === parameter.periodId)!;
}

function normalizedMovement(parameter: SearchParameter) {
  return Math.abs(parameter.period.annualGrowthRate - parameter.baseline) / Math.max((parameter.preferredMax ?? parameter.max) - (parameter.preferredMin ?? parameter.min), .01);
}

function searchBalanced(context: SearchContext) {
  let score = searchMinimumChange(context);
  let step = context.initialStep;
  for (let iteration = 0; iteration < context.iterations; iteration += 1) {
    const source = [...context.parameters].sort((left, right) => normalizedMovement(right) - normalizedMovement(left))[0];
    if (!source || normalizedMovement(source) === 0) break;
    const sourcePeriod = source.period;
    const sourceOriginal = sourcePeriod.annualGrowthRate;
    const sourceDirection = Math.sign(sourceOriginal - source.baseline);
    let best: { target: SearchParameter; sourceValue: number; targetValue: number; score: number } | undefined;
    for (const target of context.parameters) {
      if (target === source) continue;
      const targetPeriod = target.period;
      const targetOriginal = targetPeriod.annualGrowthRate;
      const existingDirection = Math.sign(targetOriginal - target.baseline);
      const targetDirections = existingDirection === 0 ? [1, -1] : [existingDirection];
      for (const targetDirection of targetDirections) {
        for (const multiplier of [.5, 1, 2]) {
          sourcePeriod.annualGrowthRate = Math.max(source.min, Math.min(source.max, sourceOriginal - sourceDirection * step));
          targetPeriod.annualGrowthRate = Math.max(target.min, Math.min(target.max, targetOriginal + targetDirection * step * multiplier));
          const candidateScore = context.evaluate(context.model);
          if (Number.isFinite(candidateScore) && candidateScore < (best?.score ?? score)) {
            best = { target, sourceValue: sourcePeriod.annualGrowthRate, targetValue: targetPeriod.annualGrowthRate, score: candidateScore };
          }
          sourcePeriod.annualGrowthRate = sourceOriginal;
          targetPeriod.annualGrowthRate = targetOriginal;
        }
      }
    }
    if (best) {
      sourcePeriod.annualGrowthRate = best.sourceValue;
      best.target.period.annualGrowthRate = best.targetValue;
      score = best.score;
    } else step /= 2;
    if (step < context.minimumStep) break;
  }
  return score;
}

function searchSparse(context: SearchContext) {
  const rankedParameters = context.parameters.map((parameter, index) => {
    const period = parameter.period;
    const original = period.annualGrowthRate;
    let bestScore = context.initialScore;
    for (const direction of [1, -1]) {
      period.annualGrowthRate = Math.max(parameter.min, Math.min(parameter.max, original + context.initialStep * direction));
      bestScore = Math.min(bestScore, context.evaluate(context.model));
    }
    period.annualGrowthRate = original;
    return { parameter, index, improvement: context.initialScore - bestScore };
  }).sort((left, right) => right.improvement - left.improvement || left.index - right.index);

  return searchByPriority({ ...context, parameters: rankedParameters.map(({ parameter }) => parameter) });
}

const searchStrategies: Record<OptimizationStrategy, (context: SearchContext) => number> = {
  'minimum-change': searchMinimumChange,
  balanced: searchBalanced,
  sparse: searchSparse,
  priority: searchByPriority,
};

export function createOptimizationProposal(model: ForecastModel, objective: (candidate: ForecastModel) => number, options: Options = {}): OptimizationProposal {
  const strategy = options.strategy ?? 'minimum-change';
  const baseline = normalizeForecastRanges(model);
  let optimized = structuredClone(baseline);
  const beforeScore = objective(baseline);
  const movementWeight = options.movementWeight ?? 2;
  const parameters = orderForecastSeriesByPl(optimized.series).filter((series) => series.scope !== 'company' && series.changePolicy !== 'fixed').flatMap((series) => series.periods.flatMap((period) => {
    const configured = period.range ?? defaultForecastRange(series.projectionMode);
    return isForecastRangeLocked(configured) ? [] : [{
      seriesId: series.id,
      periodId: period.id,
      period,
      baseline: period.annualGrowthRate,
      min: configured.min,
      max: configured.max,
    }];
  }));
  const movementScores = (candidate: ForecastModel) => parameters.map((parameter) => {
    const value = parameter.period.annualGrowthRate;
    if (!Number.isFinite(value)) return 0;
    return ((value! - parameter.baseline) / Math.max(parameter.max - parameter.min, .01)) ** 2;
  });
  const evaluate = (candidate: ForecastModel) => {
    const movements = movementScores(candidate);
    const totalMovement = movements.reduce((sum, movement) => sum + movement, 0);
    const activeParameterCount = movements.filter((movement) => movement > 1e-12).length;
    const sparseActivationPenalty = activeParameterCount * Math.max(1, beforeScore * .001);
    const movementPenalty = strategy === 'balanced'
      ? parameters.length * Math.max(0, ...movements) + totalMovement * .05
      : strategy === 'sparse'
        ? totalMovement + sparseActivationPenalty
        : totalMovement;
    return objective(candidate) + movementWeight * movementPenalty;
  };
  const bestScore = searchStrategies[strategy]({
    model: optimized,
    parameters,
    evaluate,
    initialScore: evaluate(optimized),
    iterations: options.iterations ?? 20,
    initialStep: options.initialStep ?? 2,
    minimumStep: options.minimumStep ?? .01,
  });
  const changes: OptimizationChange[] = [];
  for (const beforeSeries of baseline.series) {
    const afterSeries = optimized.series.find((series) => series.id === beforeSeries.id);
    if (!afterSeries) continue;
    for (const beforePeriod of beforeSeries.periods) {
      const afterPeriod = afterSeries.periods.find((period) => period.id === beforePeriod.id);
      if (!afterPeriod || afterPeriod.annualGrowthRate === beforePeriod.annualGrowthRate) continue;
      const delta = afterPeriod.annualGrowthRate - beforePeriod.annualGrowthRate;
      changes.push({ seriesId: beforeSeries.id, periodId: beforePeriod.id, field: 'annualGrowthRate', before: beforePeriod.annualGrowthRate, after: afterPeriod.annualGrowthRate, delta, direction: delta > 0 ? 'up' : 'down', momentum: Math.abs(delta) / Math.max(1, Math.abs(beforePeriod.annualGrowthRate)) });
    }
  }
  return { strategy, baseline, optimized, beforeScore, afterScore: bestScore, changes, feasibility: 'feasible', metricDiagnostics: [], boundDiagnostics: [] };
}

type ConstraintScore = {
  unavailableCount: number;
  feasible: boolean;
  maxViolation: number;
  totalViolation: number;
  cost: number;
};

type ConstraintSearchContext = {
  model: ForecastModel;
  parameters: SearchParameter[];
  evaluate: (candidate: ForecastModel) => ConstraintScore;
  score: ConstraintScore;
  iterations: number;
  initialStep: number;
  minimumStep: number;
};

function constraintDiagnostics(measurements: OptimizationConstraintMeasurement[]): OptimizationMetricDiagnostic[] {
  return measurements.map((measurement) => {
    if (!Number.isFinite(measurement.value)) return { ...measurement, value: undefined, status: 'unavailable' as const };
    const rawGap = measurement.direction === 'min'
      ? Math.max(0, measurement.target - measurement.value!)
      : Math.max(0, measurement.value! - measurement.target);
    const tolerance = measurement.tolerance ?? Math.max(1, Math.abs(measurement.target)) * 1e-8;
    const gap = rawGap <= tolerance ? 0 : rawGap;
    return { ...measurement, status: gap === 0 ? 'met' as const : 'unmet' as const, gap };
  });
}

function finalYearSalesAllocationConstraints(model: ForecastModel): OptimizationConstraintMeasurement[] {
  const allocation = model.finalYearSalesAllocation;
  if (!allocation) return [];
  const salesAt = (scope: 'base' | 'subsidy') => {
    const series = model.series.find((candidate) => candidate.id === `${scope}-sales`);
    return series ? projectForecastSeries(series).find((point) => point.year === allocation.finalYear)?.value : undefined;
  };
  const baseSales = salesAt('base');
  const subsidySales = salesAt('subsidy');
  const total = (baseSales ?? 0) + (subsidySales ?? 0);
  const value = Number.isFinite(baseSales) && Number.isFinite(subsidySales) && total > 0
    ? baseSales! / total * 100
    : undefined;
  const shared = {
    label: '最終年度 ベース事業売上高配分率', value,
    target: allocation.baseSharePercent, unit: '%', tolerance: .05,
  };
  return [
    { ...shared, id: 'final-year-sales-allocation-min', direction: 'min' },
    { ...shared, id: 'final-year-sales-allocation-max', direction: 'max' },
  ];
}

function optimizationVectorKey(model: ForecastModel) {
  return model.series
    .flatMap((series) => series.periods.map((period) => `${series.id}\u001f${period.id}\u001f${period.annualGrowthRate}`))
    .join('\u001e');
}

function isBetterConstraintScore(candidate: ConstraintScore, current: ConstraintScore) {
  const epsilon = 1e-12;
  if (candidate.unavailableCount !== current.unavailableCount) return candidate.unavailableCount < current.unavailableCount;
  if (candidate.feasible !== current.feasible) return candidate.feasible;
  if (!candidate.feasible) {
    if (Math.abs(candidate.maxViolation - current.maxViolation) > epsilon) return candidate.maxViolation < current.maxViolation;
    if (Math.abs(candidate.totalViolation - current.totalViolation) > epsilon) return candidate.totalViolation < current.totalViolation;
  }
  return candidate.cost < current.cost - epsilon;
}

function constrainedCost(parameters: SearchParameter[], strategy: OptimizationStrategy) {
  const movements = parameters.map((parameter) => {
    const value = parameter.period.annualGrowthRate;
    const preferredMin = parameter.preferredMin ?? parameter.min;
    const preferredMax = parameter.preferredMax ?? parameter.max;
    const preferredSpan = Math.max(preferredMax - preferredMin, .01);
    return ((value - parameter.baseline) / preferredSpan) ** 2;
  });
  const outsidePenalty = parameters.reduce((sum, parameter) => {
    const value = parameter.period.annualGrowthRate;
    const preferredMin = parameter.preferredMin ?? parameter.min;
    const preferredMax = parameter.preferredMax ?? parameter.max;
    const preferredSpan = Math.max(preferredMax - preferredMin, .01);
    const outside = value < preferredMin ? preferredMin - value : value > preferredMax ? value - preferredMax : 0;
    const normalized = outside / preferredSpan;
    return sum + 5 * normalized ** 2 + 20 * Math.max(0, normalized - .5) ** 2;
  }, 0);
  const total = movements.reduce((sum, movement) => sum + movement, 0);
  if (strategy === 'balanced') return Math.max(0, ...movements) + .05 * total / Math.max(parameters.length, 1) + outsidePenalty;
  if (strategy === 'sparse') return movements.filter((movement) => movement > 1e-12).length + .001 * total + outsidePenalty;
  return total + outsidePenalty;
}

function satisfiesForecastDomain(model: ForecastModel): boolean {
  return model.series.every((series) => {
    if (series.projectionMode === 'compound' && series.periods.some((period) => period.annualGrowthRate <= -100)) return false;
    if (!['money', 'fte', 'count', 'moneyPerPerson', 'index', 'multiple'].includes(series.valueKind)) return true;
    return projectForecastSeries(series).every((point) => Number.isFinite(point.value) && point.value >= 0);
  });
}

function improveConstrainedParameter(context: ConstraintSearchContext, parameter: SearchParameter, step: number) {
  const period = parameter.period;
  const original = period.annualGrowthRate;
  let value = original;
  let score = context.score;
  for (const direction of [1, -1]) {
    period.annualGrowthRate = Math.max(parameter.min, Math.min(parameter.max, original + step * direction));
    const candidateScore = context.evaluate(context.model);
    if (isBetterConstraintScore(candidateScore, score)) { value = period.annualGrowthRate; score = candidateScore; }
  }
  period.annualGrowthRate = value;
  return { score, improved: score !== context.score };
}

function searchConstrainedMinimum(context: ConstraintSearchContext) {
  let step = context.initialStep;
  for (let iteration = 0; iteration < context.iterations; iteration += 1) {
    let improved = false;
    for (const parameter of context.parameters) {
      const result = improveConstrainedParameter(context, parameter, step);
      context.score = result.score;
      improved ||= result.improved;
    }
    if (!improved) step /= 2;
    if (step < context.minimumStep) break;
  }
  return context.score;
}

function searchConstrainedPriority(context: ConstraintSearchContext) {
  if (context.score.feasible) return context.score;
  for (const parameter of context.parameters) {
    let step = context.initialStep;
    for (let iteration = 0; iteration < context.iterations; iteration += 1) {
      const result = improveConstrainedParameter(context, parameter, step);
      context.score = result.score;
      if (!result.improved) step /= 2;
      if (step < context.minimumStep) break;
    }
    if (context.score.feasible) break;
  }
  return context.score;
}

function searchConstrainedSparse(context: ConstraintSearchContext) {
  const ranked = context.parameters.map((parameter, index) => {
    const period = parameter.period;
    const original = period.annualGrowthRate;
    let best = context.score;
    for (const direction of [1, -1]) {
      const proportionalStep = Math.max((parameter.max - parameter.min) * .05, context.minimumStep);
      period.annualGrowthRate = Math.max(parameter.min, Math.min(parameter.max, original + proportionalStep * direction));
      const candidate = context.evaluate(context.model);
      if (isBetterConstraintScore(candidate, best)) best = candidate;
    }
    period.annualGrowthRate = original;
    return { parameter, index, score: best };
  }).sort((left, right) => {
    if (isBetterConstraintScore(left.score, right.score)) return -1;
    if (isBetterConstraintScore(right.score, left.score)) return 1;
    return left.index - right.index;
  });
  return searchConstrainedPriority({ ...context, parameters: ranked.map(({ parameter }) => parameter) });
}

function rankConstrainedParameters(context: ConstraintSearchContext) {
  return context.parameters.map((parameter, index) => {
    const period = parameter.period;
    const original = period.annualGrowthRate;
    let best = context.score;
    for (const direction of [1, -1]) {
      period.annualGrowthRate = Math.max(parameter.min, Math.min(parameter.max, original + context.initialStep * direction));
      const candidate = context.evaluate(context.model);
      if (isBetterConstraintScore(candidate, best)) best = candidate;
    }
    period.annualGrowthRate = original;
    return { parameter, index, score: best };
  }).sort((left, right) => {
    if (isBetterConstraintScore(left.score, right.score)) return -1;
    if (isBetterConstraintScore(right.score, left.score)) return 1;
    return left.index - right.index;
  }).map(({ parameter }) => parameter);
}

function searchConstrainedBalanced(context: ConstraintSearchContext) {
  context.parameters = rankConstrainedParameters(context);
  searchConstrainedMinimum(context);
  if (!context.score.feasible) return context.score;
  let step = context.initialStep;
  for (let iteration = 0; iteration < context.iterations; iteration += 1) {
    const source = [...context.parameters].sort((left, right) => normalizedMovement(right) - normalizedMovement(left))[0];
    if (!source || normalizedMovement(source) === 0) break;
    const sourcePeriod = source.period;
    const sourceOriginal = sourcePeriod.annualGrowthRate;
    const sourceDirection = Math.sign(sourceOriginal - source.baseline);
    let best: { target: SearchParameter; sourceValue: number; targetValue: number; score: ConstraintScore } | undefined;
    for (const target of context.parameters) {
      if (target === source) continue;
      const targetPeriod = target.period;
      const targetOriginal = targetPeriod.annualGrowthRate;
      const existingDirection = Math.sign(targetOriginal - target.baseline);
      for (const targetDirection of existingDirection === 0 ? [1, -1] : [existingDirection]) {
        for (const multiplier of [.5, 1, 2]) {
          sourcePeriod.annualGrowthRate = Math.max(source.min, Math.min(source.max, sourceOriginal - sourceDirection * step));
          targetPeriod.annualGrowthRate = Math.max(target.min, Math.min(target.max, targetOriginal + targetDirection * step * multiplier));
          const candidate = context.evaluate(context.model);
          if (isBetterConstraintScore(candidate, best?.score ?? context.score)) best = { target, sourceValue: sourcePeriod.annualGrowthRate, targetValue: targetPeriod.annualGrowthRate, score: candidate };
          sourcePeriod.annualGrowthRate = sourceOriginal;
          targetPeriod.annualGrowthRate = targetOriginal;
        }
      }
    }
    if (best) {
      sourcePeriod.annualGrowthRate = best.sourceValue;
      best.target.period.annualGrowthRate = best.targetValue;
      context.score = best.score;
    } else step /= 2;
    if (step < context.minimumStep) break;
  }
  return context.score;
}

const constrainedStrategies: Record<OptimizationStrategy, (context: ConstraintSearchContext) => ConstraintScore> = {
  'minimum-change': searchConstrainedMinimum,
  balanced: searchConstrainedBalanced,
  sparse: searchConstrainedSparse,
  priority: searchConstrainedPriority,
};

function proposalChanges(baseline: ForecastModel, optimized: ForecastModel): OptimizationChange[] {
  return baseline.series.flatMap((beforeSeries) => {
    const afterSeries = optimized.series.find((series) => series.id === beforeSeries.id);
    if (!afterSeries) return [];
    return beforeSeries.periods.flatMap((beforePeriod) => {
      const afterPeriod = afterSeries.periods.find((period) => period.id === beforePeriod.id);
      if (!afterPeriod || afterPeriod.annualGrowthRate === beforePeriod.annualGrowthRate) return [];
      const delta = afterPeriod.annualGrowthRate - beforePeriod.annualGrowthRate;
      return [{ seriesId: beforeSeries.id, periodId: beforePeriod.id, field: 'annualGrowthRate' as const, before: beforePeriod.annualGrowthRate, after: afterPeriod.annualGrowthRate, delta, direction: delta > 0 ? 'up' as const : 'down' as const, momentum: Math.abs(delta) / Math.max(1, Math.abs(beforePeriod.annualGrowthRate)) }];
    });
  });
}

function boundDiagnostics(baseline: ForecastModel, optimized: ForecastModel, diagnostics: OptimizationMetricDiagnostic[], evaluateConstraints: (candidate: ForecastModel) => OptimizationConstraintMeasurement[], parameters: SearchParameter[]): OptimizationBoundDiagnostic[] {
  const unmet = diagnostics.filter((metric) => metric.status === 'unmet');
  if (unmet.length === 0) return [];
  return parameters.flatMap((parameter) => {
    const period = parameterPeriod(optimized, parameter);
    const span = Math.max(parameter.max - parameter.min, .01);
    const boundary = Math.abs(period.annualGrowthRate - parameter.max) <= span * 1e-8
      ? 'max' as const
      : Math.abs(period.annualGrowthRate - parameter.min) <= span * 1e-8
        ? 'min' as const
        : undefined;
    if (!boundary) return [];
    const probeDistance = Math.max(span * .05, .1);
    const probed = structuredClone(optimized);
    parameterPeriod(probed, parameter).annualGrowthRate = period.annualGrowthRate + (boundary === 'max' ? probeDistance : -probeDistance);
    const probedById = new Map(evaluateConstraints(probed).map((metric) => [metric.id, metric]));
    const estimates = unmet.flatMap((metric): OptimizationBoundEstimate[] => {
      const probe = probedById.get(metric.id);
      if (!Number.isFinite(metric.value) || !Number.isFinite(probe?.value) || !metric.gap) return [];
      const improvement = metric.direction === 'min' ? probe!.value! - metric.value! : metric.value! - probe!.value!;
      if (improvement <= 1e-12) return [];
      const requiredExpansion = metric.gap / improvement * probeDistance;
      return [{ metricId: metric.id, metricLabel: metric.label, requiredExpansion, proposedLimit: boundary === 'max' ? parameter.max + requiredExpansion : parameter.min - requiredExpansion, unit: metric.unit }];
    });
    const series = baseline.series.find((candidate) => candidate.id === parameter.seriesId)!;
    const scopeLabel = series.scope === 'base' ? 'ベース事業' : series.scope === 'subsidy' ? '補助事業' : '全社';
    return [{ seriesId: parameter.seriesId, seriesLabel: `${scopeLabel} ${series.label}`, periodId: parameter.periodId, boundary, value: period.annualGrowthRate, limit: boundary === 'max' ? parameter.max : parameter.min, estimates }];
  });
}

function* adaptiveOutsideLevelSteps(model: ForecastModel, initial: OptimizationProposal, evaluateConstraints: (candidate: ForecastModel) => OptimizationConstraintMeasurement[], options: Options = {}): Generator<void, OptimizationExpansionPlan | undefined, void> {
  if (initial.feasibility !== 'infeasible') return undefined;
  const preferredModel = normalizeForecastRanges(model);
  const preferredParameters = orderForecastSeriesByPl(preferredModel.series).filter((series) => series.scope !== 'company' && series.changePolicy !== 'fixed').flatMap((series) => series.periods.flatMap((period) => {
    const range = period.range ?? defaultForecastRange(series.projectionMode);
    return isForecastRangeLocked(range) ? [] : [{ seriesId: series.id, periodId: period.id, baseline: period.annualGrowthRate, min: range.min, max: range.max }];
  }));
  if (preferredParameters.length === 0) return undefined;
  let working = initial;
  const searchRounds = options.expansionIterations ?? 12;

  for (let iteration = 0; iteration < searchRounds && working.feasibility === 'infeasible'; iteration += 1) {
    const factor = 2 ** (iteration + 2);
    const searchModel = structuredClone(preferredModel);
    searchModel.series.filter((series) => series.changePolicy !== 'fixed').forEach((series) => series.periods.forEach((period) => {
      const preferred = period.range ?? defaultForecastRange(series.projectionMode);
      if (isForecastRangeLocked(preferred)) return;
      const span = Math.max(preferred.max - preferred.min, .01);
      period.range = {
        min: series.projectionMode === 'compound' ? Math.max(-99.999999, preferred.min - span * factor) : preferred.min - span * factor,
        max: preferred.max + span * factor,
      };
    }));
    const widestRange = Math.max(...searchModel.series.filter((series) => series.scope !== 'company' && series.changePolicy !== 'fixed').flatMap((series) => series.periods.filter((period) => !isForecastRangeLocked(period.range!)).map((period) => period.range!.max - period.range!.min)), 1);
    working = createConstrainedOptimizationProposal(searchModel, evaluateConstraints, {
      ...options,
      preferredModel,
      iterations: options.iterations ?? 80,
      initialStep: Math.max(options.initialStep ?? 2, widestRange / 32),
      includeExpansionPlan: false,
    });
    yield;
  }

  const improvedMetricLabels = initial.metricDiagnostics.flatMap((metric) => {
    const next = working.metricDiagnostics.find((candidate) => candidate.id === metric.id);
    return next && (next.gap ?? 0) < (metric.gap ?? 0) - 1e-8 ? [metric.label] : [];
  });
  const entries = preferredParameters.flatMap((parameter): OptimizationExpansionEntry[] => {
    const originalSeries = preferredModel.series.find((series) => series.id === parameter.seriesId)!;
    const value = working.optimized.series.find((series) => series.id === parameter.seriesId)!.periods.find((period) => period.id === parameter.periodId)!.annualGrowthRate;
    const scopeLabel = originalSeries.scope === 'base' ? 'ベース事業' : originalSeries.scope === 'subsidy' ? '補助事業' : '全社';
    const result: OptimizationExpansionEntry[] = [];
    if (value < parameter.min - 1e-8) result.push({ seriesId: parameter.seriesId, seriesLabel: `${scopeLabel} ${originalSeries.label}`, periodId: parameter.periodId, boundary: 'min', before: parameter.min, after: value, affectedMetricLabels: improvedMetricLabels });
    if (value > parameter.max + 1e-8) result.push({ seriesId: parameter.seriesId, seriesLabel: `${scopeLabel} ${originalSeries.label}`, periodId: parameter.periodId, boundary: 'max', before: parameter.max, after: value, affectedMetricLabels: improvedMetricLabels });
    return result;
  });
  if (entries.length === 0) return undefined;
  const expandedModel = structuredClone(preferredModel);
  entries.forEach((entry) => {
    const series = expandedModel.series.find((candidate) => candidate.id === entry.seriesId)!;
    const period = series.periods.find((candidate) => candidate.id === entry.periodId)!;
    const range = period.range ?? defaultForecastRange(series.projectionMode);
    period.range = entry.boundary === 'min' ? { min: entry.after, max: range.max } : { min: range.min, max: entry.after };
    period.annualGrowthRate = working.optimized.series.find((candidate) => candidate.id === entry.seriesId)!.periods.find((candidate) => candidate.id === entry.periodId)!.annualGrowthRate;
  });
  return { status: working.feasibility === 'feasible' ? 'feasible' : 'best-effort', expandedModel, entries, metricDiagnostics: working.metricDiagnostics };
}

export function createOptimizationExpansionPlan(model: ForecastModel, initial: OptimizationProposal, evaluateConstraints: (candidate: ForecastModel) => OptimizationConstraintMeasurement[], options: Options = {}): OptimizationExpansionPlan | undefined {
  const steps = adaptiveOutsideLevelSteps(model, initial, evaluateConstraints, options);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

export async function createOptimizationExpansionPlanAsync(model: ForecastModel, initial: OptimizationProposal, evaluateConstraints: (candidate: ForecastModel) => OptimizationConstraintMeasurement[], options: Options = {}): Promise<OptimizationExpansionPlan | undefined> {
  const steps = adaptiveOutsideLevelSteps(model, initial, evaluateConstraints, options);
  let result = steps.next();
  while (!result.done) {
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    result = steps.next();
  }
  return result.value;
}

export function applyOptimizationExpansionPlan(proposal: OptimizationProposal): ForecastModel {
  const result = structuredClone(proposal.baseline);
  const expanded = proposal.expansionPlan?.expandedModel;
  if (!expanded) return result;
  for (const entry of proposal.expansionPlan!.entries) {
    const targetSeries = result.series.find((series) => series.id === entry.seriesId);
    const targetPeriod = targetSeries?.periods.find((period) => period.id === entry.periodId);
    const expandedSeries = expanded.series.find((series) => series.id === entry.seriesId);
    const expandedPeriod = expandedSeries?.periods.find((period) => period.id === entry.periodId);
    if (targetPeriod && expandedPeriod?.range) targetPeriod.range = { ...expandedPeriod.range };
  }
  return result;
}

export function createConstrainedOptimizationProposal(model: ForecastModel, evaluateConstraints: (candidate: ForecastModel) => OptimizationConstraintMeasurement[], options: Options = {}): OptimizationProposal {
  const strategy = options.strategy ?? 'minimum-change';
  const baseline = normalizeForecastRanges(model);
  const optimized = structuredClone(baseline);
  const constraintCache = new Map<string, OptimizationConstraintMeasurement[]>();
  const evaluateAllConstraints = (candidate: ForecastModel) => {
    const key = optimizationVectorKey(candidate);
    const cached = constraintCache.get(key);
    if (cached) return cached;
    const measurements = [
      ...evaluateConstraints(candidate),
      ...finalYearSalesAllocationConstraints(candidate),
    ];
    constraintCache.set(key, measurements);
    return measurements;
  };
  const parameters = orderForecastSeriesByPl(optimized.series).filter((series) => series.scope !== 'company' && series.changePolicy !== 'fixed').flatMap((series) => series.periods.flatMap((period) => {
    const configured = period.range ?? defaultForecastRange(series.projectionMode);
    if (isForecastRangeLocked(configured)) return [];
    const preferredSeries = options.preferredModel?.series.find((candidate) => candidate.id === series.id);
    const preferredPeriod = preferredSeries?.periods.find((candidate) => candidate.id === period.id);
    const preferred = preferredPeriod?.range ?? configured;
    return [{ seriesId: series.id, periodId: period.id, period, baseline: period.annualGrowthRate, min: configured.min, max: configured.max, preferredMin: preferred.min, preferredMax: preferred.max }];
  }));
  const scoreCache = new Map<string, ConstraintScore>();
  const score = (candidate: ForecastModel): ConstraintScore => {
    const key = optimizationVectorKey(candidate);
    const cached = scoreCache.get(key);
    if (cached) return cached;
    if (!satisfiesForecastDomain(candidate)) {
      const unavailable = { unavailableCount: Number.MAX_SAFE_INTEGER, feasible: false, maxViolation: Number.POSITIVE_INFINITY, totalViolation: Number.POSITIVE_INFINITY, cost: Number.POSITIVE_INFINITY };
      scoreCache.set(key, unavailable);
      return unavailable;
    }
    const diagnostics = constraintDiagnostics(evaluateAllConstraints(candidate));
    const unavailableCount = diagnostics.filter((metric) => metric.status === 'unavailable').length;
    const violations = diagnostics.filter((metric) => metric.status === 'unmet').map((metric) => metric.gap! / Math.max(1, Math.abs(metric.target)));
    const result = {
      unavailableCount,
      feasible: unavailableCount === 0 && violations.length === 0,
      maxViolation: Math.max(0, ...violations),
      totalViolation: violations.reduce((sum, violation) => sum + violation ** 2, 0),
      cost: constrainedCost(parameters, strategy),
    };
    scoreCache.set(key, result);
    return result;
  };
  const initialScore = score(optimized);
  const finalScore = constrainedStrategies[strategy]({ model: optimized, parameters, evaluate: score, score: initialScore, iterations: options.iterations ?? 40, initialStep: options.initialStep ?? 2, minimumStep: options.minimumStep ?? .01 });
  const metricDiagnostics = constraintDiagnostics(evaluateAllConstraints(optimized));
  const feasibility = metricDiagnostics.some((metric) => metric.status === 'unavailable')
    ? 'unavailable' as const
    : metricDiagnostics.some((metric) => metric.status === 'unmet')
      ? 'infeasible' as const
      : 'feasible' as const;
  const proposal: OptimizationProposal = {
    strategy,
    baseline,
    optimized,
    beforeScore: initialScore.unavailableCount > 0 ? undefined : initialScore.totalViolation,
    afterScore: finalScore.unavailableCount > 0 ? undefined : finalScore.totalViolation,
    changes: proposalChanges(baseline, optimized),
    feasibility,
    metricDiagnostics,
    boundDiagnostics: boundDiagnostics(baseline, optimized, metricDiagnostics, evaluateAllConstraints, parameters),
  };
  if (options.includeExpansionPlan !== false) proposal.expansionPlan = createOptimizationExpansionPlan(baseline, proposal, evaluateConstraints, options);
  return proposal;
}

export function applyOptimizationStrength(proposal: OptimizationProposal, strength: number): ForecastModel {
  const ratio = Math.max(0, Math.min(100, strength)) / 100;
  const result = structuredClone(proposal.baseline);
  for (const change of proposal.changes) {
    const series = result.series.find((candidate) => candidate.id === change.seriesId);
    const period = series?.periods.find((candidate) => candidate.id === change.periodId);
    if (series && period) {
      const range = period.range ?? defaultForecastRange(series.projectionMode);
      period.annualGrowthRate = clampToForecastRange(change.before + change.delta * ratio, range);
      period.range = { ...range };
    }
  }
  return result;
}

export function inferOptimizationStrength(proposal: OptimizationProposal, model: ForecastModel): number {
  let weightedDifference = 0;
  let totalWeight = 0;
  for (const change of proposal.changes) {
    if (Math.abs(change.delta) < 1e-9) continue;
    const series = model.series.find((candidate) => candidate.id === change.seriesId);
    const period = series?.periods.find((candidate) => candidate.id === change.periodId);
    if (!period) continue;
    weightedDifference += change.delta * (period.annualGrowthRate - change.before);
    totalWeight += change.delta ** 2;
  }
  if (totalWeight === 0) return 0;
  return Math.round(Math.max(0, Math.min(100, weightedDifference / totalWeight * 100)));
}

type Timeline = { years: number[]; records: HistoricalPlCalculated[] };

function timeline(actuals: HistoricalPlInput[], actualRecords: HistoricalPlCalculated[], model: ForecastModel, scope: 'base' | 'subsidy'): Timeline {
  const future = buildForecastPl(model, scope, actuals.at(-1)!);
  const years = [...actuals.map((_, index) => model.series[0].baseYear - actuals.length + index + 1), ...future.map((row) => row.year)];
  return { years, records: [...actualRecords, ...future.map((row) => row.calculated)] };
}

export function buildOptimizationTimelines(model: ForecastModel, baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[]) {
  const base = timeline(baseActuals, calculatePlSeries(baseActuals), model, 'base');
  const subsidy = timeline(subsidyActuals, calculatePlSeries(subsidyActuals), model, 'subsidy');
  const company = { years: base.years, records: calculatePlSeries(base.records.map((row, index) => combinePlInputs(row, subsidy.records[index]))) };
  return { company, base, subsidy };
}

function optimizationScopeKey(model: ForecastModel, scope: 'base' | 'subsidy') {
  return JSON.stringify([
    model.series[0]?.baseYear,
    model.series.filter((series) => series.scope === scope).map((series) => [
      series.id,
      series.baseYear,
      series.baseValue,
      series.projectionMode,
      series.periods.map((period) => [
        period.id,
        period.lineageId,
        period.startYear,
        period.endYear,
        period.annualGrowthRate,
        period.startValue,
        period.startAdjustment,
      ]),
    ]),
  ]);
}

export function createOptimizationTimelineEvaluator(baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[]) {
  const actualRecords = {
    base: calculatePlSeries(baseActuals),
    subsidy: calculatePlSeries(subsidyActuals),
  };
  const scopeCache = {
    base: new Map<string, Timeline>(),
    subsidy: new Map<string, Timeline>(),
  };
  const buildCounts = { base: 0, subsidy: 0 };
  const evaluateScope = (model: ForecastModel, scope: 'base' | 'subsidy') => {
    const key = optimizationScopeKey(model, scope);
    const cached = scopeCache[scope].get(key);
    if (cached) return cached;
    const actuals = scope === 'base' ? baseActuals : subsidyActuals;
    const result = timeline(actuals, actualRecords[scope], model, scope);
    scopeCache[scope].set(key, result);
    buildCounts[scope] += 1;
    return result;
  };
  return {
    evaluate(model: ForecastModel) {
      const base = evaluateScope(model, 'base');
      const subsidy = evaluateScope(model, 'subsidy');
      const company = { years: base.years, records: calculatePlSeries(base.records.map((row, index) => combinePlInputs(row, subsidy.records[index]))) };
      return { company, base, subsidy };
    },
    stats: () => ({ baseBuilds: buildCounts.base, subsidyBuilds: buildCounts.subsidy }),
  };
}

function metricConstraintEvaluator(program: ProgramConfiguration, baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[], actualInputs: Record<string, number>, metricTargets: Record<string, number>) {
  const timelineEvaluator = createOptimizationTimelineEvaluator(baseActuals, subsidyActuals);
  return (candidate: ForecastModel): OptimizationConstraintMeasurement[] => {
    const timelines = timelineEvaluator.evaluate(candidate);
    const recordMaps = {
      company: new Map(timelines.company.years.map((year, index) => [year, timelines.company.records[index]])),
      base: new Map(timelines.base.years.map((year, index) => [year, timelines.base.records[index]])),
      subsidy: new Map(timelines.subsidy.years.map((year, index) => [year, timelines.subsidy.records[index]])),
    };
    const metricEvaluators = {
      company: createManagementMetricEvaluator(program, { records: recordMaps.company, actualInputs }),
      base: createManagementMetricEvaluator(program, { records: recordMaps.base, actualInputs }),
      subsidy: createManagementMetricEvaluator(program, { records: recordMaps.subsidy, actualInputs }),
    };
    return program.definitions.managementMetrics.filter((metric) => metric.enabled && metric.optimization === 'adjustable').map((metric) => {
      const evaluation = metricEvaluators[metric.scope].evaluate(metric);
      return { id: metric.id, label: metric.label, value: Number.isFinite(evaluation.value) ? evaluation.value : undefined, target: resolveMetricTarget(metric, metricTargets[metric.id]).effectiveTarget, direction: metric.direction, unit: metric.outputUnit };
    });
  };
}

export function createMetricOptimizationProposal(model: ForecastModel, program: ProgramConfiguration, baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[], actualInputs: Record<string, number>, strategy: OptimizationStrategy = 'minimum-change', options: Omit<Options, 'strategy'> = {}, metricTargets: Record<string, number> = {}): OptimizationProposal {
  return createConstrainedOptimizationProposal(model, metricConstraintEvaluator(program, baseActuals, subsidyActuals, actualInputs, metricTargets), { ...options, strategy });
}

export function createMetricOptimizationExpansionPlan(model: ForecastModel, initial: OptimizationProposal, program: ProgramConfiguration, baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[], actualInputs: Record<string, number>, strategy: OptimizationStrategy = 'minimum-change', metricTargets: Record<string, number> = {}): OptimizationExpansionPlan | undefined {
  return createOptimizationExpansionPlan(model, initial, metricConstraintEvaluator(program, baseActuals, subsidyActuals, actualInputs, metricTargets), { strategy });
}

export function createMetricOptimizationExpansionPlanAsync(model: ForecastModel, initial: OptimizationProposal, program: ProgramConfiguration, baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[], actualInputs: Record<string, number>, strategy: OptimizationStrategy = 'minimum-change', metricTargets: Record<string, number> = {}): Promise<OptimizationExpansionPlan | undefined> {
  return createOptimizationExpansionPlanAsync(model, initial, metricConstraintEvaluator(program, baseActuals, subsidyActuals, actualInputs, metricTargets), { strategy });
}
