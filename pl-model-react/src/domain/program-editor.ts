import type { ManagementMetricDefinition, MetricTimeAnchor, ProgramConfiguration } from './types';

function replaceFormulaReference(formula: string, previousLabel: string, nextLabel: string): string {
  return formula.replaceAll(`[${previousLabel}]`, `[${nextLabel}]`);
}

/** 表示名は変更しても永続IDは維持し、参照式を原子的に追従させる。 */
export function renameNumericDefinition(program: ProgramConfiguration, definitionId: string, nextLabel: string): ProgramConfiguration {
  const result = structuredClone(program);
  const definition = result.definitions.commonNumericDefinitions.find((item) => item.id === definitionId);
  if (!definition || definition.label === nextLabel) return result;
  const previousLabel = definition.label;
  definition.label = nextLabel;
  for (const item of result.definitions.commonNumericDefinitions) item.formula = replaceFormulaReference(item.formula, previousLabel, nextLabel);
  for (const metric of result.definitions.managementMetrics) metric.formula = replaceFormulaReference(metric.formula, previousLabel, nextLabel);
  return result;
}

function generatedId(prefix: string, count: number) {
  return `${prefix}-${count + 1}-${Date.now().toString(36)}`;
}

export function addPeriodDefinition(program: ProgramConfiguration): ProgramConfiguration {
  const result = structuredClone(program);
  const previous = result.timeline.periods.at(-1);
  const duration = previous ? Math.max(1, previous.endYear - previous.startYear + 1) : 1;
  const startYear = (previous?.endYear ?? result.timeline.historical.endYear) + 1;
  const id = generatedId('period', result.definitions.periods.length);
  const previousDefinition = previous && result.definitions.periods.find((candidate) => candidate.id === previous.definitionId);
  result.definitions.periods.push({ id, label: `期間${result.definitions.periods.length + 1}`, modelPhase: previousDefinition?.modelPhase ?? 'postBase' });
  result.timeline.periods.push({ definitionId: id, startYear, endYear: startYear + duration - 1 });
  return result;
}

function replacePeriodAnchor(anchor: MetricTimeAnchor, removedId: string, fallbackId: string): MetricTimeAnchor {
  if ((anchor.type === 'periodStart' || anchor.type === 'periodEnd') && anchor.periodId === removedId) return { ...anchor, periodId: fallbackId };
  return anchor;
}

export function removePeriodDefinition(program: ProgramConfiguration, definitionId: string): ProgramConfiguration {
  if (program.definitions.periods.length <= 1) return program;
  const index = program.timeline.periods.findIndex((period) => period.definitionId === definitionId);
  if (index < 0) return program;
  const result = structuredClone(program);
  const removed = result.timeline.periods[index];
  const removedDuration = Math.max(1, removed.endYear - removed.startYear + 1);
  result.timeline.periods.splice(index, 1);
  result.definitions.periods = result.definitions.periods.filter((period) => period.id !== definitionId);
  for (let cursor = index; cursor < result.timeline.periods.length; cursor += 1) {
    const period = result.timeline.periods[cursor];
    period.startYear -= removedDuration;
    period.endYear -= removedDuration;
  }
  const fallbackId = result.timeline.periods[Math.min(index, result.timeline.periods.length - 1)].definitionId;
  result.definitions.specialYears = result.definitions.specialYears.map((special) => special.anchor.periodId === definitionId ? { ...special, anchor: { ...special.anchor, periodId: fallbackId } } : special);
  result.definitions.managementMetrics = result.definitions.managementMetrics.map((metric) => ({ ...metric, timePoints: metric.timePoints.map((point) => ({ ...point, anchor: replacePeriodAnchor(point.anchor, definitionId, fallbackId) })) }));
  return result;
}

export function removeSpecialYearDefinition(program: ProgramConfiguration, specialYearId: string): ProgramConfiguration {
  const result = structuredClone(program);
  result.definitions.specialYears = result.definitions.specialYears.filter((special) => special.id !== specialYearId);
  result.definitions.managementMetrics = result.definitions.managementMetrics.map((metric: ManagementMetricDefinition) => ({
    ...metric,
    timePoints: metric.timePoints.map((point) => point.anchor.type === 'specialYear' && point.anchor.specialYearId === specialYearId ? { ...point, anchor: { type: 'historicalEnd' } } : point),
  }));
  return result;
}
