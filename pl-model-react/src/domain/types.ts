export type PeriodDefinition = {
  id: string;
  label: string;
  modelPhase: 'toBase' | 'postBase';
};

export type TimelinePeriod = {
  definitionId: string;
  startYear: number;
  endYear: number;
};

export type SpecialYearDefinition = {
  id: string;
  label: string;
  anchor: {
    type: 'historicalEnd' | 'periodStart' | 'periodEnd';
    periodId?: string;
  };
  offset: number;
};

export type CommonNumericDefinition = {
  id: string;
  label: string;
  formula: string;
  outputPoint: string;
  plDisplay?: {
    enabled: boolean;
    code: string;
    /** P/L本表の科目番号に対応する表示順。小さいほど上へ表示する。 */
    order: number;
    valueKind: ValueKind;
    indent?: 0 | 1 | 2;
  };
};

export type MetricTimeAnchor =
  | { type: 'historicalEnd' }
  | { type: 'specialYear'; specialYearId: string }
  | { type: 'periodStart' | 'periodEnd'; periodId: string };

export type MetricTimePoint = { id: string; anchor: MetricTimeAnchor; offset: number };
export type MetricTargetPolicy = 'reference' | 'minimum' | 'maximum';

export type ManagementMetricDefinition = {
  id: string;
  label: string;
  enabled: boolean;
  scope: 'company' | 'base' | 'subsidy';
  timePoints: MetricTimePoint[];
  formula: string;
  outputUnit: string;
  target: number;
  targetPolicy?: MetricTargetPolicy;
  direction: 'min' | 'max';
  optimization: 'adjustable' | 'fixed';
  requiresActualInput?: boolean;
  calculationUnavailable?: boolean;
};

export type ProgramConfiguration = {
  schemaVersion: string;
  program: { id: string; name: string; version: string };
  definitions: {
    historical: { id: 'historical'; label: string; fixed: true };
    periods: PeriodDefinition[];
    specialYears: SpecialYearDefinition[];
    commonNumericDefinitions: CommonNumericDefinition[];
    managementMetrics: ManagementMetricDefinition[];
  };
  timeline: {
    historical: { startYear: number; endYear: number };
    periods: TimelinePeriod[];
  };
};

export type HistoricalPlInput = {
  sales: number;
  cogs: number;
  cogsDepreciation: number;
  employeeSalary: number;
  employeeBonus: number;
  officerCompensation: number;
  officerBonus: number;
  sgaDepreciation: number;
  researchDevelopment: number;
  otherSga: number;
  nonOperating: number;
  extraordinary: number;
  netIncome: number;
  headcount: number;
  officerCount: number;
};

export type HistoricalPlCalculated = HistoricalPlInput & {
  employeePay: number;
  officerPay: number;
  grossProfit: number;
  grossProfitMargin: number;
  sga: number;
  operatingProfit: number;
  operatingProfitMargin: number;
  ordinaryIncome: number;
  preTaxIncome: number;
  depreciation: number;
  valueAdded: number;
  salesGrowthRate: number | null;
  headcountGrowthRate: number | null;
  employeePayPerPersonGrowthRate: number | null;
  officerPayPerPersonGrowthRate: number | null;
  employeePayGrowthRate: number | null;
  valueAddedGrowthRate: number | null;
  cogsRate: number;
  otherSgaRate: number;
  employeePayPerPerson: number;
  officerPayPerPerson: number;
  laborProductivity: number;
  ebitda: number;
  ebitdaMargin: number;
  /** 制度定義から年度ごとに算出した補足指標。キーは共通数値定義ID。 */
  programValues?: Record<string, number | null>;
};

export type BalanceSheetRecord = Record<string, number>;
import type { ValueKind } from './value-units';
