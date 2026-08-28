// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DefinitionGraphError, evaluateNumericDefinitions, sortNumericDefinitions } from '../src/domain/definition-graph';

describe('数値定義の依存グラフ', () => {
  it('参照関係に従って評価順を決める', () => {
    const ordered = sortNumericDefinitions([
      { id: '労働生産性', formula: '[付加価値額][A] / [従業員数][A]' },
      { id: '付加価値額', formula: '[営業利益][A] + [給与総額][A] + [減価償却費][A]' },
    ], new Set(['営業利益', '給与総額', '減価償却費', '従業員数']));
    expect(ordered.map((definition) => definition.id)).toEqual(['付加価値額', '労働生産性']);
  });

  it('依存順に共通数値定義を安全に評価する', () => {
    const result = evaluateNumericDefinitions([
      { id: '労働生産性', outputPoint: 'A', formula: '[付加価値額][A] / [従業員数][A]' },
      { id: '付加価値額', outputPoint: 'A', formula: '[営業利益][A] + [給与総額][A] + [減価償却費][A]' },
    ], {
      values: { 営業利益: { A: 120 }, 給与総額: { A: 150 }, 減価償却費: { A: 30 }, 従業員数: { A: 100 } },
      years: { A: 2031 },
    });
    expect(result).toEqual({ 付加価値額: 300, 労働生産性: 3 });
  });

  it('循環参照と不足参照を拒否する', () => {
    expect(() => sortNumericDefinitions([
      { id: 'A', formula: '[B][t]' },
      { id: 'B', formula: '[A][t]' },
    ], new Set())).toThrow(DefinitionGraphError);
    expect(() => sortNumericDefinitions([{ id: 'A', formula: '[未定義][t]' }], new Set())).toThrow('未定義');
  });
});
