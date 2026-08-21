import type { ManagementMetricDefinition, MetricTargetPolicy, MetricTimeAnchor, ProgramConfiguration } from './types';

export type MetricTargetResolution = {
  programTarget: number;
  companyTarget?: number;
  effectiveTarget: number;
  source: 'program' | 'company';
  policy: MetricTargetPolicy;
};

export function resolveMetricTarget(metric: ManagementMetricDefinition, companyTarget?: number): MetricTargetResolution {
  const policy = metric.targetPolicy ?? 'reference';
  if (!Number.isFinite(companyTarget)) return { programTarget: metric.target, effectiveTarget: metric.target, source: 'program', policy };
  const individual = Number(companyTarget);
  const effectiveTarget = policy === 'minimum'
    ? Math.max(metric.target, individual)
    : policy === 'maximum'
      ? Math.min(metric.target, individual)
      : individual;
  return { programTarget: metric.target, companyTarget: individual, effectiveTarget, source: 'company', policy };
}
import type { HistoricalPlCalculated } from './types';
import { evaluateNumericDefinitions } from './definition-graph';
import { evaluateFormula } from './formula-engine';

export class MetricDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricDefinitionError';
  }
}

export function inferMetricPeriodKind(metric: ManagementMetricDefinition): string {
  return `${metric.timePoints.length}時点指標`;
}

function resolveAnchor(anchor: MetricTimeAnchor, program: ProgramConfiguration): number {
  if (anchor.type === 'historicalEnd') return program.timeline.historical.endYear;
  if (anchor.type === 'specialYear') {
    const definition = program.definitions.specialYears.find((candidate) => candidate.id === anchor.specialYearId);
    if (!definition) throw new MetricDefinitionError(`特別年「${anchor.specialYearId}」が見つかりません`);
    const referencedPeriod = program.timeline.periods.find((candidate) => candidate.definitionId === definition.anchor.periodId);
    const base = definition.anchor.type === 'historicalEnd'
      ? program.timeline.historical.endYear
      : definition.anchor.type === 'periodStart'
        ? referencedPeriod?.startYear
        : referencedPeriod?.endYear;
    if (!Number.isFinite(base)) throw new MetricDefinitionError(`特別年「${definition.label}」の基準期間が見つかりません`);
    return base! + definition.offset;
  }
  const period = program.timeline.periods.find((candidate) => candidate.definitionId === anchor.periodId);
  if (!period) throw new MetricDefinitionError(`期間「${anchor.periodId}」が見つかりません`);
  return anchor.type === 'periodStart' ? period.startYear : period.endYear;
}

export function resolveMetricTimePoints(metric: ManagementMetricDefinition, program: ProgramConfiguration): Record<string, number> {
  return Object.fromEntries(metric.timePoints.map((point) => [point.id, resolveAnchor(point.anchor, program) + point.offset]));
}

export function validateMetricDefinition(metric: ManagementMetricDefinition): ManagementMetricDefinition {
  const pointIds = new Set(metric.timePoints.map((point) => point.id));
  if (pointIds.size !== metric.timePoints.length) throw new MetricDefinitionError('使用時点のIDが重複しています');
  const referenced = [
    ...metric.formula.matchAll(/\[[^\]\r\n]+]\[([^\]\r\n]+)]/g),
    ...metric.formula.matchAll(/YEARS\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g),
  ].flatMap((match) => match.length === 3 ? [match[1], match[2]] : [match[1]]);
  const missing = referenced.find((point) => !pointIds.has(point));
  if (missing) throw new MetricDefinitionError(`計算式が未定義の時点${missing}を参照しています`);
  return metric;
}

export type MetricDataSource = {
  records: Map<number, HistoricalPlCalculated>;
  actualInputs?: Record<string, number>;
};

export type MetricEvaluation = {
  value?: number;
  years: Record<string, number>;
  status: 'ok' | 'missing-record' | 'missing-actual' | 'error';
  message?: string;
};

const recordFields: Record<string, keyof HistoricalPlCalculated> = {
  売上高: 'sales', 売上原価: 'cogs', 原価内減価償却費: 'cogsDepreciation', 売上総利益: 'grossProfit',
  販売費及び一般管理費: 'sga', 営業利益: 'operatingProfit', 従業員給与総額: 'employeePay', 従業員人件費: 'employeePay',
  役員人件費: 'officerPay', 販管費内減価償却費: 'sgaDepreciation', 減価償却費: 'depreciation',
  研究開発費: 'researchDevelopment', その他販管費: 'otherSga', 営業外損益: 'nonOperating', 経常利益: 'ordinaryIncome',
  特別損益: 'extraordinary', 税引前当期純利益: 'preTaxIncome', 当期純利益: 'netIncome',
  '従業員数（就業時間換算）': 'headcount', 役員数: 'officerCount',
  '従業員1人当たり給与支給総額': 'employeePayPerPerson', EBITDA: 'ebitda',
};

function pointValues(year: number, source: MetricDataSource): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const [label, field] of Object.entries(recordFields)) {
    const values: Record<string, number> = {};
    for (const [recordYear, record] of source.records) {
      const offset = recordYear - year;
      const point = offset === 0 ? 't' : offset > 0 ? `t+${offset}` : `t${offset}`;
      values[point] = Number(record[field]);
    }
    result[label] = values;
  }
  return result;
}

export function evaluateManagementMetric(metric: ManagementMetricDefinition, program: ProgramConfiguration, source: MetricDataSource): MetricEvaluation {
  const years = resolveMetricTimePoints(metric, program);
  if (metric.requiresActualInput) {
    const actual = source.actualInputs?.[metric.id];
    return Number.isFinite(actual) ? { value: actual, years, status: 'ok' } : { years, status: 'missing-actual' };
  }
  try {
    validateMetricDefinition(metric);
    const values: Record<string, Record<string, number>> = {};
    for (const [point, year] of Object.entries(years)) {
      if (!source.records.has(year)) return { years, status: 'missing-record', message: `${year}年のデータがありません` };
      const raw = pointValues(year, source);
      const common = evaluateNumericDefinitions(program.definitions.commonNumericDefinitions, { values: raw, years: { t: year } });
      for (const [label, pointMap] of Object.entries(raw)) values[label] = { ...(values[label] ?? {}), [point]: pointMap.t };
      for (const [label, value] of Object.entries(common)) values[label] = { ...(values[label] ?? {}), [point]: value };
    }
    return { value: evaluateFormula(metric.formula, { values, years }), years, status: 'ok' };
  } catch (cause) {
    return { years, status: 'error', message: cause instanceof Error ? cause.message : '指標を計算できませんでした' };
  }
}
