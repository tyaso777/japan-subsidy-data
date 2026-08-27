import { describe, expect, it } from 'vitest';
import { createModelStore } from '../src/store/model-store';

describe('モデルストア', () => {
  it('B/S・2事業P/Lと期間を一つの状態として保持する', () => {
    const store = createModelStore();
    const state = store.getState();
    expect(state.actuals.balanceSheets).toHaveLength(3);
    expect(state.actuals.basePl).toHaveLength(3);
    expect(state.actuals.subsidyPl).toHaveLength(3);
    expect(state.actuals.basePl[2].sales).toBe(1_000_000_000);
    expect(state.preferences.moneyUnit).toBe('millionYen');
    expect(state.program.timeline.periods[0].endYear).toBe(2028);
    expect(state.forecast.series[0].periods.find((period) => period.id === 'report')?.boundaryYear).toBe(2028);
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
    expect(store.getState().program.timeline.periods[1]).toMatchObject({ startYear: 2030, endYear: 2032 });
    store.getState().undo();
    expect(store.getState().program.timeline.periods[1]).toMatchObject({ startYear: 2029, endYear: 2031 });
  });

  it('個社期間の変更を全予測系列の期間境界へ同期する', () => {
    const store = createModelStore();
    store.getState().updatePeriodEnd(0, 2029);
    for (const series of store.getState().forecast.series) {
      expect(series.periods[0]).toMatchObject({ startYear: 2026, endYear: 2029 });
      expect(series.periods[1]).toMatchObject({ startYear: 2030, endYear: 2032 });
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
      ['subsidy', 2026, 2026], ['subsidy~2027', 2027, 2030], ['report', 2031, 2033],
    ]);
    expect(store.getState().forecast.series.every((series) => series.periods.at(-1)?.endYear === 2033)).toBe(true);
  });

  it('制度区間の追加・削除を全予測系列へ反映する', () => {
    const store = createModelStore();
    const next = structuredClone(store.getState().program);
    next.definitions.periods.push({ id: 'followup', label: '追跡期間', modelPhase: 'postBase' });
    next.timeline.periods.push({ definitionId: 'followup', startYear: 2032, endYear: 2034 });
    store.getState().replaceProgram(next);
    expect(store.getState().forecast.segments?.at(-1)).toEqual({ id: 'followup', definitionId: 'followup', startYear: 2032, endYear: 2034 });
    expect(store.getState().forecast.series.every((series) => series.periods.at(-1)?.id === 'followup')).toBe(true);
  });
});
