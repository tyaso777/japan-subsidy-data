import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { FinancialTable } from '../../components/FinancialTable';
import { calculateHistoricalPl } from '../../domain/financials';
import { forecastRangeCalibrationStatus } from '../../domain/forecast-range-calibration';
import { balanceSheetRows, historicalPlRows, type HistoricalPlEditableField } from '../../domain/rows';
import { buildTimelineYearLabels, resolveTimeline } from '../../domain/timeline';
import { useModelStore } from '../../store/model-store-context';
import { PeriodEditor } from './PeriodEditor';

export function ActualsPage({ onNext }: { onNext: () => void }) {
  const [rangeStatus, setRangeStatus] = useState('');
  const program = useModelStore((state) => state.program);
  const balanceSheets = useModelStore((state) => state.actuals.balanceSheets);
  const base = useModelStore((state) => state.actuals.basePl);
  const subsidy = useModelStore((state) => state.actuals.subsidyPl);
  const updatePeriodEnd = useModelStore((state) => state.updatePeriodEnd);
  const updateHistoricalBoundary = useModelStore((state) => state.updateHistoricalBoundary);
  const updateBalanceSheet = useModelStore((state) => state.updateBalanceSheet);
  const updateHistoricalPl = useModelStore((state) => state.updateHistoricalPl);
  const optimizeForecastRanges = useModelStore((state) => state.optimizeForecastRangesFromActuals);
  const calibration = useModelStore((state) => state.caseSettings.forecastRangeCalibration);
  const moneyUnit = useModelStore((state) => state.preferences.moneyUnit);
  const beginTransaction = useModelStore((state) => state.beginTransaction);
  const commitTransaction = useModelStore((state) => state.commitTransaction);
  const years = resolveTimeline(program).historicalYears;
  const calculatedBase = useMemo(() => base.map((row, index) => calculateHistoricalPl(row, base[index - 1])), [base]);
  const calculatedSubsidy = useMemo(() => subsidy.map((row, index) => calculateHistoricalPl(row, subsidy[index - 1])), [subsidy]);
  const balanceSheetsWithMetrics = useMemo(() => balanceSheets.map((row, index) => {
    const hasInput = Object.values(row).some((value) => value !== null && value !== undefined);
    const ebitda = (calculatedBase[index]?.ebitda ?? 0) + (calculatedSubsidy[index]?.ebitda ?? 0);
    return { ...row, ebitdaDebtMultiple: hasInput ? (ebitda ? (row.shortTermDebt + row.longTermDebt) / ebitda : 0) : null } as unknown as typeof row;
  }), [balanceSheets, calculatedBase, calculatedSubsidy]);
  const yearLabels = buildTimelineYearLabels(program);
  const emptyActual = (record: object) => Object.values(record).every((value) => value === null || value === undefined);
  const calibrationStatus = forecastRangeCalibrationStatus({ program, actuals: { basePl: base, subsidyPl: subsidy }, caseSettings: { forecastRangeCalibration: calibration } });

  return <main data-testid="actuals-page" className="mx-auto mt-3 grid w-full max-w-[1360px] gap-3">
    <PeriodEditor program={program} onEndYearChange={updatePeriodEnd} onHistoricalBoundaryChange={updateHistoricalBoundary} />
    <section className="border border-line bg-surface px-4.5 py-3.5"><h2 className="m-0 text-lg font-bold">過去実績</h2><p className="mt-0.5 text-[11px] text-muted-foreground">B/Sと2つの事業P/Lを、指定した過去実績期間（{years.length}期）で入力します。</p></section>
    <FinancialTable compact separateSubjectColumns testId="historical-bs" title="全社 B/S（1-1～1-25）" years={years} yearLabels={yearLabels} records={balanceSheetsWithMetrics} rows={balanceSheetRows} moneyUnit={moneyUnit} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateBalanceSheet(index, String(field), value)} />
    <FinancialTable compact separateSubjectColumns testId="historical-pl-base" title="ベース事業 P/L" prefix="M2-" years={years} yearLabels={yearLabels} records={calculatedBase} rows={historicalPlRows} moneyUnit={moneyUnit} isRecordEmpty={(_record, index) => emptyActual(base[index])} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateHistoricalPl('base', index, field as HistoricalPlEditableField, value)} />
    <FinancialTable compact separateSubjectColumns testId="historical-pl-subsidy" title="補助事業 P/L" prefix="7-" years={years} yearLabels={yearLabels} records={calculatedSubsidy} rows={historicalPlRows} moneyUnit={moneyUnit} isRecordEmpty={(_record, index) => emptyActual(subsidy[index])} onEditStart={beginTransaction} onEditEnd={commitTransaction} onChange={(index, field, value) => updateHistoricalPl('subsidy', index, field as HistoricalPlEditableField, value)} />
    <section className="flex items-center justify-between gap-4 border-t-[3px] border-orange bg-surface px-4.5 py-3.5"><div><h3 className="m-0 text-sm font-bold">将来予測の初期範囲</h3><p className="mt-0.5 mb-0 text-[10px] text-muted-foreground">入力した過去実績の変化率と制度ベンチマークから、最小値・最大値と中点の水準を設定します。</p>{rangeStatus && <p role="status" className="mt-1 mb-0 text-[10px] font-bold text-teal">{rangeStatus}</p>}{calibrationStatus === 'current' && <p className="mt-1 mb-0 text-[10px] font-bold text-teal">過去実績に適正化済み</p>}{calibrationStatus === 'stale' && <p role="alert" className="mt-1 mb-0 text-[10px] font-bold text-orange">過去実績を変更したため再適正化が必要です</p>}</div><div className="flex shrink-0 items-center gap-2"><Button variant="outline" onClick={() => { const result = optimizeForecastRanges(); setRangeStatus(`水準範囲を更新しました（${result.updatedPeriods}期間、実績不足による推奨範囲 ${result.fallbackPeriods}期間）`); }}><Sparkles />過去実績から水準範囲を適正化</Button><Button aria-label="次へ：03 将来予測・PL" onClick={onNext}>次へ：03 将来予測・PL<ArrowRight /></Button></div></section>
  </main>;
}
