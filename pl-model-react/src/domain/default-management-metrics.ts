import type { ManagementMetricDefinition } from './types';

const historicalEnd = { id: 'A', anchor: { type: 'historicalEnd' as const }, offset: 0 };
const baseToReport = [
  { id: 'A', anchor: { type: 'specialYear' as const, specialYearId: 'base' }, offset: 0 },
  { id: 'B', anchor: { type: 'periodEnd' as const, periodId: 'report' }, offset: 0 },
];
const latestToBase = [
  { id: 'A', anchor: { type: 'historicalEnd' as const }, offset: 0 },
  { id: 'B', anchor: { type: 'specialYear' as const, specialYearId: 'base' }, offset: 0 },
];

const fixedActual = (
  id: string,
  label: string,
  outputUnit: string,
  target: number,
): ManagementMetricDefinition => ({
  id,
  label,
  enabled: true,
  scope: 'company',
  timePoints: [historicalEnd],
  formula: '0',
  outputUnit,
  target,
  targetPolicy: 'reference',
  direction: 'min',
  optimization: 'fixed',
  requiresActualInput: true,
});

export function createDefaultManagementMetrics(): ManagementMetricDefinition[] {
  const metrics: ManagementMetricDefinition[] = [
    { id: 'company-sales-growth', label: '全社売上高成長率', enabled: true, scope: 'company', timePoints: baseToReport, formula: '(([売上高][B] / [売上高][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 30.5, targetPolicy: 'reference', direction: 'min', optimization: 'adjustable' },
    { id: 'company-value-added-growth', label: '全社付加価値増加率', enabled: true, scope: 'company', timePoints: baseToReport, formula: '(([付加価値額][B] / [付加価値額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 35, targetPolicy: 'reference', direction: 'min', optimization: 'adjustable' },
    { id: 'company-productivity-growth', label: '労働生産性成長率', enabled: true, scope: 'company', timePoints: baseToReport, formula: '(([労働生産性][B] / [労働生産性][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 23.7, targetPolicy: 'reference', direction: 'min', optimization: 'adjustable' },
    fixedActual('latest-sales-investment-ratio', '売上高投資比率（最新決算期における比率）', '%', 54.7),
    { id: 'latest-sales', label: '最新決算期の売上高', enabled: true, scope: 'company', timePoints: [historicalEnd], formula: '[売上高][A] / 100000000', outputUnit: '億円', target: 20.5, targetPolicy: 'reference', direction: 'min', optimization: 'fixed' },
    fixedActual('total-subsidy-project-cost', '補助事業全体に要する経費（税抜）', '億円', 11.3),
    { id: 'latest-ebitda-margin', label: 'EBITDAマージン（最新決算期における比率）', enabled: true, scope: 'company', timePoints: [historicalEnd], formula: '[EBITDA][A] / [売上高][A] * 100', outputUnit: '%', target: 9.4, targetPolicy: 'reference', direction: 'min', optimization: 'fixed' },
    { id: 'employee-pay-growth', label: '従業員の1人当たり給与支給総額の増加率', enabled: true, scope: 'company', timePoints: baseToReport, formula: '(([従業員1人当たり給与支給総額][B] / [従業員1人当たり給与支給総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 6.5, targetPolicy: 'reference', direction: 'min', optimization: 'adjustable' },
    { id: 'employee-payroll-growth', label: '給与支給総額の増加率', enabled: true, scope: 'company', timePoints: baseToReport, formula: '(([従業員給与総額][B] / [従業員給与総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 17.4, targetPolicy: 'reference', direction: 'min', optimization: 'adjustable' },
    { id: 'latest-employee-pay-per-person', label: '最新決算期の従業員の1人当たり給与支給総額', enabled: true, scope: 'company', timePoints: [historicalEnd], formula: '[従業員1人当たり給与支給総額][A] / 10000', outputUnit: '万円', target: 436.9, targetPolicy: 'reference', direction: 'min', optimization: 'fixed' },
    { id: 'current-wage-growth', label: '足下の賃上げ', enabled: true, scope: 'company', timePoints: latestToBase, formula: '(([従業員1人当たり給与支給総額][B] / [従業員1人当たり給与支給総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 3, targetPolicy: 'reference', direction: 'min', optimization: 'adjustable' },
    fixedActual('latest-equity-ratio', '最新決算期の自己資本比率', '%', 43.8),
    fixedActual('local-benchmark-score', 'ローカルベンチマークの得点', '点', 22.3),
    fixedActual('latest-roa', '最新決算期のROA', '%', 5.1),
  ];
  return metrics.map((metric) => structuredClone(metric));
}
