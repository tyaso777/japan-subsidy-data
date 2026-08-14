import { useMemo } from 'react';
import { FinancialTable } from '../../components/FinancialTable';
import { calculateHistoricalPl } from '../../domain/financials';
import { balanceSheetRows, historicalPlRows, type HistoricalPlEditableField } from '../../domain/rows';
import { buildTimelineYearLabels, resolveTimeline } from '../../domain/timeline';
import { useModelStore } from '../../store/model-store-context';
import { PeriodEditor } from './PeriodEditor';

export function ActualsPage() {
  const program = useModelStore((state) => state.program);
  const balanceSheets = useModelStore((state) => state.actuals.balanceSheets);
  const base = useModelStore((state) => state.actuals.basePl);
  const subsidy = useModelStore((state) => state.actuals.subsidyPl);
  const updatePeriodEnd = useModelStore((state) => state.updatePeriodEnd);
  const updateHistoricalBoundary = useModelStore((state) => state.updateHistoricalBoundary);
  const updateBalanceSheet = useModelStore((state) => state.updateBalanceSheet);
  const updateHistoricalPl = useModelStore((state) => state.updateHistoricalPl);
  const moneyUnit = useModelStore((state) => state.preferences.moneyUnit);
  const beginTransaction = useModelStore((state) => state.beginTransaction);
  const commitTransaction = useModelStore((state) => state.commitTransaction);
  const years = resolveTimeline(program).historicalYears;
  const calculatedBase = useMemo(() => base.map((row, index) => calculateHistoricalPl(row, base[index - 1])), [base]);
  const calculatedSubsidy = useMemo(() => subsidy.map((row, index) => calculateHistoricalPl(row, subsidy[index - 1])), [subsidy]);
  const balanceSheetsWithMetrics = useMemo(() => balanceSheets.map((row, index) => {
    const ebitda = (calculatedBase[index]?.ebitda ?? 0) + (calculatedSubsidy[index]?.ebitda ?? 0);
    return { ...row, ebitdaDebtMultiple: ebitda ? (row.shortTermDebt + row.longTermDebt) / ebitda : 0 };
  }), [balanceSheets, calculatedBase, calculatedSubsidy]);
  const yearLabels = buildTimelineYearLabels(program);

  return <main className="mt-3 grid gap-3">
    <PeriodEditor program={program} onEndYearChange={updatePeriodEnd} onHistoricalBoundaryChange={updateHistoricalBoundary} />
    <section className="border border-line bg-surface px-4.5 py-3.5"><h2 className="m-0 text-lg font-bold">過去実績</h2><p className="mt-0.5 text-[11px] text-muted-foreground">B/Sと2つの事業P/Lを同じ3期表示で入力します。</p></section>
    <FinancialTable testId="historical-bs" title="全社 B/S（1-1～1-25）" years={years} yearLabels={yearLabels} records={balanceSheetsWithMetrics} rows={balanceSheetRows} moneyUnit={moneyUnit} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateBalanceSheet(index, String(field), value)} />
    <FinancialTable testId="historical-pl-base" title="ベース事業 P/L" prefix="M2-" years={years} yearLabels={yearLabels} records={calculatedBase} rows={historicalPlRows} moneyUnit={moneyUnit} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateHistoricalPl('base', index, field as HistoricalPlEditableField, value)} />
    <FinancialTable testId="historical-pl-subsidy" title="補助事業 P/L" prefix="7-" years={years} yearLabels={yearLabels} records={calculatedSubsidy} rows={historicalPlRows} moneyUnit={moneyUnit} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateHistoricalPl('subsidy', index, field as HistoricalPlEditableField, value)} />
  </main>;
}
