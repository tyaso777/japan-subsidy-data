export type ForecastPeriod = {
  id: string;
  /** 分割だけでは計算起点を変えないための内部識別子。水準編集時に解除する。 */
  lineageId?: string;
  startYear: number;
  endYear: number;
  annualGrowthRate: number;
  startAdjustment: number;
  range?: { min: number; max: number };
  layers?: ForecastEffectLayers;
};

export type ForecastEffectLayers = {
  fixedAnnualIncrement: number;
  steps: Record<number, number>;
  spots: Record<number, number>;
  acceleration: number;
};

export type ForecastSegment = { id: string; definitionId: string; startYear: number; endYear: number };

export type ForecastPoint = { year: number; value: number; periodId?: string };
export type ForecastSeries = {
  id: string;
  label: string;
  scope: 'company' | 'base' | 'subsidy';
  valueKind: import('./value-units').ValueKind;
  projectionMode?: 'compound' | 'linear';
  /** fixed は全期間で基準値を維持し、水準適正化・目標最適化の対象外とする。 */
  changePolicy?: 'adjustable' | 'fixed';
  baseYear: number;
  baseValue: number;
  periods: ForecastPeriod[];
};

export type FinalYearSalesAllocation = {
  finalYear: number;
  companySales: number;
  baseSharePercent: number;
};

export type ForecastModel = {
  segments?: ForecastSegment[];
  series: ForecastSeries[];
  finalYearSalesAllocation?: FinalYearSalesAllocation;
};

import { calculatePl } from './financials';
import type { HistoricalPlCalculated, HistoricalPlInput } from './types';
import type { TimelinePeriod } from './types';

export function projectSeries(baseYear: number, baseValue: number, periods: ForecastPeriod[]): ForecastPoint[] {
  const points: ForecastPoint[] = [{ year: baseYear, value: baseValue }];
  let value = baseValue;
  for (const period of periods) {
    if (period.endYear < period.startYear) throw new Error(`期間 ${period.id} の終了年が開始年より前です`);
    for (let year = period.startYear; year <= period.endYear; year += 1) {
      value *= 1 + period.annualGrowthRate / 100;
      if (year === period.startYear) value += period.startAdjustment;
      points.push({ year, value, periodId: period.id });
    }
  }
  return points;
}

export function projectForecastSeries(series: ForecastSeries): ForecastPoint[] {
  const points: ForecastPoint[] = [{ year: series.baseYear, value: series.baseValue }];
  let value = series.baseValue;
  const lineages = new Map<string, { origin: number; startYear: number; startAdjustment: number }>();
  for (const period of series.periods) {
    if (period.endYear < period.startYear) throw new Error(`期間 ${period.id} の終了年が開始年より前です`);
    const lineageKey = period.lineageId ?? period.id;
    const lineage = lineages.get(lineageKey) ?? { origin: value, startYear: period.startYear, startAdjustment: period.startAdjustment };
    lineages.set(lineageKey, lineage);
    const origin = lineage.origin;
    const layers = period.layers ?? { fixedAnnualIncrement: 0, steps: {}, spots: {}, acceleration: 0 };
    for (let year = period.startYear; year <= period.endYear; year += 1) {
      const elapsed = year - lineage.startYear + 1;
      const step = Object.entries(layers.steps).reduce((sum, [stepYear, amount]) => Number(stepYear) <= year ? sum + amount : sum, 0);
      const spot = layers.spots[year] ?? 0;
      if (series.projectionMode === 'linear') {
        value = origin + period.annualGrowthRate * elapsed + lineage.startAdjustment + layers.acceleration * elapsed * (elapsed + 1) / 2 + layers.fixedAnnualIncrement * elapsed + step + spot;
      } else {
        const baseRate = period.annualGrowthRate / 100;
        const baseline = origin * (1 + baseRate) ** elapsed;
        let accelerated = origin;
        for (let cursor = 1; cursor <= elapsed; cursor += 1) accelerated *= 1 + baseRate + layers.acceleration * cursor / 100;
        const compoundedStartAdjustment = lineage.startAdjustment * (1 + baseRate) ** Math.max(0, elapsed - 1);
        value = baseline + (accelerated - baseline) + compoundedStartAdjustment + layers.fixedAnnualIncrement * elapsed + step + spot;
      }
      points.push({ year, value, periodId: period.id });
    }
  }
  return points;
}

export function fitForecastSeriesPoint(series: ForecastSeries, year: number, target: number): ForecastSeries {
  const result = structuredClone(series);
  const period = result.periods.find((candidate) => year >= candidate.startYear && year <= candidate.endYear);
  if (!period || !Number.isFinite(target) || result.changePolicy === 'fixed') return result;
  period.lineageId = undefined;
  const valueAtYear = () => projectForecastSeries(result).find((point) => point.year === year)?.value ?? NaN;
  const improve = (field: 'annualGrowthRate' | 'startAdjustment', epsilon: number) => {
    for (let iteration = 0; iteration < 30; iteration += 1) {
      const current = valueAtYear();
      const error = target - current;
      if (Math.abs(error) <= Math.max(1e-8, Math.abs(target) * 1e-10)) return true;
      const before = period[field];
      period[field] = before + epsilon;
      const derivative = (valueAtYear() - current) / epsilon;
      period[field] = before;
      if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) return false;
      const next = before + error / derivative;
      period[field] = field === 'annualGrowthRate' ? Math.max(-99.999, Math.min(1000, next)) : next;
    }
    return Math.abs(valueAtYear() - target) <= Math.max(1e-6, Math.abs(target) * 1e-8);
  };
  if (!improve('annualGrowthRate', .001)) improve('startAdjustment', Math.max(1e-6, Math.abs(target) * 1e-6));
  if (period.range) period.range = { min: Math.min(period.range.min, period.annualGrowthRate), max: Math.max(period.range.max, period.annualGrowthRate) };
  return result;
}

export function applyFinalYearSalesAllocation(model: ForecastModel, allocation: FinalYearSalesAllocation): ForecastModel {
  const companySales = Math.max(0, Number(allocation.companySales));
  const baseSharePercent = Math.max(0, Math.min(100, Number(allocation.baseSharePercent)));
  const targets = new Map([
    ['base-sales', companySales * baseSharePercent / 100],
    ['subsidy-sales', companySales * (100 - baseSharePercent) / 100],
  ]);
  const series = model.series.map((candidate) => {
    const target = targets.get(candidate.id);
    if (target === undefined) return structuredClone(candidate);
    const adjustable = { ...candidate, changePolicy: 'adjustable' as const };
    return { ...fitForecastSeriesPoint(adjustable, allocation.finalYear, target), changePolicy: 'fixed' as const };
  });
  return {
    ...model,
    series,
    finalYearSalesAllocation: { finalYear: allocation.finalYear, companySales, baseSharePercent },
  };
}

export function clearFinalYearSalesAllocation(model: ForecastModel): ForecastModel {
  const result = structuredClone(model);
  delete result.finalYearSalesAllocation;
  result.series = result.series.map((series) => series.id === 'base-sales' || series.id === 'subsidy-sales'
    ? { ...series, changePolicy: 'adjustable' }
    : series);
  return result;
}

const plDriverByField: Partial<Record<keyof HistoricalPlCalculated, string>> = {
  sales: 'sales', salesGrowthRate: 'sales',
  headcount: 'headcount', laborProductivity: 'headcount',
  employeePayPerPerson: 'payPerPerson', employeePay: 'payPerPerson', employeeSalary: 'payPerPerson', employeeBonus: 'payPerPerson',
  cogs: 'cogsRate', grossProfit: 'cogsRate', grossProfitMargin: 'cogsRate',
  cogsDepreciation: 'cogsDepRate', sgaDepreciation: 'sgaDepRate', depreciation: 'sgaDepRate',
  researchDevelopment: 'researchDevelopmentRate', otherSga: 'otherSgaRate', sga: 'otherSgaRate',
  operatingProfit: 'otherSgaRate', operatingProfitMargin: 'otherSgaRate', valueAdded: 'otherSgaRate', valueAddedGrowthRate: 'otherSgaRate',
  ebitda: 'otherSgaRate', ebitdaMargin: 'otherSgaRate',
  officerPay: 'officerPay', officerCompensation: 'officerPay', officerBonus: 'officerPay', officerCount: 'officerCount',
  nonOperating: 'nonOperatingRate', ordinaryIncome: 'nonOperatingRate',
  extraordinary: 'extraordinaryRate', preTaxIncome: 'extraordinaryRate',
  netIncome: 'taxRate',
};

export function fitForecastPlCell(model: ForecastModel, scope: 'base' | 'subsidy', latest: HistoricalPlInput, year: number, field: keyof HistoricalPlCalculated, target: number): ForecastModel {
  const driver = plDriverByField[field];
  if (!driver || !Number.isFinite(target)) return structuredClone(model);
  const result = structuredClone(model);
  const series = result.series.find((candidate) => candidate.id === `${scope}-${driver}`);
  const period = series?.periods.find((candidate) => year >= candidate.startYear && year <= candidate.endYear);
  if (!series || !period || series.changePolicy === 'fixed') return result;
  period.lineageId = undefined;
  const evaluate = () => Number(buildForecastPl(result, scope, latest).find((row) => row.year === year)?.calculated[field]);
  const improve = (parameter: 'annualGrowthRate' | 'startAdjustment', epsilon: number) => {
    for (let iteration = 0; iteration < 36; iteration += 1) {
      const current = evaluate();
      const error = target - current;
      if (Math.abs(error) <= Math.max(1e-5, Math.abs(target) * 1e-10)) return true;
      const before = period[parameter];
      period[parameter] = before + epsilon;
      const derivative = (evaluate() - current) / epsilon;
      period[parameter] = before;
      if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) return false;
      const change = error / derivative;
      const next = before + Math.max(-100, Math.min(100, change));
      period[parameter] = parameter === 'annualGrowthRate' ? Math.max(-99.999, Math.min(1000, next)) : before + change;
    }
    return false;
  };
  if (!improve('annualGrowthRate', .001)) improve('startAdjustment', Math.max(1e-6, Math.abs(target) * 1e-7));
  if (period.range) period.range = { min: Math.min(period.range.min, period.annualGrowthRate), max: Math.max(period.range.max, period.annualGrowthRate) };
  return result;
}

function inferredSegments(model: ForecastModel): ForecastSegment[] {
  if (model.segments?.length) return model.segments;
  return (model.series[0]?.periods ?? []).map((period) => ({ id: period.id, definitionId: period.id, startYear: period.startYear, endYear: period.endYear }));
}

export function splitForecastSegment(model: ForecastModel, splitYear: number): ForecastModel {
  const segments = inferredSegments(model);
  const index = segments.findIndex((segment) => splitYear > segment.startYear && splitYear <= segment.endYear);
  if (index < 0) return model;
  const source = segments[index];
  const nextId = `${source.id}~${splitYear}`;
  const first = { ...source, endYear: splitYear - 1 };
  const second = { ...source, id: nextId, startYear: splitYear };
  return {
    ...model,
    segments: [...segments.slice(0, index), first, second, ...segments.slice(index + 1)],
    series: model.series.map((series) => ({
      ...series,
      periods: series.periods.flatMap((period) => {
        if (period.id !== source.id) return [period];
        const lineageId = period.lineageId ?? period.id;
        return [
          { ...period, lineageId, endYear: splitYear - 1 },
          { ...period, id: nextId, lineageId, startYear: splitYear, startAdjustment: 0 },
        ];
      }),
    })),
  };
}

export function mergeForecastSegment(model: ForecastModel, segmentId: string): ForecastModel {
  const segments = inferredSegments(model);
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index <= 0 || segments[index - 1].definitionId !== segments[index].definitionId) return model;
  const previous = segments[index - 1];
  const current = segments[index];
  return {
    ...model,
    segments: [...segments.slice(0, index - 1), { ...previous, endYear: current.endYear }, ...segments.slice(index + 1)],
    series: model.series.map((series) => {
      const previousPeriod = series.periods.find((period) => period.id === previous.id);
      return { ...series, periods: series.periods.filter((period) => period.id !== current.id).map((period) => period.id === previous.id ? { ...previousPeriod!, endYear: current.endYear } : period) };
    }),
  };
}

export function synchronizeForecastTimeline(model: ForecastModel, timeline: TimelinePeriod[]): ForecastModel {
  const oldSegments = inferredSegments(model);
  const segments = timeline.flatMap((period) => {
    const existing = oldSegments.filter((segment) => segment.definitionId === period.definitionId).sort((left, right) => left.startYear - right.startYear);
    const starts = [period.startYear, ...existing.slice(1).map((segment) => segment.startYear).filter((year) => year > period.startYear && year <= period.endYear)];
    return starts.map((startYear, index) => {
      const existingAtStart = existing.find((segment) => segment.startYear === startYear);
      return {
        id: existingAtStart?.id ?? (index === 0 ? existing[0]?.id ?? period.definitionId : `${period.definitionId}~${startYear}`),
        definitionId: period.definitionId,
        startYear,
        endYear: index + 1 < starts.length ? starts[index + 1] - 1 : period.endYear,
      };
    });
  });
  const synchronized: ForecastModel = {
    ...model,
    segments,
    series: model.series.map((series) => ({
      ...series,
      periods: segments.map((segment, index) => {
        const exact = series.periods.find((period) => period.id === segment.id);
        const containingSegment = oldSegments.find((old) => old.definitionId === segment.definitionId && segment.startYear >= old.startYear && segment.startYear <= old.endYear);
        const inherited = exact ?? series.periods.find((period) => period.id === containingSegment?.id) ?? series.periods[index - 1] ?? series.periods.at(-1);
        return inherited
          ? { ...inherited, id: segment.id, startYear: segment.startYear, endYear: segment.endYear, startAdjustment: exact ? inherited.startAdjustment : 0 }
          : { id: segment.id, startYear: segment.startYear, endYear: segment.endYear, annualGrowthRate: 0, startAdjustment: 0 };
      }),
    })),
  };
  const finalYear = Math.max(...segments.map((segment) => segment.endYear));
  return synchronized.finalYearSalesAllocation?.finalYear !== undefined
    && synchronized.finalYearSalesAllocation.finalYear !== finalYear
    ? clearFinalYearSalesAllocation(synchronized)
    : synchronized;
}

export type ForecastPlYear = { year: number; input: HistoricalPlInput; calculated: HistoricalPlCalculated };

export function buildForecastPl(model: ForecastModel, scope: 'base' | 'subsidy', latest: HistoricalPlInput): ForecastPlYear[] {
  const scoped = model.series.filter((series) => series.scope === scope);
  const byDriver = new Map(scoped.map((series) => [series.id.replace(`${scope}-`, ''), projectForecastSeries(series)]));
  const salesPoints = byDriver.get('sales')?.slice(1) ?? [];
  const value = (driver: string, index: number, fallback: number) => byDriver.get(driver)?.[index + 1]?.value ?? fallback;
  const rows: ForecastPlYear[] = [];
  let previous = latest;
  salesPoints.forEach((salesPoint, index) => {
    const sales = salesPoint.value;
    const headcount = Math.max(0, value('headcount', index, previous.headcount));
    const employeePayPerPerson = Math.max(0, value('payPerPerson', index, calculatePl(previous).employeePayPerPerson));
    const employeePay = headcount * employeePayPerPerson;
    const employeeSalaryShare = value('employeeSalaryShare', index, 95) / 100;
    const officerPay = Math.max(0, value('officerPay', index, calculatePl(previous).officerPay));
    const officerCompensationShare = value('officerCompensationShare', index, 90) / 100;
    const cogs = sales * value('cogsRate', index, previous.sales ? previous.cogs / previous.sales * 100 : 0) / 100;
    const cogsDepreciation = sales * value('cogsDepRate', index, 0) / 100;
    const sgaDepreciation = sales * value('sgaDepRate', index, 0) / 100;
    const researchDevelopment = sales * value('researchDevelopmentRate', index, 0) / 100;
    const otherSga = sales * value('otherSgaRate', index, 0) / 100;
    const nonOperating = sales * value('nonOperatingRate', index, 0) / 100;
    const extraordinary = sales * value('extraordinaryRate', index, 0) / 100;
    const draft: HistoricalPlInput = {
      sales, cogs, cogsDepreciation,
      employeeSalary: employeePay * employeeSalaryShare,
      employeeBonus: employeePay * (1 - employeeSalaryShare),
      officerCompensation: officerPay * officerCompensationShare,
      officerBonus: officerPay * (1 - officerCompensationShare),
      sgaDepreciation, researchDevelopment, otherSga, nonOperating, extraordinary,
      netIncome: 0, headcount, officerCount: Math.max(0, value('officerCount', index, previous.officerCount)),
    };
    const preTaxIncome = calculatePl(draft, previous).preTaxIncome;
    const taxRate = Math.max(0, Math.min(100, value('taxRate', index, 30))) / 100;
    const input = { ...draft, netIncome: preTaxIncome * (1 - taxRate) };
    const calculated = calculatePl(input, previous);
    rows.push({ year: salesPoint.year, input, calculated });
    previous = input;
  });
  return rows;
}
