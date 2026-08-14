import { describe, expect, it } from 'vitest';
import { addPeriodDefinition, removePeriodDefinition, removeSpecialYearDefinition } from '../src/domain/program-editor';
import { createDefaultProgram } from '../src/domain/timeline';

describe('制度定義の構造編集', () => {
  it('区間追加時は直前区間の長さを引き継ぎ、翌年から連続させる', () => {
    const program = addPeriodDefinition(createDefaultProgram());
    expect(program.timeline.periods.at(-1)).toMatchObject({ startYear: 2032, endYear: 2034 });
    expect(program.definitions.periods.at(-1)?.modelPhase).toBe('postBase');
  });

  it('区間削除時は後続期間を詰め、特別年と指標時点を残存区間へ付け替える', () => {
    const result = removePeriodDefinition(createDefaultProgram(), 'subsidy');
    expect(result.definitions.periods).toHaveLength(1);
    expect(result.timeline.periods).toEqual([{ definitionId: 'report', startYear: 2026, endYear: 2028 }]);
    expect(result.definitions.specialYears.find((year) => year.id === 'base')?.anchor).toEqual({ type: 'periodEnd', periodId: 'report' });
    expect(result.definitions.managementMetrics.flatMap((metric) => metric.timePoints).every((point) => !(['periodStart', 'periodEnd'].includes(point.anchor.type) && 'periodId' in point.anchor && point.anchor.periodId === 'subsidy'))).toBe(true);
  });

  it('最後の区間は削除せず、特別年削除時は指標参照を過去実績終了年へ戻す', () => {
    const onePeriod = removePeriodDefinition(createDefaultProgram(), 'subsidy');
    expect(removePeriodDefinition(onePeriod, 'report')).toEqual(onePeriod);
    const withoutBase = removeSpecialYearDefinition(createDefaultProgram(), 'base');
    expect(withoutBase.definitions.managementMetrics.flatMap((metric) => metric.timePoints).every((point) => point.anchor.type !== 'specialYear' || point.anchor.specialYearId !== 'base')).toBe(true);
  });
});
