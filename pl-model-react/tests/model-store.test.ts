// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../src/store/model-store';

describe('モデルストア', () => {
  it('固定する補足比率にも解除後に使える既定の探索範囲を持たせる', () => {
    const forecast = createModelStore().getState().forecast;
    const expectedRanges: Record<string, { min: number; max: number }> = {
      cogsRate: { min: -10, max: 0 },
      cogsDepRate: { min: 0, max: 10 },
      sgaDepRate: { min: -10, max: 0 },
      researchDevelopmentRate: { min: 0, max: 0 },
      otherSgaRate: { min: -10, max: 0 },
    };

    for (const scope of ['base', 'subsidy']) {
      for (const [driver, range] of Object.entries(expectedRanges)) {
        const series = forecast.series.find((item) => item.id === `${scope}-${driver}`)!;
        expect(series.periods.every((period) => period.optimizationFixed === true)).toBe(true);
        expect(series.periods.every((period) => period.annualGrowthRate === 0)).toBe(true);
        expect(series.periods.every((period) => period.range?.min === range.min && period.range.max === range.max)).toBe(true);
        if (['cogsRate', 'cogsDepRate', 'sgaDepRate', 'researchDevelopmentRate', 'otherSgaRate'].includes(driver)) {
          expect(series.projectionMode).toBe('relative');
        }
      }
    }
  });

  it('すべての率ドライバーを水準比例の前年比で保持する', () => {
    const forecast = createModelStore().getState().forecast;
    const rateDrivers = [
      'cogsRate', 'cogsDepRate', 'sgaDepRate', 'researchDevelopmentRate', 'otherSgaRate',
      'employeeSalaryShare', 'officerCompensationShare', 'nonOperatingRate', 'extraordinaryRate', 'taxRate',
    ];

    for (const scope of ['base', 'subsidy']) {
      for (const driver of rateDrivers) {
        expect(forecast.series.find((item) => item.id === `${scope}-${driver}`)?.projectionMode).toBe('relative');
      }
    }
  });

  it('B/S・2事業P/Lと期間を一つの状態として保持する', () => {
    const store = createModelStore();
    const state = store.getState();
    expect(state.actuals.balanceSheets).toHaveLength(3);
    expect(state.actuals.basePl).toHaveLength(3);
    expect(state.actuals.subsidyPl).toHaveLength(3);
    expect(state.actuals.companyPl).toHaveLength(3);
    expect(state.actuals.plInputMode).toBe('base');
    expect(state.actuals.companyPl[2].sales).toBe(1_100_000_000);
    expect(state.actuals.basePl[2].sales).toBe(1_000_000_000);
    expect(state.preferences.moneyUnit).toBe('millionYen');
    expect(state.program.timeline.periods[0].endYear).toBe(2028);
    expect(state.forecast.series[0].periods.find((period) => period.id === 'report')).not.toHaveProperty('boundaryYear');
  });

  it('変更をUndo・Redoできる', () => {
    const store = createModelStore();
    store.getState().updateHistoricalPl('base', 0, 'sales', 1_234_000_000);
    expect(store.getState().actuals.basePl[0].sales).toBe(1_234_000_000);
    expect(store.getState().canUndo).toBe(true);

    store.getState().undo();
    expect(store.getState().actuals.basePl[0].sales).toBe(900_000_000);
    expect(store.getState().canRedo).toBe(true);

    store.getState().redo();
    expect(store.getState().actuals.basePl[0].sales).toBe(1_234_000_000);
  });

  it('表示単位の変更では内部金額とUndo履歴を変えない', () => {
    const store = createModelStore();
    store.getState().setMoneyUnit('hundredMillionYen');
    expect(store.getState().preferences.moneyUnit).toBe('hundredMillionYen');
    expect(store.getState().actuals.basePl[2].sales).toBe(1_000_000_000);
    expect(store.getState().canUndo).toBe(false);
  });

  it('トランザクション中の複数変更を一度のUndoで戻す', () => {
    const store = createModelStore();
    store.getState().beginTransaction();
    store.getState().updateHistoricalPl('base', 0, 'sales', 910_000_000);
    store.getState().updateHistoricalPl('base', 0, 'sales', 920_000_000);
    store.getState().updateHistoricalPl('base', 0, 'sales', 930_000_000);
    store.getState().commitTransaction();
    expect(store.getState().actuals.basePl[0].sales).toBe(930_000_000);
    store.getState().undo();
    expect(store.getState().actuals.basePl[0].sales).toBe(900_000_000);
  });

  it('期間変更も履歴に含める', () => {
    const store = createModelStore();
    store.getState().updatePeriodEnd(0, 2029);
    expect(store.getState().program.timeline.periods[1]).toMatchObject({ startYear: 2030, endYear: 2033 });
    store.getState().undo();
    expect(store.getState().program.timeline.periods[1]).toMatchObject({ startYear: 2029, endYear: 2032 });
  });

  it('個社期間の変更を全予測系列の期間境界へ同期する', () => {
    const store = createModelStore();
    store.getState().updatePeriodEnd(0, 2029);
    for (const series of store.getState().forecast.series) {
      expect(series.periods[0]).toMatchObject({ startYear: 2026, endYear: 2029 });
      expect(series.periods[1]).toMatchObject({ startYear: 2030, endYear: 2033 });
    }
  });

  it('ベース入力時は全社P/Lを合算し、全社入力時はベースP/Lを差額で同期する', () => {
    const store = createModelStore();

    store.getState().updateHistoricalPl('base', 2, 'sales', 1_200_000_000);
    expect(store.getState().actuals.companyPl[2].sales).toBe(1_300_000_000);

    store.getState().setHistoricalPlInputMode('company');
    store.getState().updateHistoricalPl('company', 2, 'sales', 1_500_000_000);
    expect(store.getState().actuals.basePl[2].sales).toBe(1_400_000_000);

    store.getState().updateHistoricalPl('subsidy', 2, 'sales', 200_000_000);
    expect(store.getState().actuals.companyPl[2].sales).toBe(1_500_000_000);
    expect(store.getState().actuals.basePl[2].sales).toBe(1_300_000_000);
  });

  it('案件未読込の空欄は自動算出側でも0に変換せず空欄のまま保つ', () => {
    const store = createModelStore(undefined, { initialActuals: 'empty' });

    expect(store.getState().actuals.basePl[0].sales).toBeNull();
    expect(store.getState().actuals.companyPl[0].sales).toBeNull();
  });

  it('案件反映時に制度期間を正規化し全予測系列を同じ境界へ同期する', () => {
    const store = createModelStore();
    const state = store.getState();
    const snapshot = structuredClone({ program: state.program, actuals: state.actuals, forecast: state.forecast, caseSettings: state.caseSettings });
    snapshot.program.definitions.specialYears.find((year) => year.id === 'base')!.anchor = { type: 'periodEnd', periodId: 'subsidy' };
    snapshot.program.timeline.periods[1] = { definitionId: 'report', startYear: 2028, endYear: 2031 };
    snapshot.forecast.series.forEach((series) => {
      const report = series.periods.find((period) => period.id === 'report');
      if (report) Object.assign(report, { startYear: 2028, endYear: 2031 });
    });

    store.getState().replaceSnapshot(snapshot);

    expect(store.getState().program.timeline.periods[1]).toEqual({ definitionId: 'report', startYear: 2029, endYear: 2032 });
    expect(store.getState().program.definitions.specialYears.find((year) => year.id === 'base')?.anchor).toEqual({ type: 'periodStart', periodId: 'report' });
    for (const series of store.getState().forecast.series) {
      expect(series.periods.find((period) => period.id === 'report')).toMatchObject({ startYear: 2029, endYear: 2032 });
      expect(series.periods.find((period) => period.id === 'report')).not.toHaveProperty('boundaryYear');
    }
  });

  it('予測系列の編集で他系列と過去実績の参照を維持する', () => {
    const store = createModelStore();
    const before = store.getState();
    const target = before.forecast.series[0];
    const untouched = before.forecast.series[1];
    const actuals = before.actuals;

    store.getState().updateForecastPeriod(target.id, target.periods[0].id, { annualGrowthRate: 18 });

    const after = store.getState();
    expect(after.forecast.series[0]).not.toBe(target);
    expect(after.forecast.series[1]).toBe(untouched);
    expect(after.actuals).toBe(actuals);
  });

  it('過去実績の編集で予測モデルの参照を維持する', () => {
    const store = createModelStore();
    const forecast = store.getState().forecast;

    store.getState().updateHistoricalPl('base', 0, 'sales', 999_000_000);

    expect(store.getState().forecast).toBe(forecast);
  });

  it('期間分割・解除を履歴付きで全系列へ適用する', () => {
    const store = createModelStore();
    const before = store.getState().forecast;
    store.getState().splitForecastAtYear(2027);
    expect(store.getState().forecast.segments).toHaveLength(3);
    expect(store.getState().forecast.series.every((series) => series.periods.length === 3)).toBe(true);
    store.getState().undo();
    expect(store.getState().forecast).toStrictEqual(before);
    store.getState().redo();
    const splitId = store.getState().forecast.segments![1].id;
    store.getState().mergeForecastPeriod(splitId);
    expect(store.getState().forecast.segments).toHaveLength(2);
  });

  it('制度定義の編集を1操作として履歴管理する', () => {
    const store = createModelStore();
    const next = structuredClone(store.getState().program);
    next.program.name = '新制度';
    store.getState().replaceProgram(next);
    expect(store.getState().program.program.name).toBe('新制度');
    store.getState().undo();
    expect(store.getState().program.program.name).toBe('成長投資向け標準定義');
  });

  it('期間終了年の変更時も追加分割を保持して予測期間を同期する', () => {
    const store = createModelStore();
    store.getState().splitForecastAtYear(2027);
    store.getState().updatePeriodEnd(0, 2030);
    expect(store.getState().forecast.segments?.map((segment) => [segment.id, segment.startYear, segment.endYear])).toEqual([
      ['subsidy', 2026, 2026], ['subsidy~2027', 2027, 2030], ['report', 2031, 2034],
    ]);
    expect(store.getState().forecast.series.every((series) => series.periods.at(-1)?.endYear === 2034)).toBe(true);
  });

  it('制度区間の追加・削除を全予測系列へ反映する', () => {
    const store = createModelStore();
    const next = structuredClone(store.getState().program);
    next.definitions.periods.push({ id: 'followup', label: '追跡期間', modelPhase: 'postBase' });
    next.timeline.periods.push({ definitionId: 'followup', startYear: 2033, endYear: 2035 });
    store.getState().replaceProgram(next);
    expect(store.getState().forecast.segments?.at(-1)).toEqual({ id: 'followup', definitionId: 'followup', startYear: 2033, endYear: 2035 });
    expect(store.getState().forecast.series.every((series) => series.periods.at(-1)?.id === 'followup')).toBe(true);
  });
});
