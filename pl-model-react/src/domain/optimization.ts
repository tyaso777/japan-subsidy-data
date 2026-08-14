import type { ForecastModel } from './forecast-engine';
import { buildForecastPl } from './forecast-engine';
import { calculatePlSeries, combinePlInputs } from './financials';
import { evaluateManagementMetric } from './metrics';
import type { HistoricalPlCalculated, HistoricalPlInput, ProgramConfiguration } from './types';
import { clampToForecastRange, defaultForecastRange, normalizeForecastRanges } from './forecast-range';

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

export type OptimizationProposal = {
  baseline: ForecastModel;
  optimized: ForecastModel;
  beforeScore: number;
  afterScore: number;
  changes: OptimizationChange[];
};

type Options = { iterations?: number; initialStep?: number; minimumStep?: number; movementWeight?: number };

export function createOptimizationProposal(model: ForecastModel, objective: (candidate: ForecastModel) => number, options: Options = {}): OptimizationProposal {
  const baseline = normalizeForecastRanges(model);
  let optimized = structuredClone(baseline);
  const beforeScore = objective(baseline);
  const movementWeight = options.movementWeight ?? 2;
  const parameters = optimized.series.filter((series) => series.scope !== 'company').flatMap((series) => series.periods.map((period) => {
    const configured = period.range ?? defaultForecastRange(series.projectionMode);
    return {
      seriesId: series.id,
      periodId: period.id,
      baseline: period.annualGrowthRate,
      min: configured.min,
      max: configured.max,
    };
  }));
  const evaluate = (candidate: ForecastModel) => objective(candidate) + movementWeight * parameters.reduce((score, parameter) => {
    const value = candidate.series.find((series) => series.id === parameter.seriesId)?.periods.find((period) => period.id === parameter.periodId)?.annualGrowthRate;
    if (!Number.isFinite(value)) return score;
    return score + ((value! - parameter.baseline) / Math.max(parameter.max - parameter.min, .01)) ** 2;
  }, 0);
  let bestScore = evaluate(optimized);
  let step = options.initialStep ?? 2;
  for (let iteration = 0; iteration < (options.iterations ?? 20); iteration += 1) {
    let improved = false;
    for (const parameter of parameters) {
      const series = optimized.series.find((candidate) => candidate.id === parameter.seriesId)!;
      const period = series.periods.find((candidate) => candidate.id === parameter.periodId)!;
      const original = period.annualGrowthRate;
      let localValue = original;
      let localScore = bestScore;
      for (const direction of [1, -1]) {
        period.annualGrowthRate = Math.max(parameter.min, Math.min(parameter.max, original + step * direction));
        const score = evaluate(optimized);
        if (Number.isFinite(score) && score < localScore) { localScore = score; localValue = period.annualGrowthRate; }
      }
      period.annualGrowthRate = localValue;
      if (localScore < bestScore) { bestScore = localScore; improved = true; }
    }
    if (!improved) step /= 2;
    if (step < (options.minimumStep ?? .01) || bestScore === 0) break;
  }
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
  return { baseline, optimized, beforeScore, afterScore: bestScore, changes };
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

type Timeline = { years: number[]; records: HistoricalPlCalculated[] };

function timeline(actuals: HistoricalPlInput[], model: ForecastModel, scope: 'base' | 'subsidy'): Timeline {
  const future = buildForecastPl(model, scope, actuals.at(-1)!);
  const years = [...actuals.map((_, index) => model.series[0].baseYear - actuals.length + index + 1), ...future.map((row) => row.year)];
  return { years, records: [...calculatePlSeries(actuals), ...future.map((row) => row.calculated)] };
}

export function buildOptimizationTimelines(model: ForecastModel, baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[]) {
  const base = timeline(baseActuals, model, 'base');
  const subsidy = timeline(subsidyActuals, model, 'subsidy');
  const company = { years: base.years, records: calculatePlSeries(base.records.map((row, index) => combinePlInputs(row, subsidy.records[index]))) };
  return { company, base, subsidy };
}

export function createMetricOptimizationProposal(model: ForecastModel, program: ProgramConfiguration, baseActuals: HistoricalPlInput[], subsidyActuals: HistoricalPlInput[], actualInputs: Record<string, number>): OptimizationProposal {
  const objective = (candidate: ForecastModel) => {
    const timelines = buildOptimizationTimelines(candidate, baseActuals, subsidyActuals);
    return program.definitions.managementMetrics.filter((metric) => metric.enabled && metric.optimization === 'adjustable').reduce((score, metric) => {
      const selected = metric.scope === 'company' ? timelines.company : metric.scope === 'base' ? timelines.base : timelines.subsidy;
      const evaluation = evaluateManagementMetric(metric, program, { records: new Map(selected.years.map((year, index) => [year, selected.records[index]])), actualInputs });
      if (!Number.isFinite(evaluation.value)) return score + 10_000;
      const deficit = metric.direction === 'min' ? Math.max(0, metric.target - evaluation.value!) : Math.max(0, evaluation.value! - metric.target);
      return score + 10_000 * (deficit / Math.max(1, Math.abs(metric.target))) ** 2;
    }, 0);
  };
  return createOptimizationProposal(model, objective);
}
