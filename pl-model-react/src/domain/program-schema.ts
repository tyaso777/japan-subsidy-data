import { z } from 'zod';
import { commonPlFormulaInputs, sortNumericDefinitions } from './definition-graph';

const anchorSchema = z.object({
  type: z.enum(['historicalEnd', 'periodStart', 'periodEnd']),
  periodId: z.string().optional(),
});

export const defaultCommonNumericDefinitions = [
  { id: '人件費', label: '人件費', formula: '[従業員給与総額][t] + [役員人件費][t]', outputPoint: 't' },
  { id: '付加価値額', label: '付加価値額', formula: '[営業利益][t] + [人件費][t] + [減価償却費][t]', outputPoint: 't' },
  { id: '労働生産性', label: '労働生産性', formula: '[付加価値額][t] / ([従業員数（就業時間換算）][t] + [役員数][t])', outputPoint: 't' },
  { id: 'EBITDA', label: 'EBITDA', formula: '[営業利益][t] + [減価償却費][t]', outputPoint: 't' },
] as const;

const commonNumericDefinitionSchema = z.object({
  id: z.string(), label: z.string(), formula: z.string(), outputPoint: z.string(),
});

const metricTimeAnchorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('historicalEnd') }),
  z.object({ type: z.literal('specialYear'), specialYearId: z.string() }),
  z.object({ type: z.literal('periodStart'), periodId: z.string() }),
  z.object({ type: z.literal('periodEnd'), periodId: z.string() }),
]);

const managementMetricSchema = z.object({
  id: z.string(), label: z.string(), enabled: z.boolean(), scope: z.enum(['company', 'base', 'subsidy']),
  timePoints: z.array(z.object({ id: z.string(), anchor: metricTimeAnchorSchema, offset: z.number().int() })).min(1),
  formula: z.string(), outputUnit: z.string(), target: z.number(), direction: z.enum(['min', 'max']),
  targetPolicy: z.enum(['reference', 'minimum', 'maximum']).default('reference'),
  optimization: z.enum(['adjustable', 'fixed']), requiresActualInput: z.boolean().optional(), calculationUnavailable: z.boolean().optional(),
});

export const programConfigurationSchema = z.object({
  schemaVersion: z.string().default('3.0'),
  program: z.object({ id: z.string(), name: z.string(), version: z.string() }),
  definitions: z.object({
    historical: z.object({ id: z.literal('historical'), label: z.string(), fixed: z.literal(true) }),
    periods: z.array(z.object({ id: z.string(), label: z.string(), modelPhase: z.enum(['toBase', 'postBase']) })).min(1, '区間定義は最低1つ必要です'),
    specialYears: z.array(z.object({ id: z.string(), label: z.string(), anchor: anchorSchema, offset: z.number().default(0) })),
    commonNumericDefinitions: z.array(commonNumericDefinitionSchema).default([...defaultCommonNumericDefinitions]),
    managementMetrics: z.array(managementMetricSchema).default([]),
  }),
  timeline: z.object({
    historical: z.object({ startYear: z.number().int(), endYear: z.number().int() }),
    periods: z.array(z.object({ definitionId: z.string(), startYear: z.number().int(), endYear: z.number().int() })),
  }),
}).superRefine((program, context) => {
  const periodIds = program.definitions.periods.map((period) => period.id);
  const specialYearIds = program.definitions.specialYears.map((special) => special.id);
  const duplicate = (values: string[]) => values.find((value, index) => values.indexOf(value) !== index);
  const duplicatePeriodId = duplicate(periodIds);
  if (duplicatePeriodId) context.addIssue({ code: 'custom', path: ['definitions', 'periods'], message: `区間IDが重複しています: ${duplicatePeriodId}` });
  const duplicateSpecialYearId = duplicate(specialYearIds);
  if (duplicateSpecialYearId) context.addIssue({ code: 'custom', path: ['definitions', 'specialYears'], message: `特別年IDが重複しています: ${duplicateSpecialYearId}` });
  const timelineIds = program.timeline.periods.map((period) => period.definitionId);
  for (const [index, definitionId] of timelineIds.entries()) if (!periodIds.includes(definitionId)) context.addIssue({ code: 'custom', path: ['timeline', 'periods', index, 'definitionId'], message: `区間定義が見つかりません: ${definitionId}` });
  for (const definitionId of periodIds) if (!timelineIds.includes(definitionId)) context.addIssue({ code: 'custom', path: ['timeline', 'periods'], message: `個社期間が見つかりません: ${definitionId}` });
  program.definitions.specialYears.forEach((special, index) => {
    if (special.anchor.type !== 'historicalEnd' && !periodIds.includes(special.anchor.periodId ?? '')) context.addIssue({ code: 'custom', path: ['definitions', 'specialYears', index, 'anchor'], message: `特別年の基準区間が見つかりません: ${special.anchor.periodId}` });
  });
  program.definitions.managementMetrics.forEach((metric, metricIndex) => metric.timePoints.forEach((point, pointIndex) => {
    const anchor = point.anchor;
    if ((anchor.type === 'periodStart' || anchor.type === 'periodEnd') && !periodIds.includes(anchor.periodId)) context.addIssue({ code: 'custom', path: ['definitions', 'managementMetrics', metricIndex, 'timePoints', pointIndex, 'anchor'], message: `指標の基準区間が見つかりません: ${anchor.periodId}` });
    if (anchor.type === 'specialYear' && !specialYearIds.includes(anchor.specialYearId)) context.addIssue({ code: 'custom', path: ['definitions', 'managementMetrics', metricIndex, 'timePoints', pointIndex, 'anchor'], message: `指標の特別年が見つかりません: ${anchor.specialYearId}` });
  }));
  try {
    sortNumericDefinitions(program.definitions.commonNumericDefinitions, commonPlFormulaInputs);
  } catch (cause) {
    context.addIssue({ code: 'custom', path: ['definitions', 'commonNumericDefinitions'], message: cause instanceof Error ? cause.message : '数値定義が不正です' });
  }
});
