import { describe, expect, it } from 'vitest';
import { optimizeForecastRangesFromActuals } from '../src/domain/historical-range-optimization';
import { createModelStore } from '../src/store/model-store';

describe('過去実績による将来予測水準範囲の適正化', () => {
  it('適正化後の正式な水準・最小値・最大値は小数点以下2桁へ揃える', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const values = result.forecast.series.flatMap((series) => series.periods.flatMap((period) => [
      period.annualGrowthRate,
      period.range!.min,
      period.range!.max,
    ]));

    expect(values.every((value) => Number(value.toFixed(2)) === value)).toBe(true);
  });

  it('設備導入期間は過去2年の変化率の平均±2標準偏差を範囲とし、中点を水準にする', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const period = result.forecast.series.find((series) => series.id === 'base-sales')!.periods.find((item) => item.id === 'subsidy')!;

    const first = (950 / 900 - 1) * 100;
    const second = (1000 / 950 - 1) * 100;
    const mean = (first + second) / 2;
    const deviation = Math.sqrt(((first - mean) ** 2 + (second - mean) ** 2) / 2);
    expect(period.range?.min).toBeCloseTo(mean - 2 * deviation);
    expect(period.range?.max).toBeCloseTo(mean + 2 * deviation);
    expect(period.annualGrowthRate).toBeCloseTo(mean);
  });

  it('基準年後の補助事業は旧planning_modelの成長ベンチマークを使う', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const sales = result.forecast.series.find((series) => series.id === 'subsidy-sales')!.periods.find((item) => item.id === 'report')!;
    const pay = result.forecast.series.find((series) => series.id === 'subsidy-payPerPerson')!.periods.find((item) => item.id === 'report')!;
    const cogs = result.forecast.series.find((series) => series.id === 'subsidy-cogsRate')!.periods.find((item) => item.id === 'report')!;

    expect(sales.range).toEqual({ min: 15, max: 30 });
    expect(sales.annualGrowthRate).toBe(22.5);
    expect(pay.range).toEqual({ min: 5, max: 10 });
    expect(cogs.range).toEqual({ min: -3, max: 0 });
  });

  it('基準年後のベース事業は設備導入期間の範囲へシナジー補正する', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const sales = result.forecast.series.find((series) => series.id === 'base-sales')!;
    const toBase = sales.periods.find((item) => item.id === 'subsidy')!;
    const postBase = sales.periods.find((item) => item.id === 'report')!;

    expect(postBase.range?.min).toBeCloseTo(toBase.range!.min + 2);
    expect(postBase.range?.max).toBeCloseTo(toBase.range!.max + 2);
    expect(postBase.annualGrowthRate).toBeCloseTo((postBase.range!.min + postBase.range!.max) / 2);
  });

  it('原価率は過去の率の前年差を用い、改善時は負の水準になる', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const period = result.forecast.series.find((series) => series.id === 'base-cogsRate')!.periods.find((item) => item.id === 'subsidy')!;

    expect(period.range!.max).toBeLessThanOrEqual(0);
    expect(period.annualGrowthRate).toBeLessThan(0);
  });
});
