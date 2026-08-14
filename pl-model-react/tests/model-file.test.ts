import { describe, expect, it } from 'vitest';
import { createModelStore } from '../src/store/model-store';
import { parseModelFile, serializeModelFile } from '../src/domain/model-file';

describe('案件データ保存境界', () => {
  it('円単位のモデルをJSONへ保存して復元する', () => {
    const state = createModelStore().getState();
    const json = serializeModelFile({ program: state.program, actuals: state.actuals, forecast: state.forecast });
    const restored = parseModelFile(json);
    expect(restored.actuals.basePl[2].sales).toBe(1_000_000_000);
    expect(restored.forecast.series.length).toBeGreaterThan(0);
  });

  it('不正な案件データを拒否する', () => {
    expect(() => parseModelFile('{"actuals":{}}')).toThrow();
  });
});
