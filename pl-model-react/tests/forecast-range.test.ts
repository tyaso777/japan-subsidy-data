// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOptimizationProposal, applyOptimizationStrength } from '../src/domain/optimization';
import { projectForecastSeries, type ForecastModel } from '../src/domain/forecast-engine';
import { createModelStore } from '../src/store/model-store';

describe('将来予測水準の正式な設定範囲', () => {
  it('初期モデルの全期間へ表示と同じ最小値・最大値を保存する', () => {
    const forecast = createModelStore().getState().forecast;
    const compound = forecast.series.find((series) => series.id === 'base-sales')!;
    const linear = forecast.series.find((series) => series.id === 'base-cogsRate')!;

    expect(compound.periods.every((period) => period.range?.min === -10 && period.range.max === 50)).toBe(true);
    expect(linear.periods.every((period) => period.range?.min === 0 && period.range.max === 0)).toBe(true);
    expect(linear.periods.every((period) => period.annualGrowthRate === 0)).toBe(true);
    expect(forecast.series.flatMap((series) => series.periods).every((period) => period.range)).toBe(true);
  });

  it('範囲未設定の入力でも画面既定範囲を超えて最適化しない', () => {
    const model: ForecastModel = {
      series: [{
        id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound',
        baseYear: 2025, baseValue: 100,
        periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0 }],
      }],
    };
    const objective = (candidate: ForecastModel) => Math.abs(projectForecastSeries(candidate.series[0]).at(-1)!.value - 10);
    const proposal = createOptimizationProposal(model, objective, { iterations: 60, initialStep: 8, minimumStep: 0.001 });
    const optimized = proposal.optimized.series[0].periods[0].annualGrowthRate;
    const applied = applyOptimizationStrength(proposal, 100).series[0].periods[0].annualGrowthRate;

    expect(optimized).toBeGreaterThanOrEqual(-10);
    expect(optimized).toBeLessThanOrEqual(50);
    expect(applied).toBeGreaterThanOrEqual(-10);
    expect(applied).toBeLessThanOrEqual(50);
  });
});
