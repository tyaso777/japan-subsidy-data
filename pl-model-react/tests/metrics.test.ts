import { describe, expect, it } from 'vitest';
import { createDefaultProgram, setPeriodEndYear } from '../src/domain/timeline';
import { evaluateManagementMetric, inferMetricPeriodKind, resolveMetricTarget, resolveMetricTimePoints, validateMetricDefinition } from '../src/domain/metrics';
import { calculatePlSeries } from '../src/domain/financials';
import { balanceSheets, baseHistoricalPl } from '../src/domain/sample-data';
import type { ManagementMetricDefinition } from '../src/domain/types';

const metric = (points: ManagementMetricDefinition['timePoints']): ManagementMetricDefinition => ({
  id: 'growth', label: '成長率', enabled: true, scope: 'company', timePoints: points,
  formula: '(([売上高][C] / [売上高][A]) ^ (1 / YEARS(A, C)) - 1) * 100',
  outputUnit: '% / 年', target: 10, direction: 'min', optimization: 'adjustable',
});

describe('制度共通の経営指標定義', () => {
  it('制度目標と個社目標から制度ポリシーに従う実効目標を解決する', () => {
    const base = metric([]);
    expect(resolveMetricTarget(base)).toMatchObject({ programTarget: 10, effectiveTarget: 10, source: 'program' });
    expect(resolveMetricTarget(base, 12)).toMatchObject({ companyTarget: 12, effectiveTarget: 12, source: 'company' });
    expect(resolveMetricTarget({ ...base, targetPolicy: 'minimum' }, 8).effectiveTarget).toBe(10);
    expect(resolveMetricTarget({ ...base, targetPolicy: 'minimum' }, 12).effectiveTarget).toBe(12);
    expect(resolveMetricTarget({ ...base, targetPolicy: 'maximum' }, 12).effectiveTarget).toBe(10);
    expect(resolveMetricTarget({ ...base, targetPolicy: 'maximum' }, 8).effectiveTarget).toBe(8);
  });

  it('使用時点の個数から1〜4時点以上を自動表示する', () => {
    expect(inferMetricPeriodKind(metric([{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }]))).toBe('1時点指標');
    expect(inferMetricPeriodKind(metric([
      { id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 },
      { id: 'B', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 },
      { id: 'C', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 },
      { id: 'D', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 1 },
    ]))).toBe('4時点指標');
  });

  it('区間・特別年・調整年数から実年を解決し、個社期間変更へ追随する', () => {
    const program = createDefaultProgram();
    const definition = metric([
      { id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 },
      { id: 'B', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: -1 },
      { id: 'C', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 },
    ]);
    expect(resolveMetricTimePoints(definition, program)).toEqual({ A: 2025, B: 2027, C: 2031 });
    expect(resolveMetricTimePoints(definition, setPeriodEndYear(program, 0, 2030))).toEqual({ A: 2025, B: 2029, C: 2033 });
  });

  it('削除した時点や未定義時点を式が参照していれば明示的に拒否する', () => {
    const invalid = metric([
      { id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 },
      { id: 'C', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 },
    ]);
    expect(() => validateMetricDefinition({ ...invalid, formula: '[売上高][B] / [売上高][A]' })).toThrow('時点B');
    expect(validateMetricDefinition(invalid)).toBe(invalid);
  });

  it('共通数値定義を各時点で再利用して経営指標を評価する', () => {
    const program = createDefaultProgram();
    const records = new Map(calculatePlSeries(baseHistoricalPl).map((record, index) => [2023 + index, record]));
    const definition: ManagementMetricDefinition = {
      ...metric([
        { id: 'A', anchor: { type: 'historicalEnd' }, offset: -1 },
        { id: 'B', anchor: { type: 'historicalEnd' }, offset: 0 },
      ]),
      formula: '[付加価値額][B] / [付加価値額][A]',
    };
    const result = evaluateManagementMetric(definition, program, { records });
    expect(result.value).toBeGreaterThan(1);
    expect(result.years).toEqual({ A: 2024, B: 2025 });
  });

  it('実績入力を要求する固定参照指標は未入力を区別する', () => {
    const program = createDefaultProgram();
    const definition = { ...program.definitions.managementMetrics[3], requiresActualInput: true };
    expect(evaluateManagementMetric(definition, program, { records: new Map() }).status).toBe('missing-actual');
    expect(evaluateManagementMetric(definition, program, { records: new Map(), actualInputs: { [definition.id]: 12.5 } }).value).toBe(12.5);
  });

  it('最新期の金額中央値を億円・万円へ換算して評価する', () => {
    const program = createDefaultProgram();
    const records = new Map(calculatePlSeries(baseHistoricalPl).map((record, index) => [2023 + index, record]));
    const latestSales = program.definitions.managementMetrics.find((candidate) => candidate.id === 'latest-sales')!;
    const latestPay = program.definitions.managementMetrics.find((candidate) => candidate.id === 'latest-employee-pay-per-person')!;

    expect(evaluateManagementMetric(latestSales, program, { records }).value).toBeCloseTo(records.get(2025)!.sales / 100_000_000);
    expect(evaluateManagementMetric(latestPay, program, { records }).value).toBeCloseTo(records.get(2025)!.employeePayPerPerson / 10_000);
  });

  it('足下の賃上げを最新決算期から基準年までのCAGRとして定義する', () => {
    const program = createDefaultProgram();
    const definition = program.definitions.managementMetrics.find((candidate) => candidate.id === 'current-wage-growth')!;
    expect(resolveMetricTimePoints(definition, program)).toEqual({ A: 2025, B: 2028 });
    expect(definition.formula).toContain('YEARS(A, B)');
    expect(definition.optimization).toBe('adjustable');
  });

  it('成長率指標は基準年と事業化報告3年目を比較する', () => {
    const program = createDefaultProgram();
    const definition = program.definitions.managementMetrics.find((candidate) => candidate.id === 'company-sales-growth')!;
    expect(resolveMetricTimePoints(definition, program)).toEqual({ A: 2028, B: 2031 });

    const extended = structuredClone(program);
    extended.timeline.periods.find((period) => period.definitionId === 'report')!.endYear = 2034;
    expect(resolveMetricTimePoints(definition, extended)).toEqual({ A: 2028, B: 2031 });
  });

  it('労働生産性は役員数を加えずFTE従業員数で割る', () => {
    const formula = createDefaultProgram().definitions.commonNumericDefinitions.find((definition) => definition.id === '労働生産性')!.formula;
    expect(formula).toBe('[付加価値額][t] / [従業員数（就業時間換算）][t]');
  });

  it('売上高投資比率は補助事業全体経費を最新決算期の全社売上高で割る', () => {
    const program = createDefaultProgram();
    const records = new Map(calculatePlSeries(baseHistoricalPl).map((record, index) => [2023 + index, record]));
    const definition = program.definitions.managementMetrics.find((candidate) => candidate.id === 'latest-sales-investment-ratio')!;
    const missing = evaluateManagementMetric(definition, program, { records });
    const result = evaluateManagementMetric(definition, program, { records, actualInputs: { 'total-subsidy-project-cost': 11.3 } });
    expect(missing.status).toBe('missing-actual');
    expect(result.value).toBeCloseTo(11.3 * 100_000_000 / records.get(2025)!.sales * 100);
  });

  it('自己資本比率とROAは最新決算期のB/S・P/Lから計算する', () => {
    const program = createDefaultProgram();
    const records = new Map(calculatePlSeries(baseHistoricalPl).map((record, index) => [2023 + index, record]));
    const bs = new Map(balanceSheets.map((record, index) => [2023 + index, record]));
    const equity = program.definitions.managementMetrics.find((candidate) => candidate.id === 'latest-equity-ratio')!;
    const roa = program.definitions.managementMetrics.find((candidate) => candidate.id === 'latest-roa')!;
    expect(evaluateManagementMetric(equity, program, { records, balanceSheets: bs }).value).toBeCloseTo(balanceSheets[2].shareholderEquity / balanceSheets[2].assets * 100);
    expect(evaluateManagementMetric(roa, program, { records, balanceSheets: bs }).value).toBeCloseTo(records.get(2025)!.netIncome / balanceSheets[2].assets * 100);
  });

  it('PL・B/S外のローカルベンチマークは実績入力を求めず計算不可とする', () => {
    const program = createDefaultProgram();
    const definition = program.definitions.managementMetrics.find((candidate) => candidate.id === 'local-benchmark-score')!;
    expect(definition.requiresActualInput).not.toBe(true);
    expect(definition.calculationUnavailable).toBe(true);
    expect(evaluateManagementMetric(definition, program, { records: new Map(), actualInputs: { [definition.id]: 25 } }).status).toBe('unavailable');
  });
});
