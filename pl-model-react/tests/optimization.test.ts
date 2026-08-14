import { describe, expect, it } from 'vitest';
import { applyOptimizationStrength, createOptimizationProposal } from '../src/domain/optimization';
import { projectForecastSeries, type ForecastModel } from '../src/domain/forecast-engine';

const model = (): ForecastModel => ({
  segments: [{ id: 'A', definitionId: 'plan', startYear: 2026, endYear: 2028 }],
  series: [{ id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound', baseYear: 2025, baseValue: 100, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0 }] }],
});

describe('目標最適化提案', () => {
  it('提案作成時は元モデルを変えず、目標との不足を改善する方向と勢いを記録する', () => {
    const original = model();
    const before = structuredClone(original);
    const objective = (candidate: ForecastModel) => Math.abs(projectForecastSeries(candidate.series[0]).at(-1)!.value - 200);
    const proposal = createOptimizationProposal(original, objective, { iterations: 24, initialStep: 4 });
    expect(original).toEqual(before);
    expect(proposal.afterScore).toBeLessThan(proposal.beforeScore);
    expect(proposal.changes[0]).toMatchObject({ seriesId: 'base-sales', periodId: 'A', field: 'annualGrowthRate', direction: 'up' });
    expect(proposal.changes[0].momentum).toBeGreaterThan(0);
  });

  it('適用強度0・50・100%を提案前後の水準間で補間する', () => {
    const original = model();
    const objective = (candidate: ForecastModel) => Math.abs(projectForecastSeries(candidate.series[0]).at(-1)!.value - 200);
    const proposal = createOptimizationProposal(original, objective);
    const baseRate = original.series[0].periods[0].annualGrowthRate;
    const targetRate = proposal.optimized.series[0].periods[0].annualGrowthRate;
    expect(applyOptimizationStrength(proposal, 0).series[0].periods[0].annualGrowthRate).toBe(baseRate);
    expect(applyOptimizationStrength(proposal, 50).series[0].periods[0].annualGrowthRate).toBeCloseTo((baseRate + targetRate) / 2);
    expect(applyOptimizationStrength(proposal, 100)).toEqual(proposal.optimized);
  });

  it('目標達成度が同じなら最適化開始時からの変更量が小さい案を選ぶ', () => {
    const original = model();
    original.series[0].periods[0] = {
      ...original.series[0].periods[0],
      startYear: 2026,
      endYear: 2026,
      range: { min: 0, max: 100 },
    };
    const target = 110;
    const objective = (candidate: ForecastModel) => {
      const value = projectForecastSeries(candidate.series[0]).at(-1)!.value;
      const deficit = Math.max(0, target - value) / target;
      return 10_000 * deficit ** 2;
    };

    const proposal = createOptimizationProposal(original, objective, { iterations: 40, initialStep: 4 });
    const optimizedRate = proposal.optimized.series[0].periods[0].annualGrowthRate;
    expect(optimizedRate).toBeGreaterThanOrEqual(9.99);
    expect(optimizedRate).toBeLessThan(10.1);
  });
});
