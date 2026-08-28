// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { metricAttainmentColor, metricAttainmentScore } from '../src/domain/metric-attainment';

describe('経営指標の達成度色', () => {
  it('未達から達成まで棒全体に使う単色を連続変化させる', () => {
    expect(metricAttainmentScore('min', 0, 100)).toBe(0);
    expect(metricAttainmentScore('min', 65, 100)).toBe(.65);
    expect(metricAttainmentScore('min', 100, 100)).toBe(1);
    expect(metricAttainmentScore('max', 120, 100)).toBe(.8);
    expect(metricAttainmentColor(0)).toBe('rgb(199, 91, 36)');
    expect(metricAttainmentColor(.65)).toBe('rgb(178, 138, 46)');
    expect(metricAttainmentColor(1)).toBe('rgb(22, 125, 120)');
  });
});
