import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { FinancialRow } from '../domain/rows';
import { financialInputFractionDigits, financialInputStep, formatFinancialValue, fromDisplayFinancialValue, moneyUnitLabel, toDisplayFinancialValue, type MoneyDisplayUnit } from '../domain/value-units';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { TimelineYearLabel } from '../domain/timeline';

type Props<T extends object> = {
  testId: string;
  title: string;
  prefix?: string;
  years: number[];
  records: T[];
  rows: FinancialRow<T>[];
  onChange?: (yearIndex: number, field: keyof T, value: number) => void;
  moneyUnit: MoneyDisplayUnit;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  editableFromIndex?: number;
  onValueChange?: (yearIndex: number, row: FinancialRow<T>, value: number) => void;
  yearLabels?: Record<number, TimelineYearLabel>;
  onRowSelect?: (row: FinancialRow<T>) => void;
};

function closingLabel(index: number, count: number) {
  const ago = count - index - 1;
  if (ago === 0) return '最新決算期';
  if (ago === 1) return '前期決算期';
  if (ago === 2) return '前々期決算期';
  return `${ago}期前決算期`;
}

function YearHeading({ year, index, count, role }: { year: number; index: number; count: number; role?: TimelineYearLabel }) {
  return <div className="min-w-0 px-1 py-1 text-right text-muted-foreground"><span className="block">{role?.primary ?? closingLabel(index, count)}</span>{role?.secondary && <small className="block text-[8px] text-teal">{role.secondary}</small>}<small className="mt-0.5 block text-[9px]">{year}年</small></div>;
}

function EditableValueCell({ label, value, step, maximumFractionDigits, onEditStart, onEditEnd, onCommit }: { label: string; value: number; step: number; maximumFractionDigits: number; onEditStart?: () => void; onEditEnd?: () => void; onCommit: (value: number) => void }) {
  const normalized = Number(value.toFixed(maximumFractionDigits));
  const [draft, setDraft] = useState(String(normalized));
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(normalized)); }, [editing, normalized]);
  return <Input className="ml-auto h-6 w-[min(120px,100%)] rounded px-0.5 py-0 text-right text-[10px]" aria-label={label} type="number" step={step} value={draft} onFocus={() => { setEditing(true); setDirty(false); onEditStart?.(); }} onChange={(event) => { setDirty(true); setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={() => { const next = Number(draft); setEditing(false); if (dirty && Number.isFinite(next)) onCommit(next); setDirty(false); onEditEnd?.(); }} />;
}

export function FinancialTable<T extends object>({ testId, title, prefix = '', years, records, rows, onChange, moneyUnit, onEditStart, onEditEnd, editableFromIndex, onValueChange, yearLabels, onRowSelect }: Props<T>) {
  const [omitCalculated, setOmitCalculated] = useState(false);
  const visibleRows = useMemo(() => rows.filter((row) => !(omitCalculated && row.calculated)), [omitCalculated, rows]);
  return <section className="relative isolate border border-line bg-surface" data-testid={testId}>
    <div data-testid={`${testId}-sticky-header`} className="sticky top-12 z-40 bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-3.5 border-t-[3px] border-navy px-3.5 pt-2.5 pb-2">
        <div><h3 className="m-0 text-[15px] font-bold">{title}</h3><p className="mt-0.5 text-[9px] text-muted-foreground">入力項目と自動計算項目・金額表示：{moneyUnitLabel(moneyUnit)}</p></div>
        <Button variant="subtle" size="xs" onClick={() => setOmitCalculated((value) => !value)}>
          {omitCalculated ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {omitCalculated ? '自動計算項目を表示' : '自動計算項目を省略'}
        </Button>
      </header>
      <div className="grid min-h-8 items-center border-t border-line bg-[#f3f1eb] text-[10px]" style={{ gridTemplateColumns: `26% repeat(${years.length}, minmax(0, 1fr))` }}><strong className="px-2 py-1 text-left text-muted-foreground">科目</strong>{years.map((year, index) => <YearHeading key={year} year={year} index={index} count={years.length} role={yearLabels?.[year]} />)}</div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-[10px]">
        <colgroup><col data-testid={`${testId}-subject-column`} style={{ width: '26%' }} /><col span={years.length} /></colgroup>
        <thead className="sr-only"><tr><th scope="col" aria-label="科目" />{years.map((year, index) => <th scope="col" aria-label={`${yearLabels?.[year]?.primary ?? closingLabel(index, years.length)} ${year}年`} key={year} />)}</tr></thead>
        <tbody>{visibleRows.map((row) => <tr key={row.code} className={cn(row.calculated && 'bg-teal/5')}>
          <th className="h-8 border-t border-line px-2 py-1 text-left font-bold">{onRowSelect ? <button type="button" className="w-full text-left" onClick={() => onRowSelect(row)}><span className="inline-block w-13 text-[9px] font-medium text-muted-foreground">{prefix}{row.code}</span><span className={cn(row.indent === 1 && 'pl-3.5', row.indent === 2 && 'pl-7')}>{row.label}</span></button> : <><span className="inline-block w-13 text-[9px] font-medium text-muted-foreground">{prefix}{row.code}</span><span className={cn(row.indent === 1 && 'pl-3.5', row.indent === 2 && 'pl-7')}>{row.label}</span></>}</th>
          {records.map((record, index) => {
            const kind = row.valueKind ?? 'money';
            const displayedValue = row.calculated ? row.value?.(record, index, records) : row.field ? Number(record[row.field]) : 0;
            if (onValueChange && index >= (editableFromIndex ?? 0)) return <td className="h-8 border-t border-line px-0.5 py-1 text-right tabular-nums" key={years[index]}><EditableValueCell label={`${title} ${years[index]}年 ${row.label}`} step={financialInputStep(kind, moneyUnit)} maximumFractionDigits={financialInputFractionDigits(kind, moneyUnit)} value={toDisplayFinancialValue(Number(displayedValue ?? 0), kind, moneyUnit)} onEditStart={onEditStart} onEditEnd={onEditEnd} onCommit={(value) => onValueChange(index, row, fromDisplayFinancialValue(value, kind, moneyUnit))} /></td>;
            if (row.calculated) {
              return <td className="h-8 border-t border-line px-0.5 py-1 text-right tabular-nums" key={years[index]}><output className="font-extrabold text-[#234d3c]">{displayedValue === null || displayedValue === undefined ? '—' : formatFinancialValue(displayedValue, kind, moneyUnit)}</output></td>;
            }
            const field = row.field;
            return <td className="h-8 border-t border-line px-0.5 py-1 text-right tabular-nums" key={years[index]}>{field && onChange
              ? <Input className="ml-auto h-6 w-[min(120px,100%)] rounded px-0.5 py-0 text-right text-[10px]" aria-label={`${title} ${years[index]}年 ${row.label}`} type="number" step={financialInputStep(kind, moneyUnit)} value={toDisplayFinancialValue(Number(record[field]), kind, moneyUnit)} onFocus={onEditStart} onBlur={onEditEnd} onChange={(event) => onChange(index, field, fromDisplayFinancialValue(Number(event.target.value), kind, moneyUnit))} />
              : formatFinancialValue(field ? Number(record[field]) : 0, kind, moneyUnit)}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
