import { describe, expect, it } from 'vitest';
import { nextChartExtent } from '../src/domain/chart-scale';

describe('段階式チャート軸', () => {
  it('範囲内では固定し、超過した瞬間だけ読みやすい次水準へ拡張する', () => {
    expect(nextChartExtent({ min: 0, max: 2000 }, [1999])).toEqual({ min: 0, max: 2000 });
    expect(nextChartExtent({ min: 0, max: 2000 }, [2001])).toEqual({ min: 0, max: 3000 });
    expect(nextChartExtent({ min: 0, max: 3000 }, [3001])).toEqual({ min: 0, max: 4500 });
  });

  it('大きく戻した時は過大な軸を適切な段階まで縮小し、通常は0を下限にする', () => {
    expect(nextChartExtent({ min: 0, max: 30000 }, [5000])).toEqual({ min: 0, max: 7500 });
    expect(nextChartExtent(undefined, [-3, 8]).min).toBeLessThan(0);
    expect(nextChartExtent(undefined, [3, 8]).min).toBe(0);
  });
});
