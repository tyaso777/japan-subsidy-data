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
      { id: 'base', label: '基準年度', anchor: { type: 'periodStart', periodId: 'report' }, offset: 0 }
    ],
    commonNumericDefinitions: [
      { id: '人件費', label: '人件費', formula: '[従業員給与総額][t]', outputPoint: 't' },
      { id: '付加価値額', label: '付加価値額', formula: '[営業利益][t] + [人件費][t] + [減価償却費][t]', outputPoint: 't', plDisplay: { enabled: true, insertAfter: '23', insertOrder: 1, valueKind: 'money' } },
      { id: '労働生産性', label: '労働生産性', formula: '[付加価値額][t] / [従業員数（就業時間換算）][t]', outputPoint: 't', plDisplay: { enabled: true, insertAfter: '32', insertOrder: 1, valueKind: 'moneyPerPerson' } },
      { id: 'EBITDA', label: 'EBITDA', formula: '[営業利益][t] + [減価償却費][t]', outputPoint: 't', plDisplay: { enabled: true, insertAfter: '32', insertOrder: 2, valueKind: 'money' } }
    ],
    managementMetrics: [
      { id: 'company-sales-growth', label: '全社売上高成長率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodStart', periodId: 'report' }, offset: 3 }], formula: '(([売上高][B] / [売上高][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 30.5, direction: 'min', optimization: 'adjustable' },
      { id: 'company-value-added-growth', label: '全社付加価値増加率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodStart', periodId: 'report' }, offset: 3 }], formula: '(([付加価値額][B] / [付加価値額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 35, direction: 'min', optimization: 'adjustable' },
      { id: 'company-productivity-growth', label: '労働生産性成長率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodStart', periodId: 'report' }, offset: 3 }], formula: '(([労働生産性][B] / [労働生産性][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 23.7, direction: 'min', optimization: 'adjustable' },
      { id: 'latest-sales-investment-ratio', label: '売上高投資比率（最新決算期における比率）', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '[補助事業全体に要する経費（税抜）][A] * 100000000 / [売上高][A] * 100', outputUnit: '%', target: 54.7, direction: 'min', optimization: 'fixed' },
      { id: 'latest-sales', label: '最新決算期の売上高', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '[売上高][A] / 100000000', outputUnit: '億円', target: 20.5, direction: 'min', optimization: 'fixed' },
      { id: 'total-subsidy-project-cost', label: '補助事業全体に要する経費（税抜）', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '0', outputUnit: '億円', target: 11.3, direction: 'min', optimization: 'fixed', requiresActualInput: true },
      { id: 'latest-ebitda-margin', label: 'EBITDAマージン（最新決算期における比率）', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '[EBITDA][A] / [売上高][A] * 100', outputUnit: '%', target: 9.4, direction: 'min', optimization: 'fixed' },
      { id: 'employee-pay-growth', label: '従業員の1人当たり給与支給総額の増加率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodStart', periodId: 'report' }, offset: 3 }], formula: '(([従業員1人当たり給与支給総額][B] / [従業員1人当たり給与支給総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 6.5, direction: 'min', optimization: 'adjustable' },
      { id: 'employee-payroll-growth', label: '給与支給総額の増加率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }, { id: 'B', anchor: { type: 'periodStart', periodId: 'report' }, offset: 3 }], formula: '(([従業員給与総額][B] / [従業員給与総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 17.4, direction: 'min', optimization: 'adjustable' },
      { id: 'latest-employee-pay-per-person', label: '最新決算期の従業員の1人当たり給与支給総額', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '[従業員1人当たり給与支給総額][A] / 10000', outputUnit: '万円', target: 436.9, direction: 'min', optimization: 'fixed' },
      { id: 'current-wage-growth', label: '足下の賃上げ', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }, { id: 'B', anchor: { type: 'specialYear', specialYearId: 'base' }, offset: 0 }], formula: '(([従業員1人当たり給与支給総額][B] / [従業員1人当たり給与支給総額][A]) ^ (1 / YEARS(A, B)) - 1) * 100', outputUnit: '% / 年', target: 3, direction: 'min', optimization: 'adjustable' },
      { id: 'latest-equity-ratio', label: '最新決算期の自己資本比率', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '[株主資本][A] / [資産総額][A] * 100', outputUnit: '%', target: 43.8, direction: 'min', optimization: 'fixed' },
      { id: 'local-benchmark-score', label: 'ローカルベンチマークの得点', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '0', outputUnit: '点', target: 22.3, direction: 'min', optimization: 'fixed', calculationUnavailable: true },
      { id: 'latest-roa', label: '最新決算期のROA', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '[当期純利益][A] / [資産総額][A] * 100', outputUnit: '%', target: 5.1, direction: 'min', optimization: 'fixed' }
    ]
  },
  timeline: {
    historical: { startYear: 2023, endYear: 2025 },
    periods: [
      { definitionId: 'subsidy', startYear: 2026, endYear: 2028 },
      { definitionId: 'report', startYear: 2029, endYear: 2032 }
    ]
  }
};
