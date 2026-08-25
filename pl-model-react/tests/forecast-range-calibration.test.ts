import { describe, expect, it } from 'vitest';
import { forecastRangeCalibrationStatus } from '../src/domain/forecast-range-calibration';
import { createModelStore } from '../src/store/model-store';

describe('過去実績による水準範囲の適正化状態', () => {
  it('未実施、適正化済み、過去実績変更後を区別する', () => {
    const store = createModelStore();
    const status = () => forecastRangeCalibrationStatus(store.getState());

    expect(status()).toBe('missing');
    store.getState().optimizeForecastRangesFromActuals();
    expect(status()).toBe('current');

    store.getState().updateHistoricalPl('base', 2, 'sales', 1_100_000_000);
    expect(status()).toBe('stale');
  });

  it('適正化処理と状態記録を一度のUndoで戻す', () => {
    const store = createModelStore();
    const before = structuredClone(store.getState().forecast);

    store.getState().optimizeForecastRangesFromActuals();
    expect(forecastRangeCalibrationStatus(store.getState())).toBe('current');
    expect(store.getState().forecast).not.toEqual(before);

    store.getState().undo();
    expect(forecastRangeCalibrationStatus(store.getState())).toBe('missing');
    expect(store.getState().forecast).toEqual(before);
  });
});
