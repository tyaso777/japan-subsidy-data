import { defaultCommonNumericDefinitions, programConfigurationSchema } from './program-schema';
import { createDefaultManagementMetrics } from './default-management-metrics';
import type { ProgramConfiguration } from './types';

export type TimelineYearLabel = { primary: string; secondary?: string };

export function createDefaultProgram(): ProgramConfiguration {
  return {
    schemaVersion: '3.0',
    program: { id: 'generic-growth-subsidy', name: '成長投資向け標準定義', version: '1.0' },
    definitions: {
      historical: { id: 'historical', label: '過去実績', fixed: true },
      periods: [
        { id: 'subsidy', label: '補助事業期間', modelPhase: 'toBase' },
        { id: 'report', label: '事業化報告期間', modelPhase: 'postBase' },
      ],
      specialYears: [
        { id: 'latest', label: '最新決算期', anchor: { type: 'historicalEnd' }, offset: 0 },
        { id: 'base', label: '基準年', anchor: { type: 'periodEnd', periodId: 'subsidy' }, offset: 0 },
      ],
      commonNumericDefinitions: defaultCommonNumericDefinitions.map((definition) => structuredClone(definition)),
      managementMetrics: createDefaultManagementMetrics(),
    },
    timeline: {
      historical: { startYear: 2023, endYear: 2025 },
      periods: [
        { definitionId: 'subsidy', startYear: 2026, endYear: 2028 },
        { definitionId: 'report', startYear: 2029, endYear: 2031 },
      ],
    },
  };
}

export function normalizeProgram(input: unknown): ProgramConfiguration {
  const parsed = programConfigurationSchema.safeParse(input);
  return parsed.success ? parsed.data : createDefaultProgram();
}

function integerRange(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export function resolveTimeline(program: ProgramConfiguration) {
  const historicalYears = integerRange(program.timeline.historical.startYear, program.timeline.historical.endYear);
  const periodYears = program.timeline.periods.map((period) => ({ ...period, years: integerRange(period.startYear, period.endYear) }));
  const years = [...historicalYears, ...periodYears.flatMap((period) => period.years)];
  const specialYears = program.definitions.specialYears.map((definition) => {
    const period = program.timeline.periods.find((candidate) => candidate.definitionId === definition.anchor.periodId);
    const anchorYear = definition.anchor.type === 'historicalEnd'
      ? program.timeline.historical.endYear
      : definition.anchor.type === 'periodStart'
        ? period?.startYear
        : period?.endYear;
    return { id: definition.id, label: definition.label, year: (anchorYear ?? program.timeline.historical.endYear) + definition.offset };
  });
  return { historicalYears, periodYears, years, specialYears };
}

function historicalClosingLabel(index: number, count: number) {
  const ago = count - index - 1;
  if (ago === 0) return '最新決算期';
  if (ago === 1) return '前期決算期';
  if (ago === 2) return '前々期決算期';
  return `${ago}期前決算期`;
}

export function buildTimelineYearLabels(program: ProgramConfiguration): Record<number, TimelineYearLabel> {
  const resolved = resolveTimeline(program);
  const labels: Record<number, TimelineYearLabel> = {};
  resolved.historicalYears.forEach((year, index) => { labels[year] = { primary: historicalClosingLabel(index, resolved.historicalYears.length) }; });
  resolved.periodYears.forEach((period) => {
    const definition = program.definitions.periods.find((candidate) => candidate.id === period.definitionId);
    period.years.forEach((year, index) => { labels[year] = { primary: `${definition?.label ?? period.definitionId}${index + 1}年目` }; });
  });
  resolved.specialYears.forEach((special) => {
    const existing = labels[special.year];
    labels[special.year] = { primary: special.label, secondary: existing?.primary === special.label ? undefined : existing?.primary };
  });
  return labels;
}

export function describeSpecialYearAnchor(program: ProgramConfiguration, specialYearId: string): string {
  const definition = program.definitions.specialYears.find((candidate) => candidate.id === specialYearId);
  if (!definition) return '定義なし';
  const offset = definition.offset === 0 ? '±0年' : `${definition.offset > 0 ? '+' : '−'}${Math.abs(definition.offset)}年`;
  if (definition.anchor.type === 'historicalEnd') return `${program.definitions.historical.label}・終了年 ${offset}`;
  const period = program.definitions.periods.find((candidate) => candidate.id === definition.anchor.periodId);
  return `${period?.label ?? definition.anchor.periodId ?? '不明な期間'}・${definition.anchor.type === 'periodStart' ? '開始年' : '終了年'} ${offset}`;
}

export function setPeriodEndYear(program: ProgramConfiguration, index: number, endYear: number): ProgramConfiguration {
  const periods = program.timeline.periods.map((period) => ({ ...period }));
  if (!periods[index]) return program;
  periods[index].endYear = Math.max(periods[index].startYear, Math.trunc(endYear));
  for (let cursor = index + 1; cursor < periods.length; cursor += 1) {
    const duration = Math.max(0, periods[cursor].endYear - periods[cursor].startYear);
    periods[cursor].startYear = periods[cursor - 1].endYear + 1;
    periods[cursor].endYear = periods[cursor].startYear + duration;
  }
  return { ...program, timeline: { ...program.timeline, periods } };
}
