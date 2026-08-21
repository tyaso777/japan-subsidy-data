import { describe, expect, it } from 'vitest';
import { createModelStore } from '../src/store/model-store';
import { parseModelFile, serializeModelFile } from '../src/domain/model-file';

describe('案件データ保存境界', () => {
  it('円単位のモデルをJSONへ保存して復元する', () => {
    const store = createModelStore();
    const state = store.getState();
    state.updateFinalYearSalesAllocation(65);
    state.updateMetricTarget('company-sales-growth', 35);
    const updated = store.getState();
    const json = serializeModelFile({ program: updated.program, actuals: updated.actuals, forecast: updated.forecast, caseSettings: updated.caseSettings });
    const restored = parseModelFile(json);
    expect(restored.actuals.basePl[2].sales).toBe(1_000_000_000);
    expect(restored.forecast.series.length).toBeGreaterThan(0);
    expect(restored.forecast.finalYearSalesAllocation).toEqual({ finalYear: 2031, baseSharePercent: 65 });
    expect(restored.caseSettings.metricTargets).toEqual({ 'company-sales-growth': 35 });
  });

  it('個社目標を未設定へ戻すと案件JSONからも削除する', () => {
    const store = createModelStore();
    store.getState().updateMetricTarget('company-sales-growth', 35);
    store.getState().updateMetricTarget('company-sales-growth', null);
    expect(store.getState().caseSettings.metricTargets).toEqual({});
  });

  it('不正な案件データを拒否する', () => {
    expect(() => parseModelFile('{"actuals":{}}')).toThrow();
  });
});
