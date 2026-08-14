import { describe, expect, it } from 'vitest';
import { evaluateFormula, FormulaError } from '../src/domain/formula-engine';

const context = {
  values: {
    売上高: { A: 100, B: 133.1, C: 150 },
    営業利益: { A: 10, B: 18, C: 25 },
  },
  years: { A: 2028, B: 2031, C: 2032 },
};

describe('安全な数式エンジン', () => {
  it('時点ごとに異なる数値定義と四則演算を評価する', () => {
    expect(evaluateFormula('[営業利益][C] + [売上高][A] / 2', context)).toBe(75);
  });

  it('YEARSと累乗を使ってCAGRを評価する', () => {
    const result = evaluateFormula('(([売上高][B] / [売上高][A]) ^ (1 / YEARS(A, B)) - 1) * 100', context);
    expect(result).toBeCloseTo(10, 8);
  });

  it('未知の参照・ゼロ除算・任意コードを拒否する', () => {
    expect(() => evaluateFormula('[存在しない値][A]', context)).toThrow(FormulaError);
    expect(() => evaluateFormula('1 / 0', context)).toThrow('ゼロで除算');
    expect(() => evaluateFormula('globalThis.alert(1)', context)).toThrow(FormulaError);
  });
});
