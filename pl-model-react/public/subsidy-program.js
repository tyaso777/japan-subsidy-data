window.PL_SUBSIDY_PROGRAM = {
  schemaVersion: '3.0',
  program: { id: 'generic-growth-subsidy', name: '成長投資向け標準定義', version: '1.0' },
  definitions: {
    historical: { id: 'historical', label: '過去実績', fixed: true },
    periods: [
      { id: 'subsidy', label: '補助事業期間', modelPhase: 'toBase' },
      { id: 'report', label: '事業化報告期間', modelPhase: 'postBase' }
    ],
    specialYears: [
      { id: 'latest', label: '最新決算期', anchor: { type: 'historicalEnd' }, offset: 0 },
      { id: 'base', label: '基準年', anchor: { type: 'periodEnd', periodId: 'subsidy' }, offset: 0 }
    ],
    commonNumericDefinitions: [
      { id: '人件費', label: '人件費', formula: '[従業員給与総額][t] + [役員人件費][t]', outputPoint: 't' },
      { id: '付加価値額', label: '付加価値額', formula: '[営業利益][t] + [人件費][t] + [減価償却費][t]', outputPoint: 't' },
      { id: '労働生産性', label: '労働生産性', formula: '[付加価値額][t] / ([従業員数（就業時間換算）][t] + [役員数][t])', outputPoint: 't' },
      { id: 'EBITDA', label: 'EBITDA', formula: '[営業利益][t] + [減価償却費][t]', outputPoint: 't' }
    ],
    managementMetrics: [
      { id: 'company-sales-growth', label: '全社売上高成長率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 }], formula: '(([売上高][B] / [売上高][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 30.5, direction: 'min', optimization: 'adjustable' },
      { id: 'company-value-added-growth', label: '全社付加価値増加率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 }], formula: '(([付加価値額][B] / [付加価値額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 34.9, direction: 'min', optimization: 'adjustable' },
      { id: 'company-productivity-growth', label: '労働生産性成長率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 }], formula: '(([労働生産性][B] / [労働生産性][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 23.6, direction: 'min', optimization: 'adjustable' },
      { id: 'latest-ebitda-margin', label: '最新決算期 EBITDAマージン', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '[EBITDA][A] / [売上高][A] * 100', outputUnit: '%', target: 9.5, direction: 'min', optimization: 'fixed' },
      { id: 'latest-sales-investment-ratio', label: '最新決算期 売上高投資比率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '0', outputUnit: '%', target: 54.6, direction: 'min', optimization: 'fixed', requiresActualInput: true },
      { id: 'latest-equity-ratio', label: '最新決算期 自己資本比率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '0', outputUnit: '%', target: 43.8, direction: 'min', optimization: 'fixed', requiresActualInput: true },
      { id: 'latest-roa', label: '最新決算期 ROA', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '0', outputUnit: '%', target: 5.1, direction: 'min', optimization: 'fixed', requiresActualInput: true },
      { id: 'employee-pay-growth', label: '従業員1人当たり給与成長率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 }], formula: '(([従業員1人当たり給与支給総額][B] / [従業員1人当たり給与支給総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 6.5, direction: 'min', optimization: 'adjustable' },
      { id: 'employee-payroll-growth', label: '従業員給与総額成長率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodEnd', periodId: 'report' }, offset: 0 }], formula: '(([従業員給与総額][B] / [従業員給与総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 17.4, direction: 'min', optimization: 'adjustable' }
    ]
  },
  timeline: {
    historical: { startYear: 2023, endYear: 2025 },
    periods: [
      { definitionId: 'subsidy', startYear: 2026, endYear: 2028 },
      { definitionId: 'report', startYear: 2029, endYear: 2031 }
    ]
  }
};
