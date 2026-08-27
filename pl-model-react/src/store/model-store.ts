import { createStore, type StoreApi } from 'zustand/vanilla';
import { createDefaultProgram, normalizeProgram, setPeriodEndYear } from '../domain/timeline';
import { balanceSheets, baseHistoricalPl, subsidyHistoricalPl } from '../domain/sample-data';
import {
  applyFinalYearSalesAllocation,
  clearFinalYearSalesAllocation,
  mergeForecastSegment,
  splitForecastSegment,
  synchronizeForecastTimeline,
  type ForecastModel,
  type ForecastPeriod,
} from '../domain/forecast-engine';
import type { BalanceSheetRecord, HistoricalPlInput, ProgramConfiguration } from '../domain/types';
import type { MoneyDisplayUnit } from '../domain/value-units';
import { calculatePl } from '../domain/financials';
import { defaultForecastRange, normalizeForecastRanges } from '../domain/forecast-range';
import { optimizeForecastRangesFromActuals, type HistoricalRangeOptimizationOptions, type HistoricalRangeOptimizationResult } from '../domain/historical-range-optimization';
import { forecastRangeCalibrationFingerprint, type ForecastRangeCalibration } from '../domain/forecast-range-calibration';
import type { ActualsImportResult } from '../domain/actuals-import';

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
  caseSettings: { metricTargets: Record<string, number>; forecastRangeCalibration?: ForecastRangeCalibration; subsidyNewBusiness?: boolean };
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
  updateMetricTarget: (metricId: string, value: number | null) => void;
  importHistoricalActuals: (imported: ActualsImportResult) => void;
  optimizeForecastRangesFromActuals: (options?: HistoricalRangeOptimizationOptions) => HistoricalRangeOptimizationResult;
  updateForecastPeriod: (seriesId: string, periodId: string, patch: Partial<Pick<ForecastPeriod, 'annualGrowthRate' | 'startValue' | 'startAdjustment' | 'range'>>) => void;
  updateFinalYearSalesAllocation: (baseSharePercent: number) => void;
  clearFinalYearSalesAllocation: () => void;
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
export type InitialActualsMode = 'empty' | 'sample' | 'sample-no-subsidy-history';

function cloneSnapshot(snapshot: ModelSnapshot): ModelSnapshot {
  return structuredClone(snapshot);
}

function sameSnapshot(left: ModelSnapshot, right: ModelSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function defaultForecast(program: ProgramConfiguration, basePl: HistoricalPlInput[], subsidyPl: HistoricalPlInput[]): ForecastModel {
  const baseYear = program.timeline.historical.endYear;
  const periods = (change: number, projectionMode: 'compound' | 'linear'): ForecastPeriod[] => program.timeline.periods.map((period) => ({
    id: period.definitionId, startYear: period.startYear, endYear: period.endYear, annualGrowthRate: change, startValue: null, startAdjustment: 0, range: defaultForecastRange(projectionMode),
  }));
  const forScope = (scope: BusinessScope, latest: HistoricalPlInput, growth: { sales: number; headcount: number; pay: number }) => {
    const calculated = calculatePl(latest);
    const compound = (id: string, label: string, valueKind: import('../domain/value-units').ValueKind, baseValue: number, rate: number) => ({ id: `${scope}-${id}`, label, scope, valueKind, projectionMode: 'compound' as const, baseYear, baseValue, periods: periods(rate, 'compound') });
    const linear = (id: string, label: string, baseValue: number, change = 0, changePolicy: 'adjustable' | 'fixed' = 'adjustable', initiallyLocked = false) => ({ id: `${scope}-${id}`, label, scope, valueKind: 'percent' as const, projectionMode: 'linear' as const, changePolicy, baseYear, baseValue, periods: periods(change, 'linear').map((period) => changePolicy === 'fixed' || initiallyLocked ? { ...period, annualGrowthRate: 0, range: { min: 0, max: 0 } } : period) });
    return [
      compound('sales', '売上高', 'money', latest.sales, growth.sales),
      compound('headcount', '従業員数（就業時間換算）', 'fte', latest.headcount, growth.headcount),
      compound('payPerPerson', '従業員1人当たり給与支給総額', 'moneyPerPerson', calculated.employeePayPerPerson, growth.pay),
      linear('cogsRate', '原価率', latest.sales ? latest.cogs / latest.sales * 100 : 0, 0, 'adjustable', true),
      linear('cogsDepRate', '原価内減価償却費率', latest.sales ? latest.cogsDepreciation / latest.sales * 100 : 0, 0, 'adjustable', true),
      linear('sgaDepRate', '販管費内減価償却費率', latest.sales ? latest.sgaDepreciation / latest.sales * 100 : 0, 0, 'adjustable', true),
      linear('researchDevelopmentRate', '研究開発費の売上高比率', latest.sales ? latest.researchDevelopment / latest.sales * 100 : 0, 0, 'adjustable', true),
      linear('otherSgaRate', 'その他販管費率', latest.sales ? latest.otherSga / latest.sales * 100 : 0, 0, 'adjustable', true),
      compound('officerPayPerPerson', '役員1人当たり給与支給総額', 'moneyPerPerson', calculated.officerPayPerPerson, 2),
      linear('employeeSalaryShare', '従業員給与のうち給与割合', calculated.employeePay ? latest.employeeSalary / calculated.employeePay * 100 : 95, 0, 'adjustable', true),
      linear('officerCompensationShare', '役員給与のうち報酬割合', calculated.officerPay ? latest.officerCompensation / calculated.officerPay * 100 : 90, 0, 'adjustable', true),
      linear('nonOperatingRate', '営業外損益の売上高比率', latest.sales ? latest.nonOperating / latest.sales * 100 : 0, 0, 'adjustable', true),
      linear('extraordinaryRate', '特別損益の売上高比率', latest.sales ? latest.extraordinary / latest.sales * 100 : 0, 0, 'adjustable', true),
      linear('taxRate', '実効税率', calculated.preTaxIncome > 0 ? Math.max(0, Math.min(100, (1 - latest.netIncome / calculated.preTaxIncome) * 100)) : 30, 0, 'adjustable', true),
      compound('officerCount', '役員数', 'count', latest.officerCount, 0),
    ];
  };
  return { segments: program.timeline.periods.map((period) => ({ id: period.definitionId, definitionId: period.definitionId, startYear: period.startYear, endYear: period.endYear })), series: [
    ...forScope('base', basePl.at(-1)!, { sales: 8, headcount: 3, pay: 4 }),
    ...forScope('subsidy', subsidyPl.at(-1)!, { sales: 12, headcount: 5, pay: 5 }),
  ] };
}

function emptyRecordLike<T extends object>(record: T): T {
  return Object.fromEntries(Object.keys(record).map((field) => [field, null])) as T;
}

function zeroRecordLike<T extends object>(record: T): T {
  return Object.fromEntries(Object.keys(record).map((field) => [field, 0])) as T;
}

type HistoricalBoundary = { startYear: number; endYear: number };

function resizeHistoricalRecords<T extends object>(records: T[], previous: HistoricalBoundary, next: HistoricalBoundary): T[] {
  const recordsByYear = new Map(records.map((record, index) => [previous.startYear + index, record]));
  const emptyTemplate = emptyRecordLike(records[0] ?? {} as T);
  return Array.from({ length: next.endYear - next.startYear + 1 }, (_, index) => {
    const year = next.startYear + index;
    return structuredClone(recordsByYear.get(year) ?? emptyTemplate);
  });
}

export function createInitialModelSnapshot(programInput?: unknown, initialActuals: InitialActualsMode = 'sample'): ModelSnapshot {
  const program = normalizeProgram(programInput ?? createDefaultProgram());
  const actuals = initialActuals !== 'empty' ? {
    balanceSheets: structuredClone(balanceSheets),
    basePl: structuredClone(baseHistoricalPl),
    subsidyPl: initialActuals === 'sample-no-subsidy-history'
      ? subsidyHistoricalPl.map(zeroRecordLike)
      : structuredClone(subsidyHistoricalPl),
    metricInputs: {},
  } : {
    balanceSheets: balanceSheets.map(emptyRecordLike),
    basePl: baseHistoricalPl.map(emptyRecordLike),
    subsidyPl: subsidyHistoricalPl.map(emptyRecordLike),
    metricInputs: {},
  };
  return { program, actuals, forecast: defaultForecast(program, actuals.basePl, actuals.subsidyPl), caseSettings: { metricTargets: {} } };
}

export function createModelStore(program?: unknown, options?: { initialActuals?: InitialActualsMode }): StoreApi<ModelStore> {
  const past: ModelSnapshot[] = [];
  const future: ModelSnapshot[] = [];
  let transactionBase: ModelSnapshot | null = null;
  return createStore<ModelStore>((set, get) => {
    const currentSnapshot = (): ModelSnapshot => ({ program: get().program, actuals: get().actuals, forecast: get().forecast, caseSettings: get().caseSettings });
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
      ...createInitialModelSnapshot(program, options?.initialActuals),
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
        const requestedYear = Math.trunc(year);
        const nextHistorical = boundary === 'startYear'
          ? { startYear: Math.min(requestedYear, historical.endYear), endYear: historical.endYear }
          : { startYear: historical.startYear, endYear: Math.max(requestedYear, historical.startYear) };
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
        return {
          ...snapshot,
          program,
          actuals: {
            ...snapshot.actuals,
            balanceSheets: resizeHistoricalRecords(snapshot.actuals.balanceSheets, historical, nextHistorical),
            basePl: resizeHistoricalRecords(snapshot.actuals.basePl, historical, nextHistorical),
            subsidyPl: resizeHistoricalRecords(snapshot.actuals.subsidyPl, historical, nextHistorical),
          },
          forecast,
        };
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
      optimizeForecastRangesFromActuals: (options) => {
        const snapshot = currentSnapshot();
        const result = optimizeForecastRangesFromActuals(snapshot.forecast, snapshot.program, snapshot.actuals.basePl, snapshot.actuals.subsidyPl, options);
        applyMutation((current) => ({
          ...current,
          forecast: result.forecast,
          caseSettings: {
            ...current.caseSettings,
            forecastRangeCalibration: { sourceFingerprint: forecastRangeCalibrationFingerprint(snapshot) },
            subsidyNewBusiness: Boolean(options?.subsidyAsNewBusiness),
          },
        }));
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
      updateMetricTarget: (metricId, value) => applyMutation((snapshot) => {
        const metricTargets = { ...snapshot.caseSettings.metricTargets };
        if (value === null || !Number.isFinite(value)) delete metricTargets[metricId];
        else metricTargets[metricId] = value;
        return { ...snapshot, caseSettings: { ...snapshot.caseSettings, metricTargets } };
      }),
      importHistoricalActuals: (imported) => applyMutation((snapshot) => {
        const historical = snapshot.program.timeline.historical;
        const targetYears = Array.from({ length: historical.endYear - historical.startYear + 1 }, (_, index) => historical.startYear + index);
        const selectYears = <T extends object>(records: T[]) => {
          const byYear = new Map(imported.years.map((year, index) => [year, records[index]]));
          const emptyTemplate = emptyRecordLike(records[0]);
          return targetYears.map((year) => structuredClone(byYear.get(year) ?? emptyTemplate));
        };
        const actuals = {
          balanceSheets: selectYears(imported.actuals.balanceSheets),
          basePl: selectYears(imported.actuals.basePl),
          subsidyPl: selectYears(imported.actuals.subsidyPl),
          metricInputs: snapshot.actuals.metricInputs,
        };
        const { forecastRangeCalibration: _calibration, ...caseSettings } = snapshot.caseSettings;
        return { ...snapshot, actuals, forecast: defaultForecast(snapshot.program, actuals.basePl, actuals.subsidyPl), caseSettings };
      }),
      updateFinalYearSalesAllocation: (baseSharePercent) => applyMutation((snapshot) => {
        const finalYear = Math.max(...(snapshot.forecast.segments ?? snapshot.program.timeline.periods).map((period) => period.endYear));
        return {
          ...snapshot,
          forecast: applyFinalYearSalesAllocation(snapshot.forecast, { finalYear, baseSharePercent }),
        };
      }),
      clearFinalYearSalesAllocation: () => applyMutation((snapshot) => ({
        ...snapshot,
        forecast: clearFinalYearSalesAllocation(snapshot.forecast),
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
        normalized.program = normalizeProgram(normalized.program);
        normalized.forecast = normalizeForecastRanges(synchronizeForecastTimeline(normalized.forecast, normalized.program.timeline.periods));
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
