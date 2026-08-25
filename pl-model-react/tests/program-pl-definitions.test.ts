import { describe, expect, it } from 'vitest';
import { calculatePlSeries } from '../src/domain/financials';
import { applyProgramNumericDefinitions } from '../src/domain/program-pl-definitions';
import { buildProgramPlRows, historicalPlRows } from '../src/domain/rows';
import { createDefaultProgram } from '../src/domain/timeline';
import { baseHistoricalPl } from '../src/domain/sample-data';

describe('制度定義から生成するP/L補足指標', () => {
  it('01の付加価値額の式を変えるとP/L表示値も変わる', () => {
    const program = createDefaultProgram();
    const definition = program.definitions.commonNumericDefinitions.find((item) => item.id === '付加価値額')!;
    definition.formula = '[営業利益][t]';
    const records = applyProgramNumericDefinitions(calculatePlSeries(baseHistoricalPl), [2023, 2024, 2025], program.definitions.commonNumericDefinitions);

    expect(records[2].programValues?.['付加価値額']).toBe(records[2].operatingProfit);
    expect(records[2].valueAdded).toBe(records[2].operatingProfit);
  });

  it('PL表示順が小さい制度指標から指定位置へ表示する', () => {
    const program = createDefaultProgram();
    program.definitions.commonNumericDefinitions.push({
      id: 'custom-margin', label: '独自利益率', formula: '[営業利益][t] / [売上高][t] * 100', outputPoint: 't',
      plDisplay: { enabled: true, code: 'S20', order: 16.5, valueKind: 'percent', indent: 1 },
    });
    const rows = buildProgramPlRows(historicalPlRows, program.definitions.commonNumericDefinitions);
    const operatingProfitIndex = rows.findIndex((row) => row.code === '16');
    const customIndex = rows.findIndex((row) => row.code === 'S20');
    const operatingProfitMarginIndex = rows.findIndex((row) => row.code === '17');

    expect(customIndex).toBeGreaterThan(operatingProfitIndex);
    expect(customIndex).toBeLessThan(operatingProfitMarginIndex);
    expect(rows[customIndex]).toMatchObject({ label: '独自利益率', supplementary: true, calculated: true, valueKind: 'percent' });
  });

  it('PL表示を無効にした共通数値定義は表へ追加しない', () => {
    const program = createDefaultProgram();
    const definition = program.definitions.commonNumericDefinitions.find((item) => item.id === '付加価値額')!;
    definition.plDisplay!.enabled = false;
    const rows = buildProgramPlRows(historicalPlRows, program.definitions.commonNumericDefinitions);
    expect(rows.some((row) => row.label === '付加価値額')).toBe(false);
  });
});
