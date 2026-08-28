// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildTimelineYearLabels, createDefaultProgram, normalizeProgram, resolveTimeline, setPeriodEndYear } from '../src/domain/timeline';

describe('制度期間', () => {
  it('通常年の区間内呼称へ特別年の呼称を重ねる', () => {
    const labels = buildTimelineYearLabels(createDefaultProgram());
    expect(labels[2025]).toEqual({ primary: '最新決算期' });
    expect(labels[2028]).toEqual({ primary: '補助事業期間3年目' });
    expect(labels[2029]).toEqual({ primary: '基準年度' });
    expect(labels[2032]).toEqual({ primary: '事業化報告期間3年目' });
  });
  it('既定の補助事業期間は3年で、基準年度の後に報告1～3年目が続く', () => {
    const resolved = resolveTimeline(createDefaultProgram());
    expect(resolved.periodYears.find((period) => period.definitionId === 'subsidy')?.years).toEqual([2026, 2027, 2028]);
    expect(resolved.specialYears.find((year) => year.id === 'base')?.year).toBe(2029);
    expect(resolved.periodYears.find((period) => period.definitionId === 'report')?.years).toEqual([2029, 2030, 2031, 2032]);
  });
  it('過去実績の翌年から事業期間を連続させる', () => {
    const program = createDefaultProgram();
    const changed = setPeriodEndYear(program, 0, 2029);

    expect(changed.timeline.periods[0].endYear).toBe(2029);
    expect(changed.timeline.periods[1].startYear).toBe(2030);
    expect(resolveTimeline(changed).years).toEqual([2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033]);
  });

  it('期間終了年に紐づく特別年を解決する', () => {
    const resolved = resolveTimeline(createDefaultProgram());
    expect(resolved.specialYears.find((year) => year.id === 'base')?.year).toBe(2029);
  });

  it('2次公募の採択者中央値14指標を既定目標として搭載する', () => {
    const metrics = createDefaultProgram().definitions.managementMetrics;
    expect(metrics.map((metric) => metric.id)).toEqual([
      'company-sales-growth', 'company-value-added-growth', 'company-productivity-growth',
      'latest-sales-investment-ratio', 'latest-sales', 'total-subsidy-project-cost',
      'latest-ebitda-margin', 'employee-pay-growth', 'employee-payroll-growth',
      'latest-employee-pay-per-person', 'current-wage-growth', 'latest-equity-ratio',
      'local-benchmark-score', 'latest-roa',
    ]);
    expect(Object.fromEntries(metrics.map((metric) => [metric.id, metric.target]))).toEqual({
      'company-sales-growth': 30.5,
      'company-value-added-growth': 35,
      'company-productivity-growth': 23.7,
      'latest-sales-investment-ratio': 54.7,
      'latest-sales': 20.5,
      'total-subsidy-project-cost': 11.3,
      'latest-ebitda-margin': 9.4,
      'employee-pay-growth': 6.5,
      'employee-payroll-growth': 17.4,
      'latest-employee-pay-per-person': 436.9,
      'current-wage-growth': 3,
      'latest-equity-ratio': 43.8,
      'local-benchmark-score': 22.3,
      'latest-roa': 5.1,
    });
  });

  it('循環参照を含む制度定義は読み込まず安全な既定値へ戻す', () => {
    const invalid = createDefaultProgram();
    invalid.program.name = '循環する制度';
    invalid.definitions.commonNumericDefinitions = [
      { id: 'A', label: 'A', formula: '[B][t]', outputPoint: 't' },
      { id: 'B', label: 'B', formula: '[A][t]', outputPoint: 't' },
    ];

    const normalized = normalizeProgram(invalid);

    expect(normalized.program.name).not.toBe('循環する制度');
    expect(normalized.definitions.commonNumericDefinitions.map((definition) => definition.id)).toContain('付加価値額');
  });

  it('基準年度と事業化報告期間が矛盾する古い制度定義は既定の連続した期間へ戻す', () => {
    const inconsistent = createDefaultProgram();
    inconsistent.definitions.specialYears.find((year) => year.id === 'base')!.anchor = {
      type: 'periodEnd',
      periodId: 'subsidy',
    };
    inconsistent.timeline.periods[1].startYear = 2028;
    inconsistent.timeline.periods[1].endYear = 2031;

    const normalized = normalizeProgram(inconsistent);

    expect(normalized.definitions.specialYears.find((year) => year.id === 'base')).toMatchObject({
      anchor: { type: 'periodStart', periodId: 'report' },
      offset: 0,
    });
    expect(normalized.timeline.periods).toEqual([
      { definitionId: 'subsidy', startYear: 2026, endYear: 2028 },
      { definitionId: 'report', startYear: 2029, endYear: 2032 },
    ]);
    expect(resolveTimeline(normalized).specialYears.find((year) => year.id === 'base')?.year).toBe(2029);
  });
});
