import { z } from 'zod';
import { programConfigurationSchema } from './program-schema';
import type { ModelSnapshot } from '../store/model-store';

const historicalPlSchema = z.object({
  sales: z.number(), cogs: z.number(), cogsDepreciation: z.number(), employeeSalary: z.number(), employeeBonus: z.number(),
  officerCompensation: z.number(), officerBonus: z.number(), sgaDepreciation: z.number(), researchDevelopment: z.number(),
  otherSga: z.number(), nonOperating: z.number(), extraordinary: z.number(), netIncome: z.number(), headcount: z.number(), officerCount: z.number(),
});

const forecastPeriodSchema = z.object({
  id: z.string(), startYear: z.number().int(), endYear: z.number().int(), boundaryYear: z.number().int().optional(), annualGrowthRate: z.number(), startValue: z.number().nullable().optional().default(null), startAdjustment: z.number(),
  lineageId: z.string().optional(),
  range: z.object({ min: z.number(), max: z.number() }).refine((range) => range.min <= range.max, '最小値は最大値以下にしてください').optional(),
}).strict();

const forecastSeriesSchema = z.object({
  id: z.string(), label: z.string(), scope: z.enum(['company', 'base', 'subsidy']),
  valueKind: z.enum(['money', 'percent', 'point', 'fte', 'count', 'moneyPerPerson', 'multiple', 'index']),
  projectionMode: z.enum(['compound', 'linear']).optional(),
  changePolicy: z.enum(['adjustable', 'fixed']).optional(),
  baseYear: z.number().int(), baseValue: z.number(), periods: z.array(forecastPeriodSchema),
});

const snapshotSchema = z.object({
  program: programConfigurationSchema,
  actuals: z.object({
    balanceSheets: z.array(z.record(z.string(), z.number())),
    basePl: z.array(historicalPlSchema),
    subsidyPl: z.array(historicalPlSchema),
    metricInputs: z.record(z.string(), z.number()).default({}),
  }),
  forecast: z.object({
    segments: z.array(z.object({ id: z.string(), definitionId: z.string(), startYear: z.number().int(), endYear: z.number().int() })).optional(),
    series: z.array(forecastSeriesSchema),
    finalYearSalesAllocation: z.object({
      finalYear: z.number().int(), baseSharePercent: z.number().min(0).max(100),
    }).optional(),
  }),
  caseSettings: z.object({
    metricTargets: z.record(z.string(), z.number()).default({}),
    forecastRangeCalibration: z.object({ sourceFingerprint: z.string() }).optional(),
    subsidyNewBusiness: z.boolean().optional(),
  }).default({ metricTargets: {} }),
});

const modelFileSchema = z.object({ fileVersion: z.literal('1'), model: snapshotSchema });

export function serializeModelFile(model: ModelSnapshot): string {
  return JSON.stringify({ fileVersion: '1', model }, null, 2);
}

export function parseModelFile(json: string): ModelSnapshot {
  const model = modelFileSchema.parse(JSON.parse(json)).model;
  const postBaseIds = new Set(model.program.definitions.periods.filter((period) => period.modelPhase === 'postBase').map((period) => period.id));
  model.forecast.series.forEach((series) => {
    series.periods.forEach((period) => {
      const segment = model.forecast.segments?.find((candidate) => candidate.id === period.id);
      const definitionId = segment?.definitionId ?? period.id.split('~')[0];
      if (!postBaseIds.has(definitionId) || period.id.includes('~')) return;
      period.boundaryYear ??= period.startYear;
    });
  });
  return model;
}
