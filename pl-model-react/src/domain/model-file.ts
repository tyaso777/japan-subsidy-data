import { z } from 'zod';
import { programConfigurationSchema } from './program-schema';
import type { ModelSnapshot } from '../store/model-store';

const historicalPlSchema = z.object({
  sales: z.number(), cogs: z.number(), cogsDepreciation: z.number(), employeeSalary: z.number(), employeeBonus: z.number(),
  officerCompensation: z.number(), officerBonus: z.number(), sgaDepreciation: z.number(), researchDevelopment: z.number(),
  otherSga: z.number(), nonOperating: z.number(), extraordinary: z.number(), netIncome: z.number(), headcount: z.number(), officerCount: z.number(),
});

const forecastPeriodSchema = z.object({
  id: z.string(), startYear: z.number().int(), endYear: z.number().int(), annualGrowthRate: z.number(), startAdjustment: z.number(),
  lineageId: z.string().optional(),
  range: z.object({ min: z.number(), max: z.number() }).refine((range) => range.min <= range.max, '最小値は最大値以下にしてください').optional(),
  layers: z.object({ fixedAnnualIncrement: z.number(), steps: z.record(z.string(), z.number()), spots: z.record(z.string(), z.number()), acceleration: z.number() }).optional(),
});

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
  caseSettings: z.object({ metricTargets: z.record(z.string(), z.number()).default({}) }).default({ metricTargets: {} }),
});

const modelFileSchema = z.object({ fileVersion: z.literal('1'), model: snapshotSchema });

export function serializeModelFile(model: ModelSnapshot): string {
  return JSON.stringify({ fileVersion: '1', model }, null, 2);
}

export function parseModelFile(json: string): ModelSnapshot {
  return modelFileSchema.parse(JSON.parse(json)).model;
}
