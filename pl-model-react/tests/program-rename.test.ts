// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renameNumericDefinition } from '../src/domain/program-editor';
import { createDefaultProgram } from '../src/domain/timeline';

describe('共通数値定義の名称変更', () => {
  it('定義IDを安定させたまま共通式と経営指標の参照を一括更新する', () => {
    const program = createDefaultProgram();
    const renamed = renameNumericDefinition(program, '付加価値額', '粗付加価値');
    const definition = renamed.definitions.commonNumericDefinitions.find((item) => item.id === '付加価値額');
    expect(definition?.label).toBe('粗付加価値');
    expect(renamed.definitions.managementMetrics.find((item) => item.id === 'company-value-added-growth')?.formula).toContain('[粗付加価値]');
    expect(renamed.definitions.commonNumericDefinitions.find((item) => item.id === '労働生産性')?.formula).toContain('[粗付加価値]');
  });
});
