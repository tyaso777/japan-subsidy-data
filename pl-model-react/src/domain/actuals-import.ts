import { z } from 'zod';
import { combinePlSeries, subtractPlSeries } from './financials';
import type { BalanceSheetRecord, HistoricalPlInput } from './types';

export const balanceSheetImportFields = [
  'assets', 'currentAssets', 'cash', 'fixedAssets', 'tangibleAssets', 'buildings', 'machinery', 'land',
  'intangibleAssets', 'software', 'liabilities', 'currentLiabilities', 'shortTermDebt', 'fixedLiabilities',
  'longTermDebt', 'netAssets', 'shareholderEquity', 'capital', 'capex',
] as const;

export const historicalPlImportFields = [
  'sales', 'cogs', 'cogsDepreciation', 'employeeSalary', 'employeeBonus', 'officerCompensation', 'officerBonus',
  'sgaDepreciation', 'researchDevelopment', 'otherSga', 'nonOperating', 'extraordinary', 'netIncome', 'headcount',
  'officerCount',
] as const;

type BalanceSheetImportField = typeof balanceSheetImportFields[number];
type HistoricalPlImportField = typeof historicalPlImportFields[number];
type NullableNumber = number | null;

const nullableNumber = z.number().finite().nullable();
const valuesSchema = <T extends readonly string[]>(fields: T) => z.object(
  Object.fromEntries(fields.map((field) => [field, nullableNumber.optional()])) as Record<T[number], z.ZodOptional<typeof nullableNumber>>,
).strict();

const balanceSheetRecordSchema = z.object({
  year: z.number().int(),
  values: valuesSchema(balanceSheetImportFields),
}).strict();

const historicalPlRecordSchema = z.object({
  year: z.number().int(),
  values: valuesSchema(historicalPlImportFields),
}).strict();

const profitAndLossSchema = z.discriminatedUnion('inputMode', [
  z.object({
    inputMode: z.literal('base'),
    base: z.array(historicalPlRecordSchema).default([]),
    subsidy: z.array(historicalPlRecordSchema).default([]),
  }).strict(),
  z.object({
    inputMode: z.literal('company'),
    company: z.array(historicalPlRecordSchema).default([]),
    subsidy: z.array(historicalPlRecordSchema).default([]),
  }).strict(),
]);

const actualsImportFileSchema = z.object({
  format: z.literal('pl-model-actuals'),
  version: z.literal('1'),
  amountUnit: z.enum(['yen', 'thousand-yen', 'million-yen']),
  years: z.array(z.number().int()).min(1),
  balanceSheets: z.array(balanceSheetRecordSchema).default([]),
  profitAndLoss: profitAndLossSchema,
  sourceFiles: z.array(z.string()).default([]),
  unmappedItems: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
}).strict().superRefine((file, context) => {
  if (new Set(file.years).size !== file.years.length) {
    context.addIssue({ code: 'custom', path: ['years'], message: '対象年度が重複しています' });
  }
  if (file.years.some((year, index) => index > 0 && year < file.years[index - 1])) {
    context.addIssue({ code: 'custom', path: ['years'], message: '対象年度は昇順で指定してください' });
  }
  if (file.years.some((year, index) => index > 0 && year !== file.years[index - 1] + 1)) {
    context.addIssue({ code: 'custom', path: ['years'], message: '対象年度は連続している必要があります' });
  }

  const targetYears = new Set(file.years);
  const primaryPl = file.profitAndLoss.inputMode === 'company' ? file.profitAndLoss.company : file.profitAndLoss.base;
  const sections = [file.balanceSheets, primaryPl, file.profitAndLoss.subsidy];
  sections.forEach((records, sectionIndex) => {
    const seen = new Set<number>();
    records.forEach((record, recordIndex) => {
      if (!targetYears.has(record.year)) context.addIssue({ code: 'custom', path: [sectionIndex, recordIndex, 'year'], message: `対象年度外の年です: ${record.year}` });
      if (seen.has(record.year)) context.addIssue({ code: 'custom', path: [sectionIndex, recordIndex, 'year'], message: `同じ年度のレコードが重複しています: ${record.year}` });
      seen.add(record.year);
    });
  });
});

export type ActualsImportResult = {
  years: number[];
  amountUnit: 'yen' | 'thousand-yen' | 'million-yen';
  plInputMode: 'base' | 'company';
  actuals: {
    balanceSheets: BalanceSheetRecord[];
    companyPl: HistoricalPlInput[];
    basePl: HistoricalPlInput[];
    subsidyPl: HistoricalPlInput[];
  };
  sourceFiles: string[];
  unmappedItems: string[];
  notes: string[];
};

const amountMultipliers = { yen: 1, 'thousand-yen': 1_000, 'million-yen': 1_000_000 } as const;
const nonMoneyPlFields = new Set<HistoricalPlImportField>(['headcount', 'officerCount']);

function recordsByYear<T extends string>(records: Array<{ year: number; values: Partial<Record<T, NullableNumber>> }>) {
  return new Map(records.map((record) => [record.year, record.values]));
}

function normalizeRecords<T extends string>(
  years: number[],
  records: Array<{ year: number; values: Partial<Record<T, NullableNumber>> }>,
  fields: readonly T[],
  convert: (field: T, value: number) => number,
): Array<Record<T, NullableNumber>> {
  const byYear = recordsByYear(records);
  return years.map((year) => Object.fromEntries(fields.map((field) => {
    const value = byYear.get(year)?.[field];
    return [field, typeof value === 'number' ? convert(field, value) : null];
  })) as Record<T, NullableNumber>);
}

export function parseActualsImportFile(json: string): ActualsImportResult {
  const file = actualsImportFileSchema.parse(JSON.parse(json));
  const multiplier = amountMultipliers[file.amountUnit];
  const balanceSheets = normalizeRecords(file.years, file.balanceSheets, balanceSheetImportFields, (_field, value) => value * multiplier) as BalanceSheetRecord[];
  const normalizePl = (records: Array<z.infer<typeof historicalPlRecordSchema>>) => normalizeRecords(
    file.years,
    records,
    historicalPlImportFields,
    (field, value) => nonMoneyPlFields.has(field) ? value : value * multiplier,
  ) as unknown as HistoricalPlInput[];

  const subsidyPl = normalizePl(file.profitAndLoss.subsidy);
  const primaryPl = normalizePl(file.profitAndLoss.inputMode === 'company' ? file.profitAndLoss.company : file.profitAndLoss.base);
  const companyPl = file.profitAndLoss.inputMode === 'company' ? primaryPl : combinePlSeries(primaryPl, subsidyPl);
  const basePl = file.profitAndLoss.inputMode === 'base' ? primaryPl : subtractPlSeries(primaryPl, subsidyPl);

  return {
    years: [...file.years],
    amountUnit: file.amountUnit,
    plInputMode: file.profitAndLoss.inputMode,
    actuals: { balanceSheets, companyPl, basePl, subsidyPl },
    sourceFiles: file.sourceFiles,
    unmappedItems: file.unmappedItems,
    notes: file.notes,
  };
}
