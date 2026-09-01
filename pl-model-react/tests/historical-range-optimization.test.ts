// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hasUsableSubsidyHistory, optimizeForecastRangesFromActuals } from '../src/domain/historical-range-optimization';
import { createModelStore } from '../src/store/model-store';

describe('過去実績による将来予測水準範囲の適正化', () => {
  it('補助事業の売上高が全期間0または未入力なら新規事業候補と判定する', () => {
    const state = createModelStore().getState();
    const zeroActuals = state.actuals.subsidyPl.map((row) => ({ ...row, sales: 0 }));
    const emptyActuals = state.actuals.subsidyPl.map((row) => ({ ...row, sales: null })) as unknown as typeof state.actuals.subsidyPl;

    expect(hasUsableSubsidyHistory(zeroActuals)).toBe(false);
    expect(hasUsableSubsidyHistory(emptyActuals)).toBe(false);
    expect(hasUsableSubsidyHistory(state.actuals.subsidyPl)).toBe(true);
  });

  it('新規事業設定ではベース事業の基準値を参照し、売上高・従業員数・役員数の開始時固定値は入力待ちにする', () => {
    const state = createModelStore().getState();
    const zeroActuals = state.actuals.subsidyPl.map((row) => Object.fromEntries(Object.keys(row).map((field) => [field, 0]))) as typeof state.actuals.subsidyPl;
    const result = optimizeForecastRangesFromActuals(
      state.forecast,
      state.program,
      state.actuals.basePl,
      zeroActuals,
      { subsidyAsNewBusiness: true },
    );
    const firstPeriod = state.program.timeline.periods[0].definitionId;
    const series = (id: string) => result.forecast.series.find((item) => item.id === `subsidy-${id}`)!;
    const first = (id: string) => series(id).periods.find((period) => period.id === firstPeriod)!;
    const latestBase = state.actuals.basePl.at(-1)!;

    expect(result.newBusinessSetupRequired).toBe(true);
    expect(first('sales').startValue).toBeNull();
    expect(first('headcount').startValue).toBeNull();
    expect(first('officerCount').startValue).toBeNull();
    expect(series('officerCount').baseValue).toBe(0);
    expect(first('cogsRate').startValue).toBeCloseTo(latestBase.cogs / latestBase.sales * 100);
    expect(first('payPerPerson').startValue).toBeCloseTo((latestBase.employeeSalary + latestBase.employeeBonus) / latestBase.headcount);
    expect(first('officerPayPerPerson').startValue).toBeCloseTo((latestBase.officerCompensation + latestBase.officerBonus) / latestBase.officerCount);
  });

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

  it('任意の過去実績期間に含まれる全前年差から平均と母分散を求める', () => {
    const state = createModelStore().getState();
    const sales = [100, 110, 132, 171.6, 257.4].map((value) => value * 1_000_000);
    const fiveYearActuals = sales.map((value, index) => ({ ...state.actuals.basePl[Math.min(index, state.actuals.basePl.length - 1)], sales: value }));
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, fiveYearActuals, state.actuals.subsidyPl);
    const period = result.forecast.series.find((series) => series.id === 'base-sales')!.periods.find((item) => item.id === 'subsidy')!;
    const changes = [10, 20, 30, 50];
    const mean = changes.reduce((sum, value) => sum + value, 0) / changes.length;
    const variance = changes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / changes.length;

    expect(period.annualGrowthRate).toBeCloseTo(mean);
    expect(period.range?.min).toBeCloseTo(mean - 2 * Math.sqrt(variance));
    expect(period.range?.max).toBeCloseTo(mean + 20);
  });

  it('期間を延長して増えた未入力年度は平均・分散の対象から除外する', () => {
    const state = createModelStore().getState();
    const baseline = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const emptyYear = Object.fromEntries(Object.keys(state.actuals.basePl[0]).map((field) => [field, null])) as unknown as typeof state.actuals.basePl[number];
    const extended = optimizeForecastRangesFromActuals(state.forecast, state.program, [...state.actuals.basePl, emptyYear], state.actuals.subsidyPl);

    for (const seriesId of ['base-sales', 'base-payPerPerson', 'base-officerPayPerPerson']) {
      const expected = baseline.forecast.series.find((series) => series.id === seriesId)!.periods.find((period) => period.id === 'subsidy')!;
      const actual = extended.forecast.series.find((series) => series.id === seriesId)!.periods.find((period) => period.id === 'subsidy')!;
      expect(actual.annualGrowthRate).toBeCloseTo(expected.annualGrowthRate);
      expect(actual.range?.min).toBeCloseTo(expected.range!.min);
      expect(actual.range?.max).toBeCloseTo(expected.range!.max);
    }
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

  it('従業員・役員の1人当たり給与支給総額は初期値＋5ptを上限とし、事業化報告期間でも同じ余裕幅を保つ', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);

    for (const seriesId of [
      'base-payPerPerson',
      'subsidy-payPerPerson',
      'base-officerPayPerPerson',
      'subsidy-officerPayPerPerson',
    ]) {
      const series = result.forecast.series.find((item) => item.id === seriesId)!;
      const toBase = series.periods.find((item) => item.id === 'subsidy')!;
      const postBase = series.periods.find((item) => item.id === 'report')!;
      expect(toBase.range?.max).toBeCloseTo(toBase.annualGrowthRate + 5);
      expect(postBase.range?.max).toBeCloseTo(postBase.annualGrowthRate + 5);
      const expectedPostBaseAdjustment = seriesId.endsWith('-payPerPerson') ? .5 : 0;
      expect(postBase.annualGrowthRate).toBeCloseTo(toBase.annualGrowthRate + expectedPostBaseAdjustment);
    }
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

  it('原価率は直近値を開始時固定値とし、実績の相対変化から改善率の範囲を作る', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const cogs = result.forecast.series.find((series) => series.id === 'base-cogsRate')!;
    const latest = state.actuals.basePl.at(-1)!;

    expect(cogs.changePolicy).toBe('adjustable');
    expect(cogs.periods[0].startValue).toBeCloseTo(latest.cogs / latest.sales * 100);
    expect(cogs.periods.slice(1).every((period) => period.startValue === null)).toBe(true);
    const levels = state.actuals.basePl.map((row) => row.cogs / row.sales * 100);
    const changes = levels.slice(1).map((value, index) => (value / levels[index] - 1) * 100);
    const rms = Math.sqrt(changes.reduce((sum, value) => sum + value ** 2, 0) / changes.length);
    const allowance = Number(Math.min(10, Math.max(1, rms)).toFixed(2));
    expect(cogs.projectionMode).toBe('relative');
    expect(cogs.periods.every((period) => period.range?.min === -allowance && period.range.max === 0)).toBe(true);
    expect(cogs.periods.every((period) => period.annualGrowthRate === 0)).toBe(true);
  });

  it('実効税率は赤字実績から変化率を作らず、他の補足比率と同じく初期範囲をロックする', () => {
    const state = createModelStore().getState();
    const subsidyTax = state.forecast.series.find((series) => series.id === 'subsidy-taxRate')!;
    expect(subsidyTax.baseValue).toBe(30);
    expect(subsidyTax.changePolicy).toBe('adjustable');

    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const optimizedTax = result.forecast.series.find((series) => series.id === 'subsidy-taxRate')!;
    expect(optimizedTax.changePolicy).toBe('adjustable');
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

    expect(research.changePolicy).toBe('adjustable');
    expect(research.periods[0].startValue).toBeCloseTo(latest.researchDevelopment / latest.sales * 100);
    expect(research.periods.slice(1).every((period) => period.startValue === null)).toBe(true);
    expect(research.periods.every((period) => period.annualGrowthRate === 0 && period.startAdjustment === 0)).toBe(true);
    expect(research.periods.every((period) => period.range?.min === 0 && period.range.max === 0)).toBe(true);

    const cogs = result.forecast.series.find((series) => series.id === 'base-cogsRate')!;
    expect(cogs.changePolicy).toBe('adjustable');
  });

  it('適正化後は費用比率の実績偏差に応じた控えめな探索方向を設定する', () => {
    const state = createModelStore().getState();
    const result = optimizeForecastRangesFromActuals(state.forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl);
    const expectedDirection: Record<string, 'down' | 'up' | 'locked'> = {
      cogsRate: 'down',
      cogsDepRate: 'up',
      sgaDepRate: 'up',
      researchDevelopmentRate: 'locked',
      otherSgaRate: 'down',
    };

    for (const scope of ['base', 'subsidy']) {
      for (const [driver, direction] of Object.entries(expectedDirection)) {
        const series = result.forecast.series.find((item) => item.id === `${scope}-${driver}`)!;
        expect(series.periods.every((period) => period.optimizationFixed === true)).toBe(true);
        expect(series.periods.every((period) => period.annualGrowthRate === 0)).toBe(true);
        if (direction === 'down') expect(series.periods.every((period) => period.range!.min <= 0 && period.range!.max === 0)).toBe(true);
        if (direction === 'up') expect(series.periods.every((period) => period.range!.min === 0 && period.range!.max >= 0)).toBe(true);
        if (direction === 'locked') expect(series.periods.every((period) => period.range!.min === 0 && period.range!.max === 0)).toBe(true);
      }
    }
  });
});
