import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { FinancialTable } from '../../components/FinancialTable';
import { calculatePlSeries } from '../../domain/financials';
import { applyProgramNumericDefinitions } from '../../domain/program-pl-definitions';
import { balanceSheetRows, buildProgramPlRows, historicalPlRows, type HistoricalPlEditableField } from '../../domain/rows';
import { buildTimelineYearLabels, resolveTimeline } from '../../domain/timeline';
import { useModelStore } from '../../store/model-store-context';
import { PeriodEditor } from './PeriodEditor';
import { ActualsImportDialog } from './ActualsImportDialog';

export function ActualsPage({ onNext }: { onNext: () => void }) {
  const program = useModelStore((state) => state.program);
  const balanceSheets = useModelStore((state) => state.actuals.balanceSheets);
  const plInputMode = useModelStore((state) => state.actuals.plInputMode);
  const company = useModelStore((state) => state.actuals.companyPl);
  const base = useModelStore((state) => state.actuals.basePl);
  const subsidy = useModelStore((state) => state.actuals.subsidyPl);
  const updatePeriodEnd = useModelStore((state) => state.updatePeriodEnd);
  const updateHistoricalBoundary = useModelStore((state) => state.updateHistoricalBoundary);
  const updateBalanceSheet = useModelStore((state) => state.updateBalanceSheet);
  const updateHistoricalPl = useModelStore((state) => state.updateHistoricalPl);
  const setHistoricalPlInputMode = useModelStore((state) => state.setHistoricalPlInputMode);
  const moneyUnit = useModelStore((state) => state.preferences.moneyUnit);
  const beginTransaction = useModelStore((state) => state.beginTransaction);
  const commitTransaction = useModelStore((state) => state.commitTransaction);
  const years = resolveTimeline(program).historicalYears;
  const calculatedBase = useMemo(() => applyProgramNumericDefinitions(calculatePlSeries(base), years, program.definitions.commonNumericDefinitions), [base, years, program.definitions.commonNumericDefinitions]);
  const calculatedCompany = useMemo(() => applyProgramNumericDefinitions(calculatePlSeries(company), years, program.definitions.commonNumericDefinitions), [company, years, program.definitions.commonNumericDefinitions]);
  const calculatedSubsidy = useMemo(() => applyProgramNumericDefinitions(calculatePlSeries(subsidy), years, program.definitions.commonNumericDefinitions), [subsidy, years, program.definitions.commonNumericDefinitions]);
  const programPlRows = useMemo(() => buildProgramPlRows(historicalPlRows, program.definitions.commonNumericDefinitions), [program.definitions.commonNumericDefinitions]);
  const balanceSheetsWithMetrics = useMemo(() => balanceSheets.map((row, index) => {
    const hasInput = Object.values(row).some((value) => value !== null && value !== undefined);
    const ebitda = (calculatedBase[index]?.ebitda ?? 0) + (calculatedSubsidy[index]?.ebitda ?? 0);
    return { ...row, ebitdaDebtMultiple: hasInput ? (ebitda ? (row.shortTermDebt + row.longTermDebt) / ebitda : 0) : null } as unknown as typeof row;
  }), [balanceSheets, calculatedBase, calculatedSubsidy]);
  const yearLabels = buildTimelineYearLabels(program);
  const emptyActual = (record: object) => Object.values(record).every((value) => value === null || value === undefined);
  const nonNegativeFields = ['sales', 'cogs', 'cogsDepreciation', 'employeeSalary', 'employeeBonus', 'officerCompensation', 'officerBonus', 'sgaDepreciation', 'researchDevelopment', 'otherSga', 'headcount', 'officerCount'] as const;
  const negativeDerivedBaseCount = plInputMode === 'company' ? base.reduce((count, record) => count + nonNegativeFields.filter((field) => record[field] < 0).length, 0) : 0;

  return <main data-testid="actuals-page" className="mx-auto mt-3 grid w-full max-w-[760px] gap-3">
    <PeriodEditor program={program} onEndYearChange={updatePeriodEnd} onHistoricalBoundaryChange={updateHistoricalBoundary} />
    <section className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4.5 py-3.5"><div><h2 className="m-0 text-lg font-bold">過去実績</h2><p className="mt-0.5 text-[11px] text-muted-foreground">B/Sと2つの事業P/Lを、指定した過去実績期間（{years.length}期）で入力します。</p></div><ActualsImportDialog /></section>
    <FinancialTable compact separateSubjectColumns testId="historical-bs" title="全社 B/S" years={years} yearLabels={yearLabels} records={balanceSheetsWithMetrics} rows={balanceSheetRows} moneyUnit={moneyUnit} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateBalanceSheet(index, String(field), value)} />
    <section className="border border-line bg-surface px-3 py-2">
      <div role="radiogroup" aria-label="過去P/Lの入力方式" className="flex flex-wrap items-center gap-2">
        <strong className="mr-1 text-xs">入力するP/L</strong>
        {([['base', 'ベース事業P/Lを入力'], ['company', '全社P/Lを入力']] as const).map(([mode, label]) => <label key={mode} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-bold has-[:checked]:border-teal has-[:checked]:bg-teal/5">
          <input type="radio" name="historical-pl-input-mode" value={mode} checked={plInputMode === mode} onChange={() => setHistoricalPlInputMode(mode)} />{label}
        </label>)}
        <span className="text-[10px] text-muted-foreground">選択したP/Lと補助事業P/Lを入力すると、未選択側を自動算出します。</span>
      </div>
      {negativeDerivedBaseCount > 0 && <p role="alert" className="mt-2 text-[10px] font-bold text-orange">全社P/L－補助事業P/Lの結果、ベース事業P/Lにマイナス値が{negativeDerivedBaseCount}件あります。入力値をご確認ください。</p>}
    </section>
    {plInputMode === 'base'
      ? <FinancialTable compact separateSubjectColumns testId="historical-pl-base" title="ベース事業 P/L" years={years} yearLabels={yearLabels} records={calculatedBase} rows={programPlRows} moneyUnit={moneyUnit} isRecordEmpty={(_record, index) => emptyActual(base[index])} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateHistoricalPl('base', index, field as HistoricalPlEditableField, value)} />
      : <FinancialTable compact separateSubjectColumns testId="historical-pl-company" title="全社 P/L" years={years} yearLabels={yearLabels} records={calculatedCompany} rows={programPlRows} moneyUnit={moneyUnit} isRecordEmpty={(_record, index) => emptyActual(company[index])} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateHistoricalPl('company', index, field as HistoricalPlEditableField, value)} />}
    <FinancialTable compact separateSubjectColumns testId="historical-pl-subsidy" title="補助事業 P/L" years={years} yearLabels={yearLabels} records={calculatedSubsidy} rows={programPlRows} moneyUnit={moneyUnit} isRecordEmpty={(_record, index) => emptyActual(subsidy[index])} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateHistoricalPl('subsidy', index, field as HistoricalPlEditableField, value)} />
    {plInputMode === 'base'
      ? <FinancialTable compact separateSubjectColumns testId="historical-pl-company" title="全社 P/L（自動算出）" years={years} yearLabels={yearLabels} records={calculatedCompany} rows={programPlRows} moneyUnit={moneyUnit} isRecordEmpty={(_record, index) => emptyActual(company[index])} />
      : <FinancialTable compact separateSubjectColumns testId="historical-pl-base" title="ベース事業 P/L（自動算出）" years={years} yearLabels={yearLabels} records={calculatedBase} rows={programPlRows} moneyUnit={moneyUnit} isRecordEmpty={(_record, index) => emptyActual(base[index])} />}
    <section className="flex items-center justify-between gap-4 border-t-[3px] border-orange bg-surface px-4.5 py-3.5"><div><h3 className="m-0 text-sm font-bold">次のステップ</h3><p className="mt-0.5 mb-0 text-[10px] text-muted-foreground">水準範囲の適正化は、次の02画面の水準設定欄で実行できます。</p></div><Button className="shrink-0" aria-label="次へ：03 将来予測・PL" onClick={onNext}>次へ：02 将来予測・PL<ArrowRight /></Button></section>
  </main>;
}
