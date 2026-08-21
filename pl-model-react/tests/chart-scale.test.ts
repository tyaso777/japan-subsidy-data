import { describe, expect, it } from 'vitest';
import { chartAxisTicks, nextChartExtent } from '../src/domain/chart-scale';

describe('段階式チャート軸', () => {
  it('範囲内では固定し、超過した瞬間だけ読みやすい次水準へ拡張する', () => {
    expect(nextChartExtent({ min: 0, max: 2000 }, [1999])).toEqual({ min: 0, max: 2000 });
    expect(nextChartExtent({ min: 0, max: 2000 }, [2001])).toEqual({ min: 0, max: 3000 });
    expect(nextChartExtent({ min: 0, max: 3000 }, [3001])).toEqual({ min: 0, max: 4000 });
  });

  it('大きく戻した時は過大な軸を適切な段階まで縮小し、通常は0を下限にする', () => {
    expect(nextChartExtent({ min: 0, max: 30000 }, [5000])).toEqual({ min: 0, max: 8000 });
    expect(nextChartExtent(undefined, [-3, 8]).min).toBeLessThan(0);
    expect(nextChartExtent(undefined, [3, 8]).min).toBe(0);
  });

  it('縦軸を端点を含む5目盛り・4区間へ等分する', () => {
    expect(chartAxisTicks({ min: 0, max: 2000 })).toEqual([0, 500, 1000, 1500, 2000]);
    expect(chartAxisTicks({ min: 0, max: 3000 })).toEqual([0, 750, 1500, 2250, 3000]);
    expect(chartAxisTicks({ min: -20, max: 60 })).toEqual([-20, 0, 20, 40, 60]);
  });
});
