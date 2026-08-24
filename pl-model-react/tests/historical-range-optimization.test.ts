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

  it('ベース事業の売上高は過去平均を初期値、平均−2標準偏差を下限、初期値＋20ptを上限にする', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const period = result.forecast.series.find((series) => series.id === 'base-sales')!.periods.find((item) => item.id === 'subsidy')!;

    const first = (950 / 900 - 1) * 100;
    const second = (1000 / 950 - 1) * 100;
    const mean = (first + second) / 2;
    const deviation = Math.sqrt(((first - mean) ** 2 + (second - mean) ** 2) / 2);
    expect(period.range?.min).toBeCloseTo(mean - 2 * deviation);
    expect(period.range?.max).toBeCloseTo(mean + 20);
    expect(period.annualGrowthRate).toBeCloseTo(mean);
  });

  it('補助事業の売上高は過去平均を初期値、初期値＋30ptを上限にする', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const period = result.forecast.series.find((series) => series.id === 'subsidy-sales')!.periods.find((item) => item.id === 'subsidy')!;
    const [firstYear, secondYear, thirdYear] = state.actuals.subsidyPl.map((row) => row.sales!);
    const first = (secondYear / firstYear - 1) * 100;
    const second = (thirdYear / secondYear - 1) * 100;
    const mean = (first + second) / 2;

    expect(period.annualGrowthRate).toBeCloseTo(mean);
    expect(period.range?.max).toBeCloseTo(mean + 30);
  });

  it('売上高以外は過去平均±2標準偏差の対称範囲と中点を維持する', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const period = result.forecast.series.find((series) => series.id === 'base-headcount')!.periods.find((item) => item.id === 'subsidy')!;

    expect(period.annualGrowthRate).toBeCloseTo((period.range!.min + period.range!.max) / 2);
  });

  it('基準年後の補助事業は過去実績から求めた範囲を10pt上方へ移動する', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const sales = result.forecast.series.find((series) => series.id === 'subsidy-sales')!;
    const toBase = sales.periods.find((item) => item.id === 'subsidy')!;
    const postBase = sales.periods.find((item) => item.id === 'report')!;

    expect(postBase.range?.min).toBeCloseTo(toBase.range!.min + 10);
    expect(postBase.range?.max).toBeCloseTo(toBase.range!.max + 10);
    expect(postBase.annualGrowthRate).toBeCloseTo(toBase.annualGrowthRate + 10);
  });

  it('基準年後のベース事業は設備導入期間の範囲へシナジー補正する', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const sales = result.forecast.series.find((series) => series.id === 'base-sales')!;
    const toBase = sales.periods.find((item) => item.id === 'subsidy')!;
    const postBase = sales.periods.find((item) => item.id === 'report')!;

    expect(postBase.range?.min).toBeCloseTo(toBase.range!.min + 2);
    expect(postBase.range?.max).toBeCloseTo(toBase.range!.max + 2);
    expect(postBase.annualGrowthRate).toBeCloseTo(toBase.annualGrowthRate + 2);
  });

  it('過去実績から求めた売上高成長率の範囲を固定のハード上限・下限で切らない', () => {
    const state = createModelStore().getState();
    const fastGrowth = state.actuals.basePl.map((row, index) => ({
      ...row,
      sales: [100, 160, 320][index],
    }));

    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, fastGrowth, state.actuals.subsidyPl);
    const period = result.forecast.series.find((series) => series.id === 'base-sales')!.periods.find((item) => item.id === 'subsidy')!;

    expect(period.range!.max).toBeGreaterThan(20);
    expect(period.annualGrowthRate).toBeGreaterThan(20);
  });

  it('原価率は直近値を開始時固定値とし、Min=Max=0の間は年間変化をロックする', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const cogs = result.forecast.series.find((series) => series.id === 'base-cogsRate')!;
    const latest = state.actuals.basePl.at(-1)!;

    expect(cogs.changePolicy).toBe('adjustable');
    expect(cogs.periods[0].startValue).toBeCloseTo(latest.cogs / latest.sales * 100);
    expect(cogs.periods.slice(1).every((period) => period.startValue === null)).toBe(true);
    expect(cogs.periods.every((period) => period.range?.min === 0 && period.range.max === 0)).toBe(true);
    expect(cogs.periods.every((period) => period.annualGrowthRate === 0)).toBe(true);
  });

  it('実効税率は赤字実績から変化率を作らず、固定値として保持する', () => {
    const state = createModelStore().getState();
    const subsidyTax = state.forecast.series.find((series) => series.id === 'subsidy-taxRate')!;
    expect(subsidyTax.baseValue).toBe(30);
    expect(subsidyTax.changePolicy).toBe('fixed');

    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const optimizedTax = result.forecast.series.find((series) => series.id === 'subsidy-taxRate')!;
    expect(optimizedTax.baseValue).toBe(30);
    expect(optimizedTax.periods[0].startValue).toBe(30);
    expect(optimizedTax.periods.every((period) => period.annualGrowthRate === 0)).toBe(true);
    expect(optimizedTax.periods.every((period) => period.range?.min === 0 && period.range.max === 0)).toBe(true);
  });

  it('補足比率は直近実績を最初の期間の開始時固定値とし、年間変化を0にする', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const research = result.forecast.series.find((series) => series.id === 'base-researchDevelopmentRate')!;
    const latest = state.actuals.basePl.at(-1)!;

    expect(research.changePolicy).toBe('fixed');
    expect(research.periods[0].startValue).toBeCloseTo(latest.researchDevelopment / latest.sales * 100);
    expect(research.periods.slice(1).every((period) => period.startValue === null)).toBe(true);
    expect(research.periods.every((period) => period.annualGrowthRate === 0 && period.startAdjustment === 0)).toBe(true);
    expect(research.periods.every((period) => period.range?.min === 0 && period.range.max === 0)).toBe(true);

    const cogs = result.forecast.series.find((series) => series.id === 'base-cogsRate')!;
    expect(cogs.changePolicy).toBe('adjustable');
  });
});
