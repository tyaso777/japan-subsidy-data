import { describe, expect, it } from 'vitest';
import { calculatePlSeries } from '../src/domain/financials';
import { applyProgramNumericDefinitions } from '../src/domain/program-pl-definitions';
import { buildProgramPlRows, historicalPlRows } from '../src/domain/rows';
import { createDefaultProgram } from '../src/domain/timeline';
import { baseHistoricalPl } from '../src/domain/sample-data';
import { buildPlLogicNodes } from '../src/domain/pl-logic';

describe('制度定義から生成するP/L補足指標', () => {
  it('01の付加価値額の式を変えるとP/L表示値も変わる', () => {
    const program = createDefaultProgram();
    const definition = program.definitions.commonNumericDefinitions.find((item) => item.id === '付加価値額')!;
    definition.formula = '[営業利益][t]';
    const records = applyProgramNumericDefinitions(calculatePlSeries(baseHistoricalPl), [2023, 2024, 2025], program.definitions.commonNumericDefinitions);

    expect(records[2].programValues?.['付加価値額']).toBe(records[2].operatingProfit);
    expect(records[2].valueAdded).toBe(records[2].operatingProfit);
  });

  it('選択した基準科目の直後へ制度指標を挿入し、A番号を自動採番する', () => {
    const program = createDefaultProgram();
    program.definitions.commonNumericDefinitions.push({
      id: 'custom-margin', label: '独自利益率', formula: '[営業利益][t] / [売上高][t] * 100', outputPoint: 't',
      plDisplay: { enabled: true, insertAfter: '3', insertOrder: 1, valueKind: 'percent', indent: 1 },
    });
    const rows = buildProgramPlRows(historicalPlRows, program.definitions.commonNumericDefinitions);
    const cogsIndex = rows.findIndex((row) => row.code === '3');
    const customIndex = rows.findIndex((row) => row.code === 'S20');

    expect(rows[cogsIndex + 1]).toMatchObject({
      code: 'program:custom-margin',
      displayCode: 'A-1',
      label: '独自利益率',
      supplementary: true,
      calculated: true,
      valueKind: 'percent',
    });
    expect(customIndex).toBe(-1);
  });

  it('同じ挿入位置では挿入順で並べ、PL全体の順序でA番号を付ける', () => {
    const program = createDefaultProgram();
    const valueAdded = program.definitions.commonNumericDefinitions.find((item) => item.id === '付加価値額')!;
    valueAdded.plDisplay = { enabled: true, insertAfter: '3', insertOrder: 2, valueKind: 'money' };
    program.definitions.commonNumericDefinitions.push({
      id: 'custom-margin', label: '独自利益率', formula: '[営業利益][t] / [売上高][t] * 100', outputPoint: 't',
      plDisplay: { enabled: true, insertAfter: '3', insertOrder: 1, valueKind: 'percent' },
    });

    const rows = buildProgramPlRows(historicalPlRows, program.definitions.commonNumericDefinitions);
    const cogsIndex = rows.findIndex((row) => row.code === '3');
    expect(rows.slice(cogsIndex + 1, cogsIndex + 3).map((row) => [row.displayCode, row.label])).toEqual([
      ['A-1', '独自利益率'],
      ['A-2', '付加価値額'],
    ]);
  });

  it('PL表示を無効にした共通数値定義は表へ追加しない', () => {
    const program = createDefaultProgram();
    const definition = program.definitions.commonNumericDefinitions.find((item) => item.id === '付加価値額')!;
    definition.plDisplay!.enabled = false;
    const rows = buildProgramPlRows(historicalPlRows, program.definitions.commonNumericDefinitions);
    expect(rows.some((row) => row.label === '付加価値額')).toBe(false);
  });

  it('A番号へ変わっても既存計算行の参照先を制度指標へつなぎ直す', () => {
    const program = createDefaultProgram();
    const nodes = buildPlLogicNodes(program.definitions.commonNumericDefinitions);
    const valueAdded = nodes.find((node) => node.label === '付加価値額')!;
    const valueAddedGrowth = nodes.find((node) => node.label === '付加価値増加率')!;
    const ebitda = nodes.find((node) => node.label === 'EBITDA')!;
    const ebitdaMargin = nodes.find((node) => node.label === 'EBITDAマージン')!;

    expect(valueAdded.code).toBe('program:付加価値額');
    expect(valueAdded.displayCode).toMatch(/^A-/);
    expect(valueAddedGrowth.dependsOn).toContain(valueAdded.code);
    expect(ebitdaMargin.dependsOn).toContain(ebitda.code);
  });
});
