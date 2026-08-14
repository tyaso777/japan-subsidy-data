import type { ForecastModel, ForecastSeries } from './forecast-engine';

export type ForecastRange = { min: number; max: number };

export function defaultForecastRange(projectionMode: ForecastSeries['projectionMode']): ForecastRange {
  return projectionMode === 'linear' ? { min: -20, max: 20 } : { min: -10, max: 50 };
}

export function clampToForecastRange(value: number, range: ForecastRange): number {
  return Math.max(range.min, Math.min(range.max, value));
}

export function normalizeForecastRanges(model: ForecastModel): ForecastModel {
  const normalized = structuredClone(model);
  normalized.series.forEach((series) => {
    series.periods.forEach((period) => {
      const range = period.range ?? defaultForecastRange(series.projectionMode);
      period.range = { ...range };
      period.annualGrowthRate = clampToForecastRange(period.annualGrowthRate, range);
    });
  });
  return normalized;
}
