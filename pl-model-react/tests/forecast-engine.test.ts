import { describe, expect, it } from 'vitest';
import { applyFinalYearSalesAllocation, buildForecastPl, clearFinalYearSalesAllocation, fitForecastPlCell, fitForecastSeriesPoint, mergeForecastSegment, projectForecastSeries, projectSeries, splitForecastSegment, synchronizeForecastTimeline, type ForecastModel, type ForecastSeries } from '../src/domain/forecast-engine';
import { calculatePl } from '../src/domain/financials';
import { baseHistoricalPl } from '../src/domain/sample-data';

describe('将来予測計算サービス', () => {
  it('最終年度配分率は最適化条件として保存し、設定時点のPLは変更しない', () => {
    const sales = (scope: 'base' | 'subsidy', baseValue: number): ForecastSeries => ({
      id: `${scope}-sales`, label: '売上高', scope, valueKind: 'money', projectionMode: 'compound',
      baseYear: 2025, baseValue,
      periods: [{ id: 'report', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0, range: { min: -10, max: 50 } }],
    });
    const model: ForecastModel = { series: [sales('base', 500), sales('subsidy', 100)] };

    const allocated = applyFinalYearSalesAllocation(model, { finalYear: 2028, baseSharePercent: 60 });
    expect(projectForecastSeries(allocated.series[0]).at(-1)?.value).toBeCloseTo(578.8125, 6);
    expect(projectForecastSeries(allocated.series[1]).at(-1)?.value).toBeCloseTo(115.7625, 6);
    expect(allocated.series.map((series) => series.changePolicy)).toEqual([undefined, undefined]);
    expect(allocated.finalYearSalesAllocation).toEqual({ finalYear: 2028, baseSharePercent: 60 });

    const baseFinal = buildForecastPl(allocated, 'base', { ...baseHistoricalPl.at(-1)!, sales: 500 }).at(-1)!.input.sales;
    const subsidyFinal = buildForecastPl(allocated, 'subsidy', { ...baseHistoricalPl.at(-1)!, sales: 100 }).at(-1)!.input.sales;
    expect(baseFinal).toBeCloseTo(578.8125, 6);
    expect(subsidyFinal).toBeCloseTo(115.7625, 6);
    expect(baseFinal / (baseFinal + subsidyFinal) * 100).toBeCloseTo(500 / 600 * 100, 8);

    const cleared = clearFinalYearSalesAllocation(allocated);
    expect(cleared.finalYearSalesAllocation).toBeUndefined();
    expect(cleared.series.map((series) => series.changePolicy)).toEqual([undefined, undefined]);

    const rescheduled = synchronizeForecastTimeline(allocated, [{ definitionId: 'report', startYear: 2026, endYear: 2029 }]);
    expect(rescheduled.finalYearSalesAllocation).toBeUndefined();
    expect(rescheduled.series.map((series) => series.changePolicy)).toEqual([undefined, undefined]);
  });
  it('期間開始時増減と期間別成長率をUIなしで計算する', () => {
    const result = projectSeries(2025, 100, [
      { id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 10, startAdjustment: 20 },
      { id: 'B', startYear: 2029, endYear: 2030, annualGrowthRate: 5, startAdjustment: 50 },
    ]);
    expect(result.map((point) => point.year)).toEqual([2025, 2026, 2027, 2028, 2029, 2030]);
    [100, 130, 143, 157.3, 215.165, 225.92325].forEach((value, index) => {
      expect(result[index].value).toBeCloseTo(value, 8);
    });
  });

  it('開始時固定値を通常成長後の値より優先し、開始時増減を加えてから翌年以降を成長させる', () => {
    const compound = projectForecastSeries({
      id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound',
      baseYear: 2025, baseValue: 100,
      periods: [{ id: 'A', startYear: 2026, endYear: 2027, annualGrowthRate: 10, startValue: 200, startAdjustment: 20 }],
    });
    [100, 220, 242].forEach((value, index) => expect(compound[index].value).toBeCloseTo(value));

    const linear = projectForecastSeries({
      id: 'base-rate', label: '比率', scope: 'base', valueKind: 'percent', projectionMode: 'linear',
      baseYear: 2025, baseValue: 50,
      periods: [{ id: 'A', startYear: 2026, endYear: 2027, annualGrowthRate: 2, startValue: 80, startAdjustment: 3 }],
    });
    expect(linear.map((point) => point.value)).toEqual([50, 83, 85]);
  });

  it('事業化報告期間の初年で開始時固定値を優先し、翌年から成長させる', () => {
    const points = projectForecastSeries({
      id: 'subsidy-sales', label: '売上高', scope: 'subsidy', valueKind: 'money', projectionMode: 'compound',
      baseYear: 2025, baseValue: 100,
      periods: [
        { id: 'subsidy', startYear: 2026, endYear: 2028, annualGrowthRate: 0, startAdjustment: 0 },
        { id: 'report', startYear: 2029, endYear: 2032, annualGrowthRate: 10, startValue: 200, startAdjustment: 20 },
      ],
    });

    expect(points.map((point) => point.year)).toEqual([2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]);
    [100, 100, 100, 100, 220, 242, 266.2, 292.82].forEach((value, index) => expect(points[index].value).toBeCloseTo(value));
  });

  it('開始時固定値がない基準年度には事業化報告期間の成長率を適用する', () => {
    const points = projectForecastSeries({
      id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound',
      baseYear: 2025, baseValue: 100,
      periods: [
        { id: 'subsidy', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0 },
        { id: 'report', startYear: 2029, endYear: 2032, annualGrowthRate: 10, startValue: null, startAdjustment: 0 },
      ],
    });

    const baseYear = points.find((point) => point.year === 2029)!;
    const previousYear = points.find((point) => point.year === 2028)!;
    expect(baseYear.value / previousYear.value - 1).toBeCloseTo(0.1, 8);
  });

  it('売上高の開始時増減額は初年度の成長計算後に加算し、翌年度から合計額を成長させる', () => {
    const series: ForecastSeries = {
      id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound',
      baseYear: 2025, baseValue: 1_000,
      periods: [{ id: 'subsidy', startYear: 2026, endYear: 2028, annualGrowthRate: 8, startAdjustment: 100_000_000 }],
    };

    const expected = [
      1_000,
      100_001_080,
      108_001_166.4,
      116_641_259.712,
    ];
    projectForecastSeries(series).forEach((point, index) => expect(point.value).toBeCloseTo(expected[index], 6));
  });

  it('比率・人員・給与水準から将来P/Lを全行生成する', () => {
    const latest = baseHistoricalPl.at(-1)!;
    const make = (id: string, baseValue: number, annualGrowthRate: number, projectionMode: 'compound' | 'linear' = 'compound') => ({
      id: `base-${id}`, label: id, scope: 'base' as const, valueKind: id.includes('Rate') || id.includes('Share') ? 'percent' as const : 'money' as const,
      projectionMode, baseYear: 2025, baseValue,
      periods: [{ id: 'subsidy', startYear: 2026, endYear: 2027, annualGrowthRate, startAdjustment: 0 }],
    });
    const model: ForecastModel = { series: [
      make('sales', latest.sales, 10),
      { ...make('headcount', latest.headcount, 0), valueKind: 'fte' },
      { ...make('payPerPerson', calculatePl(latest).employeePayPerPerson, 5), valueKind: 'moneyPerPerson' },
      make('cogsRate', 60, -1, 'linear'), make('cogsDepRate', 4, 0, 'linear'), make('sgaDepRate', 2, 0, 'linear'),
      make('researchDevelopmentRate', 2, 0, 'linear'), make('otherSgaRate', 7, -.5, 'linear'), make('officerPayPerPerson', 4_500_000, 2),
      make('employeeSalaryShare', 95, 0, 'linear'), make('officerCompensationShare', 90, 0, 'linear'),
      make('nonOperatingRate', -.6, 0, 'linear'), make('extraordinaryRate', 0, 0, 'linear'), make('taxRate', 30, 0, 'linear'),
      { ...make('officerCount', 4, 0), valueKind: 'count' },
    ] };

    const result = buildForecastPl(model, 'base', latest);
    expect(result).toHaveLength(2);
    expect(result[0].input.sales).toBeCloseTo(1_100_000_000);
    expect(result[0].input.cogs).toBeCloseTo(649_000_000);
    expect(result[0].calculated.officerPay).toBeCloseTo(18_360_000);
    expect(result[0].calculated.operatingProfit).toBeGreaterThan(0);
    expect(result[1].calculated.salesGrowthRate).toBeCloseTo(10);
    expect(result[0].input.netIncome).toBeCloseTo(result[0].calculated.preTaxIncome * .7);

    const lossModel = structuredClone(model);
    const lossCogsRate = lossModel.series.find((series) => series.id === 'base-cogsRate')!;
    lossCogsRate.baseValue = 150;
    lossCogsRate.periods[0].annualGrowthRate = 0;
    const loss = buildForecastPl(lossModel, 'base', latest)[0];
    expect(loss.calculated.preTaxIncome).toBeLessThan(0);
    expect(loss.input.netIncome).toBeCloseTo(loss.calculated.preTaxIncome);
  });

  it('期間分割だけでは予測値を変えず、全系列を同じ境界で分割する', () => {
    const model: ForecastModel = {
      segments: [{ id: 'A', definitionId: 'subsidy', startYear: 2026, endYear: 2029 }],
      series: [
        { id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', baseYear: 2025, baseValue: 100, periods: [{ id: 'A', startYear: 2026, endYear: 2029, annualGrowthRate: 10, startAdjustment: 20 }] },
        { id: 'base-headcount', label: 'FTE', scope: 'base', valueKind: 'fte', baseYear: 2025, baseValue: 10, periods: [{ id: 'A', startYear: 2026, endYear: 2029, annualGrowthRate: 5, startAdjustment: 1 }] },
      ],
    };
    const before = model.series.map((series) => projectForecastSeries(series).map((point) => point.value));
    const split = splitForecastSegment(model, 2028);
    expect(split.segments).toHaveLength(2);
    expect(split.series.every((series) => series.periods.length === 2)).toBe(true);
    expect(split.series.map((series) => projectForecastSeries(series).map((point) => point.value))).toEqual(before);
    expect(mergeForecastSegment(split, split.segments![1].id).segments).toHaveLength(1);
  });

  it('表入力と点ドラッグで共有する逆算により指定年の値へ連続的に収束する', () => {
    const series: ForecastSeries = { id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound', baseYear: 2025, baseValue: 100, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0 }] };
    const fitted = fitForecastSeriesPoint(series, 2027, 150);
    expect(projectForecastSeries(fitted).find((point) => point.year === 2027)?.value).toBeCloseTo(150, 6);
    expect(fitted.periods[0].annualGrowthRate).toBeGreaterThan(5);
  });

  it('基準値0からの立上げは開始時増減を逆算する', () => {
    const series: ForecastSeries = { id: 'subsidy-sales', label: '売上高', scope: 'subsidy', valueKind: 'money', projectionMode: 'compound', baseYear: 2025, baseValue: 0, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 10, startAdjustment: 0 }] };
    const fitted = fitForecastSeriesPoint(series, 2026, 100);
    expect(projectForecastSeries(fitted).find((point) => point.year === 2026)?.value).toBeCloseTo(100, 6);
    expect(fitted.periods[0].startAdjustment).toBeGreaterThan(0);
  });

  it('将来P/Lの売上高セルから対応する売上水準を逆算する', () => {
    const latest = baseHistoricalPl.at(-1)!;
    const make = (id: string, baseValue: number, mode: 'compound' | 'linear' = 'compound'): ForecastSeries => ({ id: `base-${id}`, label: id, scope: 'base', valueKind: id.includes('Rate') ? 'percent' : 'money', projectionMode: mode, baseYear: 2025, baseValue, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0 }] });
    const model: ForecastModel = { series: [make('sales', latest.sales), make('cogsRate', 60, 'linear')] };
    const before = structuredClone(model);
    const fitted = fitForecastPlCell(model, 'base', latest, 2027, 'sales', 1_500_000_000);
    expect(model).toEqual(before);
    expect(buildForecastPl(fitted, 'base', latest).find((row) => row.year === 2027)?.calculated.sales).toBeCloseTo(1_500_000_000, 2);
  });

  it('営業利益などの計算行も因果関係に対応する水準へ逆算する', () => {
    const latest = baseHistoricalPl.at(-1)!;
    const make = (id: string, baseValue: number, mode: 'compound' | 'linear' = 'compound'): ForecastSeries => ({ id: `base-${id}`, label: id, scope: 'base', valueKind: id.includes('Rate') ? 'percent' : 'money', projectionMode: mode, baseYear: 2025, baseValue, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 0, startAdjustment: 0 }] });
    const model: ForecastModel = { series: [
      make('sales', latest.sales), make('cogsRate', 62, 'linear'), make('otherSgaRate', 7, 'linear'),
      make('headcount', latest.headcount), make('payPerPerson', calculatePl(latest).employeePayPerPerson),
    ] };
    const current = buildForecastPl(model, 'base', latest).find((row) => row.year === 2027)!.calculated.operatingProfit;
    const fitted = fitForecastPlCell(model, 'base', latest, 2027, 'operatingProfit', current + 50_000_000);
    const result = buildForecastPl(fitted, 'base', latest).find((row) => row.year === 2027)!.calculated.operatingProfit;
    expect(result).toBeCloseTo(current + 50_000_000, 2);
    expect(fitted.series.find((series) => series.id === 'base-otherSgaRate')?.periods[0].annualGrowthRate).not.toBe(0);
  });

  it('個社期間の変更後も追加分割を保持し、全系列を連続した年度へ同期する', () => {
    const model: ForecastModel = {
      segments: [
        { id: 'subsidy', definitionId: 'subsidy', startYear: 2026, endYear: 2026 },
        { id: 'subsidy~2027', definitionId: 'subsidy', startYear: 2027, endYear: 2028 },
        { id: 'report', definitionId: 'report', startYear: 2029, endYear: 2031 },
      ],
      series: [{ id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', baseYear: 2025, baseValue: 100, periods: [
        { id: 'subsidy', startYear: 2026, endYear: 2026, annualGrowthRate: 5, startAdjustment: 0 },
        { id: 'subsidy~2027', startYear: 2027, endYear: 2028, annualGrowthRate: 8, startAdjustment: 0 },
        { id: 'report', startYear: 2029, endYear: 2031, annualGrowthRate: 10, startAdjustment: 0 },
      ] }],
    };
    const synchronized = synchronizeForecastTimeline(model, [
      { definitionId: 'subsidy', startYear: 2026, endYear: 2030 },
      { definitionId: 'report', startYear: 2031, endYear: 2033 },
    ]);
    expect(synchronized.segments).toEqual([
      { id: 'subsidy', definitionId: 'subsidy', startYear: 2026, endYear: 2026 },
      { id: 'subsidy~2027', definitionId: 'subsidy', startYear: 2027, endYear: 2030 },
      { id: 'report', definitionId: 'report', startYear: 2031, endYear: 2033 },
    ]);
    expect(synchronized.series[0].periods.map((period) => [period.id, period.startYear, period.endYear, period.annualGrowthRate])).toEqual([
      ['subsidy', 2026, 2026, 5], ['subsidy~2027', 2027, 2030, 8], ['report', 2031, 2033, 10],
    ]);
  });
});
