import { createStore, type StoreApi } from 'zustand/vanilla';
import { createDefaultProgram, normalizeProgram, setPeriodEndYear } from '../domain/timeline';
import { balanceSheets, baseHistoricalPl, subsidyHistoricalPl } from '../domain/sample-data';
import {
  mergeForecastSegment,
  splitForecastSegment,
  synchronizeForecastTimeline,
  type ForecastEffectLayers,
  type ForecastModel,
  type ForecastPeriod,
} from '../domain/forecast-engine';
import type { BalanceSheetRecord, HistoricalPlInput, ProgramConfiguration } from '../domain/types';
import type { MoneyDisplayUnit } from '../domain/value-units';
import { calculatePl } from '../domain/financials';
import { defaultForecastRange, normalizeForecastRanges } from '../domain/forecast-range';
import { optimizeForecastRangesFromActuals, type HistoricalRangeOptimizationResult } from '../domain/historical-range-optimization';

export type BusinessScope = 'base' | 'subsidy';
export type ModelSnapshot = {
  program: ProgramConfiguration;
  actuals: {
    balanceSheets: BalanceSheetRecord[];
    basePl: HistoricalPlInput[];
    subsidyPl: HistoricalPlInput[];
    metricInputs: Record<string, number>;
  };
  forecast: ForecastModel;
};

type ModelPreferences = { moneyUnit: MoneyDisplayUnit };

type ModelActions = {
  preferences: ModelPreferences;
  canUndo: boolean;
  canRedo: boolean;
  isTransactionActive: boolean;
  setMoneyUnit: (unit: MoneyDisplayUnit) => void;
  replaceProgram: (program: ProgramConfiguration) => void;
  replaceForecast: (forecast: ForecastModel) => void;
  updatePeriodEnd: (index: number, year: number) => void;
  updateHistoricalBoundary: (boundary: 'startYear' | 'endYear', year: number) => void;
  updateBalanceSheet: (yearIndex: number, field: string, value: number) => void;
  updateHistoricalPl: (scope: BusinessScope, yearIndex: number, field: keyof HistoricalPlInput, value: number) => void;
  updateMetricActual: (metricId: string, value: number) => void;
  optimizeForecastRangesFromActuals: () => HistoricalRangeOptimizationResult;
  updateForecastPeriod: (seriesId: string, periodId: string, patch: Partial<Pick<ForecastPeriod, 'annualGrowthRate' | 'startAdjustment' | 'range'>>) => void;
  updateForecastLayer: (seriesId: string, periodId: string, patch: Partial<ForecastEffectLayers>) => void;
  splitForecastAtYear: (year: number) => void;
  mergeForecastPeriod: (segmentId: string) => void;
  beginTransaction: () => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  replaceSnapshot: (snapshot: ModelSnapshot) => void;
  undo: () => void;
  redo: () => void;
};

export type ModelStore = ModelSnapshot & ModelActions;

function cloneSnapshot(snapshot: ModelSnapshot): ModelSnapshot {
  return structuredClone(snapshot);
}

function sameSnapshot(left: ModelSnapshot, right: ModelSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function defaultForecast(program: ProgramConfiguration, basePl: HistoricalPlInput[], subsidyPl: HistoricalPlInput[]): ForecastModel {
  const baseYear = program.timeline.historical.endYear;
  const periods = (change: number, projectionMode: 'compound' | 'linear'): ForecastPeriod[] => program.timeline.periods.map((period) => ({ id: period.definitionId, startYear: period.startYear, endYear: period.endYear, annualGrowthRate: change, startAdjustment: 0, range: defaultForecastRange(projectionMode) }));
  const forScope = (scope: BusinessScope, latest: HistoricalPlInput, growth: { sales: number; headcount: number; pay: number }) => {
    const calculated = calculatePl(latest);
    const compound = (id: string, label: string, valueKind: import('../domain/value-units').ValueKind, baseValue: number, rate: number) => ({ id: `${scope}-${id}`, label, scope, valueKind, projectionMode: 'compound' as const, baseYear, baseValue, periods: periods(rate, 'compound') });
    const linear = (id: string, label: string, baseValue: number, change = 0) => ({ id: `${scope}-${id}`, label, scope, valueKind: 'percent' as const, projectionMode: 'linear' as const, baseYear, baseValue, periods: periods(change, 'linear') });
    return [
      compound('sales', '売上高', 'money', latest.sales, growth.sales),
      compound('headcount', '従業員数（就業時間換算）', 'fte', latest.headcount, growth.headcount),
      compound('payPerPerson', '1人当たり給与', 'moneyPerPerson', calculated.employeePayPerPerson, growth.pay),
      linear('cogsRate', '原価率', latest.sales ? latest.cogs / latest.sales * 100 : 0, -1),
      linear('cogsDepRate', '原価内減価償却費率', latest.sales ? latest.cogsDepreciation / latest.sales * 100 : 0),
      linear('sgaDepRate', '販管費内減価償却費率', latest.sales ? latest.sgaDepreciation / latest.sales * 100 : 0),
      linear('researchDevelopmentRate', '研究開発費の売上高比率', latest.sales ? latest.researchDevelopment / latest.sales * 100 : 0),
      linear('otherSgaRate', 'その他販管費率', latest.sales ? latest.otherSga / latest.sales * 100 : 0, -.5),
      compound('officerPay', '役員人件費', 'money', calculated.officerPay, 2),
      linear('employeeSalaryShare', '従業員給与のうち給与割合', calculated.employeePay ? latest.employeeSalary / calculated.employeePay * 100 : 95),
      linear('officerCompensationShare', '役員給与のうち報酬割合', calculated.officerPay ? latest.officerCompensation / calculated.officerPay * 100 : 90),
      linear('nonOperatingRate', '営業外損益の売上高比率', latest.sales ? latest.nonOperating / latest.sales * 100 : 0),
      linear('extraordinaryRate', '特別損益の売上高比率', latest.sales ? latest.extraordinary / latest.sales * 100 : 0),
      linear('taxRate', '実効税率', calculated.preTaxIncome ? (1 - latest.netIncome / calculated.preTaxIncome) * 100 : 30),
      compound('officerCount', '役員数', 'count', latest.officerCount, 0),
    ];
  };
  return { segments: program.timeline.periods.map((period) => ({ id: period.definitionId, definitionId: period.definitionId, startYear: period.startYear, endYear: period.endYear })), series: [
    ...forScope('base', basePl.at(-1)!, { sales: 8, headcount: 3, pay: 4 }),
    ...forScope('subsidy', subsidyPl.at(-1)!, { sales: 12, headcount: 5, pay: 5 }),
  ] };
}

function initialSnapshot(programInput?: unknown): ModelSnapshot {
  const program = normalizeProgram(programInput ?? createDefaultProgram());
  const actuals = {
    balanceSheets: structuredClone(balanceSheets),
    basePl: structuredClone(baseHistoricalPl),
    subsidyPl: structuredClone(subsidyHistoricalPl),
    metricInputs: {},
  };
  return { program, actuals, forecast: defaultForecast(program, actuals.basePl, actuals.subsidyPl) };
}

export function createModelStore(program?: unknown): StoreApi<ModelStore> {
  const past: ModelSnapshot[] = [];
  const future: ModelSnapshot[] = [];
  let transactionBase: ModelSnapshot | null = null;
  return createStore<ModelStore>((set, get) => {
    const currentSnapshot = (): ModelSnapshot => ({ program: get().program, actuals: get().actuals, forecast: get().forecast });
    const applyMutation = (mutate: (snapshot: ModelSnapshot) => ModelSnapshot) => {
      const current = currentSnapshot();
      const next = mutate(current);
      if (sameSnapshot(current, next)) return;
      if (!transactionBase) {
        past.push(cloneSnapshot(current));
        future.length = 0;
      }
      set({ ...next, canUndo: true, canRedo: false });
    };
    return {
      ...initialSnapshot(program),
      preferences: { moneyUnit: 'millionYen' },
      canUndo: false,
      canRedo: false,
      isTransactionActive: false,
      setMoneyUnit: (moneyUnit) => set({ preferences: { ...get().preferences, moneyUnit } }),
      replaceProgram: (program) => applyMutation((snapshot) => ({
        ...snapshot,
        program: structuredClone(program),
        forecast: normalizeForecastRanges(synchronizeForecastTimeline(snapshot.forecast, program.timeline.periods)),
      })),
      replaceForecast: (forecast) => applyMutation((snapshot) => ({ ...snapshot, forecast: normalizeForecastRanges(forecast) })),
      updatePeriodEnd: (index, year) => {
        if (get().program.timeline.periods[index]?.endYear === year) return;
        applyMutation((snapshot) => {
          const program = setPeriodEndYear(snapshot.program, index, year);
          const forecast = synchronizeForecastTimeline(snapshot.forecast, program.timeline.periods);
          return { ...snapshot, program, forecast };
        });
      },
      updateHistoricalBoundary: (boundary, year) => applyMutation((snapshot) => {
        const historical = snapshot.program.timeline.historical;
        const duration = historical.endYear - historical.startYear;
        const nextHistorical = boundary === 'startYear'
          ? { startYear: Math.trunc(year), endYear: Math.trunc(year) + duration }
          : { startYear: Math.trunc(year) - duration, endYear: Math.trunc(year) };
        let cursor = nextHistorical.endYear + 1;
        const periods = snapshot.program.timeline.periods.map((period) => {
          const periodDuration = period.endYear - period.startYear;
          const next = { ...period, startYear: cursor, endYear: cursor + periodDuration };
          cursor = next.endYear + 1;
          return next;
        });
        const program = { ...snapshot.program, timeline: { historical: nextHistorical, periods } };
        const synchronized = synchronizeForecastTimeline(snapshot.forecast, periods);
        const forecast = { ...synchronized, series: synchronized.series.map((series) => ({ ...series, baseYear: nextHistorical.endYear })) };
        return { ...snapshot, program, forecast };
      }),
      updateBalanceSheet: (yearIndex, field, value) => {
        if (get().actuals.balanceSheets[yearIndex]?.[field] === value) return;
        applyMutation((snapshot) => ({
          ...snapshot,
          actuals: {
            ...snapshot.actuals,
            balanceSheets: snapshot.actuals.balanceSheets.map((record, index) => index === yearIndex ? { ...record, [field]: value } : record),
          },
        }));
      },
      updateHistoricalPl: (scope, yearIndex, field, value) => {
        const currentRecords = scope === 'base' ? get().actuals.basePl : get().actuals.subsidyPl;
        if (currentRecords[yearIndex]?.[field] === value) return;
        applyMutation((snapshot) => {
          const records = scope === 'base' ? snapshot.actuals.basePl : snapshot.actuals.subsidyPl;
          const updated = records.map((record, index) => index === yearIndex ? { ...record, [field]: value } : record);
          return {
            ...snapshot,
            actuals: {
              ...snapshot.actuals,
              ...(scope === 'base' ? { basePl: updated } : { subsidyPl: updated }),
            },
          };
        });
      },
      updateMetricActual: (metricId, value) => applyMutation((snapshot) => ({
        ...snapshot,
        actuals: { ...snapshot.actuals, metricInputs: { ...snapshot.actuals.metricInputs, [metricId]: value } },
      })),
      optimizeForecastRangesFromActuals: () => {
        const snapshot = currentSnapshot();
        const result = optimizeForecastRangesFromActuals(snapshot.forecast, snapshot.program, snapshot.actuals.basePl, snapshot.actuals.subsidyPl);
        applyMutation((current) => ({ ...current, forecast: result.forecast }));
        return result;
      },
      updateForecastPeriod: (seriesId, periodId, patch) => applyMutation((snapshot) => ({
        ...snapshot,
        forecast: {
          ...snapshot.forecast,
          series: snapshot.forecast.series.map((series) => series.id === seriesId ? {
            ...series,
            periods: series.periods.map((period) => period.id === periodId ? { ...period, ...patch, lineageId: undefined } : period),
          } : series),
        },
      })),
      updateForecastLayer: (seriesId, periodId, patch) => applyMutation((snapshot) => ({
        ...snapshot,
        forecast: {
          ...snapshot.forecast,
          series: snapshot.forecast.series.map((series) => series.id === seriesId ? {
            ...series,
            periods: series.periods.map((period) => {
              if (period.id !== periodId) return period;
              const current = period.layers ?? {
                fixedAnnualIncrement: 0,
                steps: {},
                spots: {},
                acceleration: 0,
              };
              return {
                ...period,
                lineageId: undefined,
                layers: {
                  ...current,
                  ...patch,
                  steps: patch.steps ? { ...current.steps, ...patch.steps } : current.steps,
                  spots: patch.spots ? { ...current.spots, ...patch.spots } : current.spots,
                },
              };
            }),
          } : series),
        },
      })),
      splitForecastAtYear: (year) => applyMutation((snapshot) => ({
        ...snapshot,
        forecast: splitForecastSegment(snapshot.forecast, year),
      })),
      mergeForecastPeriod: (segmentId) => applyMutation((snapshot) => ({
        ...snapshot,
        forecast: mergeForecastSegment(snapshot.forecast, segmentId),
      })),
      beginTransaction: () => {
        if (transactionBase) return;
        transactionBase = cloneSnapshot(currentSnapshot());
        set({ isTransactionActive: true });
      },
      commitTransaction: () => {
        if (!transactionBase) return;
        const base = transactionBase;
        transactionBase = null;
        const changed = !sameSnapshot(base, currentSnapshot());
        if (changed) { past.push(base); future.length = 0; }
        set({ isTransactionActive: false, canUndo: past.length > 0, canRedo: future.length > 0 });
      },
      cancelTransaction: () => {
        if (!transactionBase) return;
        const base = transactionBase;
        transactionBase = null;
        set({ ...base, isTransactionActive: false, canUndo: past.length > 0, canRedo: future.length > 0 });
      },
      replaceSnapshot: (snapshot) => {
        transactionBase = null;
        past.length = 0;
        future.length = 0;
        const normalized = cloneSnapshot(snapshot);
        normalized.forecast = normalizeForecastRanges(normalized.forecast);
        set({ ...normalized, isTransactionActive: false, canUndo: false, canRedo: false });
      },
      undo: () => {
        if (transactionBase) {
          const base = transactionBase;
          transactionBase = null;
          if (!sameSnapshot(base, currentSnapshot())) {
            set({ ...base, isTransactionActive: false, canUndo: past.length > 0, canRedo: future.length > 0 });
            return;
          }
          set({ isTransactionActive: false });
        }
        const previous = past.pop();
        if (!previous) return;
        future.push(cloneSnapshot(currentSnapshot()));
        set({ ...previous, canUndo: past.length > 0, canRedo: true });
      },
      redo: () => {
        if (transactionBase) return;
        const next = future.pop();
        if (!next) return;
        past.push(cloneSnapshot(currentSnapshot()));
        set({ ...next, canUndo: true, canRedo: future.length > 0 });
      },
    };
  });
}
