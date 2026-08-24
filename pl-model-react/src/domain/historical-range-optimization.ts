import { calculatePlSeries } from './financials';
import type { ForecastModel, ForecastSeries } from './forecast-engine';
import type { HistoricalPlCalculated, HistoricalPlInput, ProgramConfiguration } from './types';

export type HistoricalRangeOptimizationResult = {
  forecast: ForecastModel;
  updatedPeriods: number;
  fallbackPeriods: number;
};

type Scope = 'base' | 'subsidy';
type Phase = 'toBase' | 'postBase';
type Range = { min: number; max: number };

const fallbackRanges: Record<string, Record<Scope, Range>> = {
  sales: { base: { min: -3, max: 8 }, subsidy: { min: -5, max: 15 } },
  headcount: { base: { min: -3, max: 5 }, subsidy: { min: -3, max: 8 } },
  payPerPerson: { base: { min: 0, max: 6 }, subsidy: { min: 0, max: 6 } },
  cogsRate: { base: { min: -2, max: 0 }, subsidy: { min: -2, max: 0 } },
  otherSgaRate: { base: { min: -2, max: 0 }, subsidy: { min: -2, max: 0 } },
  officerPayPerPerson: { base: { min: 0, max: 6 }, subsidy: { min: 0, max: 6 } },
  officerCount: { base: { min: 0, max: 0 }, subsidy: { min: 0, max: 0 } },
};

const generalLinearFallback: Range = { min: -1, max: 1 };

function driverId(series: ForecastSeries): string {
  return series.id.replace(`${series.scope}-`, '');
}

function midpoint(range: Range): number {
  return (range.min + range.max) / 2;
}

function roundSetting(value: number): number {
  return Number(value.toFixed(2));
}

function roundRange(range: Range): Range {
  return { min: roundSetting(range.min), max: roundSetting(range.max) };
}

function valuesForDriver(driver: string, rows: HistoricalPlCalculated[]): number[] {
  const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : Number.NaN;
  return rows.map((row) => {
    switch (driver) {
      case 'sales': return row.sales;
      case 'headcount': return row.headcount;
      case 'payPerPerson': return row.employeePayPerPerson;
      case 'cogsRate': return row.cogsRate;
      case 'cogsDepRate': return ratio(row.cogsDepreciation, row.sales);
      case 'sgaDepRate': return ratio(row.sgaDepreciation, row.sales);
      case 'researchDevelopmentRate': return ratio(row.researchDevelopment, row.sales);
      case 'otherSgaRate': return row.otherSgaRate;
      case 'officerPayPerPerson': return row.officerPayPerPerson;
      case 'employeeSalaryShare': return ratio(row.employeeSalary, row.employeePay);
      case 'officerCompensationShare': return ratio(row.officerCompensation, row.officerPay);
      case 'nonOperatingRate': return ratio(row.nonOperating, row.sales);
      case 'extraordinaryRate': return ratio(row.extraordinary, row.sales);
      case 'taxRate': return row.preTaxIncome > 0 ? (1 - row.netIncome / row.preTaxIncome) * 100 : Number.NaN;
      case 'officerCount': return row.officerCount;
      default: return Number.NaN;
    }
  });
}

function historicalChanges(series: ForecastSeries, rows: HistoricalPlCalculated[]): number[] {
  const values = valuesForDriver(driverId(series), rows);
  return values.slice(1).map((value, index) => {
    const previous = values[index];
    if (!Number.isFinite(value) || !Number.isFinite(previous)) return Number.NaN;
    if (series.projectionMode === 'linear') return value - previous;
    return previous ? (value / previous - 1) * 100 : Number.NaN;
  }).filter(Number.isFinite);
}

function statisticalRange(values: number[]): (Range & { center: number }) | null {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return { min: mean - 2 * deviation, max: mean + 2 * deviation, center: mean };
}

function baseRange(series: ForecastSeries, rows: HistoricalPlCalculated[]): { range: Range; initialValue: number; fallback: boolean } {
  const driver = driverId(series);
  const observed = statisticalRange(historicalChanges(series, rows));
  const fallback = fallbackRanges[driver]?.[series.scope as Scope]
    ?? (series.projectionMode === 'linear' ? generalLinearFallback : { min: -5, max: 10 });
  const initialValue = observed?.center ?? midpoint(fallback);
  const range = observed ?? fallback;
  const upperHeadroom = driver === 'sales'
    ? (series.scope === 'subsidy' ? 30 : 20)
    : driver === 'payPerPerson' ? 5 : null;
  return {
    range: upperHeadroom !== null
      ? { min: range.min, max: initialValue + upperHeadroom }
      : range,
    initialValue,
    fallback: observed === null,
  };
}

function shifted(range: Range, amount: number): Range {
  return { min: range.min + amount, max: range.max + amount };
}

function postBaseAdjustment(series: ForecastSeries): number {
  const driver = driverId(series);
  const scope = series.scope as Scope;
  return driver === 'sales' ? (scope === 'subsidy' ? 10 : 2)
    : driver === 'headcount' || driver === 'payPerPerson' ? .5
      : driver === 'cogsRate' || driver === 'otherSgaRate' ? -.5
        : 0;
}

function postBaseRange(series: ForecastSeries, toBase: Range): Range {
  return shifted(toBase, postBaseAdjustment(series));
}

function phaseForPeriod(model: ForecastModel, program: ProgramConfiguration, periodId: string): Phase {
  const definitionId = model.segments?.find((segment) => segment.id === periodId)?.definitionId ?? periodId.split('~')[0];
  return program.definitions.periods.find((period) => period.id === definitionId)?.modelPhase ?? 'toBase';
}

export function optimizeForecastRangesFromActuals(
  model: ForecastModel,
  program: ProgramConfiguration,
  basePl: HistoricalPlInput[],
  subsidyPl: HistoricalPlInput[],
): HistoricalRangeOptimizationResult {
  const forecast = structuredClone(model);
  const actuals = { base: calculatePlSeries(basePl), subsidy: calculatePlSeries(subsidyPl) };
  let updatedPeriods = 0;
  let fallbackPeriods = 0;

  forecast.series.filter((series) => series.scope !== 'company').forEach((series) => {
    const source = actuals[series.scope as Scope];
    const driver = driverId(series);
    if (series.changePolicy === 'fixed' || driver === 'taxRate') {
      const latestLevel = valuesForDriver(driverId(series), source).at(-1);
      const fixedLevel = Number.isFinite(latestLevel) ? latestLevel! : driver === 'taxRate' ? 30 : series.baseValue;
      if (driver === 'taxRate') {
        series.changePolicy = 'fixed';
      }
      series.baseValue = fixedLevel;
      series.periods.forEach((period, index) => {
        period.annualGrowthRate = 0;
        period.startValue = index === 0 ? fixedLevel : null;
        period.startAdjustment = 0;
        period.range = { min: 0, max: 0 };
        period.lineageId = undefined;
        updatedPeriods += 1;
      });
      return;
    }
    if (driver === 'cogsRate') {
      const latestLevel = valuesForDriver(driver, source).at(-1);
      const fixedLevel = Number.isFinite(latestLevel) ? latestLevel! : series.baseValue;
      series.baseValue = fixedLevel;
      series.periods.forEach((period, index) => {
        period.annualGrowthRate = 0;
        period.startValue = index === 0 ? fixedLevel : null;
        period.startAdjustment = 0;
        period.range = { min: 0, max: 0 };
        period.lineageId = undefined;
        updatedPeriods += 1;
      });
      return;
    }
    const derived = baseRange(series, source);
    series.periods.forEach((period) => {
      const phase = phaseForPeriod(forecast, program, period.id);
      const range = roundRange(phase === 'postBase' ? postBaseRange(series, derived.range) : derived.range);
      period.range = range;
      period.annualGrowthRate = roundSetting(derived.initialValue + (phase === 'postBase' ? postBaseAdjustment(series) : 0));
      period.lineageId = undefined;
      updatedPeriods += 1;
      if (derived.fallback) fallbackPeriods += 1;
    });
  });

  return { forecast, updatedPeriods, fallbackPeriods };
}
