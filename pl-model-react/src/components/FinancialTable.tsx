import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { FinancialRow } from '../domain/rows';
import { financialInputFractionDigits, financialInputStep, formatFinancialValue, fromDisplayFinancialValue, moneyUnitLabel, toDisplayFinancialValue, type MoneyDisplayUnit } from '../domain/value-units';
import { cn } from '../lib/utils';
import { parseTabularClipboard, serializeTabularClipboard, type TabularClipboardValue } from '../domain/tabular-clipboard';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { NumberInput } from './ui/number-input';
import { StickySurface, type StickyLayer } from './ui/sticky-surface';
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
  onValuesChange?: (updates: FinancialTableValueUpdate<T>[]) => void;
  yearLabels?: Record<number, TimelineYearLabel>;
  onRowSelect?: (row: FinancialRow<T>) => void;
  isRecordEmpty?: (record: T, index: number) => boolean;
  separateSubjectColumns?: boolean;
  stickyHeaderTop?: string;
  stickyHeaderLayer?: StickyLayer;
  compact?: boolean;
};

export type FinancialTableValueUpdate<T extends object> = { yearIndex: number; row: FinancialRow<T>; value: number };

type GridCell = { row: number; column: number };
type GridSelection = { anchor: GridCell; focus: GridCell };

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

function EditableValueCell({ label, value, step, maximumFractionDigits, compact = false, onEditStart, onEditEnd, onCommit }: { label: string; value: number; step: number; maximumFractionDigits: number; compact?: boolean; onEditStart?: () => void; onEditEnd?: () => void; onCommit: (value: number) => void }) {
  const normalized = Number(value.toFixed(maximumFractionDigits));
  const [draft, setDraft] = useState(String(normalized));
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(normalized)); }, [editing, normalized]);
  return <Input className={cn('ml-auto select-text rounded px-0.5 py-0 text-right text-[10px]', compact ? 'h-5 w-[min(86px,100%)]' : 'h-6 w-[min(120px,100%)]')} aria-label={label} type="number" step={step} value={draft} onFocus={() => { setEditing(true); setDirty(false); onEditStart?.(); }} onChange={(event) => { setDirty(true); setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={() => { const next = Number(draft); setEditing(false); if (dirty && Number.isFinite(next)) onCommit(next); setDirty(false); onEditEnd?.(); }} />;
}

export function FinancialTable<T extends object>({ testId, title, prefix = '', years, records, rows, onChange, moneyUnit, onEditStart, onEditEnd, editableFromIndex, onValueChange, onValuesChange, yearLabels, onRowSelect, isRecordEmpty, separateSubjectColumns = false, stickyHeaderTop = 'var(--app-toolbar-sticky-bottom)', stickyHeaderLayer = 'operation', compact = false }: Props<T>) {
  const [omitCalculated, setOmitCalculated] = useState(false);
  const [showSupplementary, setShowSupplementary] = useState(true);
  const [selection, setSelection] = useState<GridSelection>();
  const [clipboardStatus, setClipboardStatus] = useState('');
  const dragAnchor = useRef<GridCell | undefined>(undefined);
  const hasSupplementary = useMemo(() => rows.some((row) => row.supplementary), [rows]);
  const yearColumnOffset = separateSubjectColumns ? 2 : 0;
  const visibleRows = useMemo(() => rows.filter((row) => row.supplementary ? showSupplementary : !(omitCalculated && row.calculated)), [omitCalculated, rows, showSupplementary]);
  const bounds = (selected: GridSelection) => ({
    firstRow: Math.min(selected.anchor.row, selected.focus.row),
    lastRow: Math.max(selected.anchor.row, selected.focus.row),
    firstColumn: Math.min(selected.anchor.column, selected.focus.column),
    lastColumn: Math.max(selected.anchor.column, selected.focus.column),
  });
  const cellFromTarget = (target: EventTarget | null): GridCell | undefined => {
    const cell = target instanceof Element ? target.closest<HTMLElement>('[data-grid-cell="true"]') : null;
    if (!cell) return undefined;
    const row = Number(cell.dataset.rowIndex);
    const column = Number(cell.dataset.columnIndex);
    return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : undefined;
  };
  useEffect(() => {
    const finishDragging = () => { dragAnchor.current = undefined; };
    window.addEventListener('mouseup', finishDragging);
    return () => window.removeEventListener('mouseup', finishDragging);
  }, []);
  const selectCell = (cell: GridCell, extend: boolean) => setSelection((current) => extend && current ? { anchor: current.anchor, focus: cell } : { anchor: cell, focus: cell });
  const selectedCell = (row: number, column: number) => {
    if (!selection) return false;
    const range = bounds(selection);
    return row >= range.firstRow && row <= range.lastRow && column >= range.firstColumn && column <= range.lastColumn;
  };
  const displayedCellValue = (rowIndex: number, column: number): TabularClipboardValue => {
    const row = visibleRows[rowIndex];
    if (!row) return null;
    if (separateSubjectColumns && column === 0) return `${prefix}${row.code}`;
    if (separateSubjectColumns && column === 1) return row.label;
    const yearIndex = column - yearColumnOffset;
    const record = records[yearIndex];
    if (!record) return null;
    const hasInput = !(isRecordEmpty?.(record, yearIndex) ?? Object.values(record).every((value) => value === null || value === undefined));
    const value = row.calculated ? (hasInput ? row.value?.(record, yearIndex, records) : null) : row.field ? record[row.field] : null;
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    return toDisplayFinancialValue(Number(value), row.valueKind ?? 'money', moneyUnit);
  };
  const editable = (row: FinancialRow<T>, column: number) => Boolean(
    (!row.supplementary && onValueChange && column >= (editableFromIndex ?? 0))
    || (onChange && row.field && !row.calculated),
  );
  const handleCopy = (event: ClipboardEvent<HTMLElement>) => {
    const active = selection ?? (() => { const cell = cellFromTarget(event.target); return cell ? { anchor: cell, focus: cell } : undefined; })();
    if (!active) return;
    const range = bounds(active);
    const values = Array.from({ length: range.lastRow - range.firstRow + 1 }, (_, rowOffset) =>
      Array.from({ length: range.lastColumn - range.firstColumn + 1 }, (_, columnOffset) => displayedCellValue(range.firstRow + rowOffset, range.firstColumn + columnOffset)),
    );
    event.preventDefault();
    event.clipboardData.setData('text/plain', serializeTabularClipboard(values));
    setClipboardStatus(`${values.length}行×${values[0]?.length ?? 0}列をコピーしました`);
  };
  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const start = cellFromTarget(event.target) ?? selection?.focus;
    if (!start) return;
    const matrix = parseTabularClipboard(event.clipboardData.getData('text/plain'));
    event.preventDefault();
    if (event.target instanceof HTMLInputElement) event.target.blur();
    const updates: FinancialTableValueUpdate<T>[] = [];
    let ignored = 0;
    matrix.forEach((sourceRow, rowOffset) => sourceRow.forEach((value, columnOffset) => {
      if (value === null) return;
      const row = visibleRows[start.row + rowOffset];
      const yearIndex = start.column + columnOffset - yearColumnOffset;
      if (!row || yearIndex < 0 || yearIndex >= years.length || !editable(row, yearIndex)) { ignored += 1; return; }
      updates.push({ yearIndex, row, value: fromDisplayFinancialValue(value, row.valueKind ?? 'money', moneyUnit) });
    }));
    if (updates.length > 0) {
      onEditStart?.();
      try {
        if (onValuesChange) onValuesChange(updates);
        else updates.forEach(({ yearIndex, row, value }) => {
          if (onValueChange && yearIndex >= (editableFromIndex ?? 0)) onValueChange(yearIndex, row, value);
          else if (onChange && row.field && !row.calculated) onChange(yearIndex, row.field, value);
        });
      } finally {
        onEditEnd?.();
      }
    }
    const boundedFocus = { row: Math.min(visibleRows.length - 1, start.row + Math.max(0, matrix.length - 1)), column: Math.min(years.length + yearColumnOffset - 1, start.column + Math.max(0, Math.max(...matrix.map((row) => row.length)) - 1)) };
    setSelection({ anchor: start, focus: boundedFocus });
    setClipboardStatus(`${updates.length}件を貼り付けました${ignored ? `（${ignored}件は入力対象外）` : ''}`);
  };
  const cellInteraction = (row: number, column: number) => ({
    tabIndex: -1,
    'data-grid-cell': 'true',
    'data-row-index': row,
    'data-column-index': column,
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      window.getSelection()?.removeAllRanges();
      const cell = { row, column };
      const anchor = event.shiftKey && selection ? selection.anchor : cell;
      dragAnchor.current = anchor;
      setSelection({ anchor, focus: cell });
      if (!(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
      }
    },
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      if (!dragAnchor.current || (event.buttons & 1) !== 1) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      setSelection({ anchor: dragAnchor.current, focus: { row, column } });
    },
    onClick: (event: MouseEvent<HTMLElement>) => selectCell({ row, column }, event.shiftKey),
  });
  const subjectNumberWidth = compact ? '9%' : '8%';
  const subjectNameWidth = compact ? '32%' : '22%';
  const subjectWidth = compact ? '38%' : '26%';
  const hasEndGutter = compact && separateSubjectColumns;
  const endGutterWidth = 12;
  const columnTemplate = `${separateSubjectColumns ? `${subjectNumberWidth} ${subjectNameWidth}` : subjectWidth} repeat(${years.length}, minmax(0, 1fr))${hasEndGutter ? ` ${endGutterWidth}px` : ''}`;
  const cellClass = compact ? 'h-7 py-0.5' : 'h-8 py-1';
  const compactMaxWidth = Math.min(1360, 310 + years.length * 90 + (hasEndGutter ? endGutterWidth : 0));
  return <section className={cn('relative isolate border border-line bg-surface', compact && 'mx-auto w-full')} style={compact ? { maxWidth: `${compactMaxWidth}px` } : undefined} data-density={compact ? 'compact' : 'default'} data-testid={testId} onCopy={handleCopy} onPaste={handlePaste}>
    <StickySurface data-testid={`${testId}-sticky-header`} stickyTop={stickyHeaderTop} layer={stickyHeaderLayer} className="shadow-sm">
      <header className={cn('flex items-center justify-between gap-3.5 border-t-[3px] border-navy', compact ? 'px-3 py-1.5' : 'px-3.5 pt-2.5 pb-2')}>
        <div><h3 className="m-0 text-[15px] font-bold">{title}</h3><p className="mt-0.5 text-[9px] text-muted-foreground">入力項目と自動計算項目・金額表示：{moneyUnitLabel(moneyUnit)}・ドラッグで範囲選択、Ctrl+C/VでExcel連携</p></div>
        <div className="flex items-center gap-2">{clipboardStatus && <span role="status" className="text-[9px] font-bold text-teal">{clipboardStatus}</span>}{hasSupplementary && <Button variant="subtle" size="xs" onClick={() => setShowSupplementary((value) => !value)}>{showSupplementary ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{showSupplementary ? '補足指標を隠す' : '補足指標を表示'}</Button>}<Button variant="subtle" size="xs" onClick={() => setOmitCalculated((value) => !value)}>
          {omitCalculated ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {omitCalculated ? '自動計算項目を表示' : '自動計算項目を省略'}
        </Button></div>
      </header>
      <div className={cn('grid items-center border-t border-line bg-[#f3f1eb] text-[10px]', compact ? 'min-h-7' : 'min-h-8')} style={{ gridTemplateColumns: columnTemplate }}>{separateSubjectColumns ? <><strong className="px-2 py-1 text-left text-muted-foreground">科目番号</strong><strong className="px-2 py-1 text-left text-muted-foreground">科目名</strong></> : <strong className="px-2 py-1 text-left text-muted-foreground">科目</strong>}{years.map((year, index) => <YearHeading key={year} year={year} index={index} count={years.length} role={yearLabels?.[year]} />)}{hasEndGutter && <span aria-hidden="true" />}</div>
    </StickySurface>
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-[10px] select-none">
        <colgroup>{separateSubjectColumns ? <><col style={{ width: subjectNumberWidth }} /><col data-testid={`${testId}-subject-column`} style={{ width: subjectNameWidth }} /></> : <col data-testid={`${testId}-subject-column`} style={{ width: subjectWidth }} />}<col span={years.length} />{hasEndGutter && <col className="w-3" data-testid={`${testId}-end-gutter`} />}</colgroup>
        <thead className="sr-only"><tr>{separateSubjectColumns ? <><th scope="col">科目番号</th><th scope="col">科目名</th></> : <th scope="col" aria-label="科目" />}{years.map((year, index) => <th scope="col" aria-label={`${yearLabels?.[year]?.primary ?? closingLabel(index, years.length)} ${year}年`} key={year} />)}{hasEndGutter && <th aria-hidden="true" />}</tr></thead>
        <tbody>{visibleRows.map((row, rowIndex) => <tr key={row.code} className={cn(row.calculated && 'bg-teal/5', row.supplementary && 'bg-orange/5')}>
          {separateSubjectColumns ? <><td {...cellInteraction(rowIndex, 0)} className={cn(cellClass, 'border-t border-line px-2 text-left text-[9px] font-medium text-muted-foreground', selectedCell(rowIndex, 0) && 'bg-teal/10 ring-1 ring-inset ring-teal')}>{prefix}{row.code}</td><th {...cellInteraction(rowIndex, 1)} scope="row" className={cn(cellClass, 'border-t border-line px-2 text-left font-bold', selectedCell(rowIndex, 1) && 'bg-teal/10 ring-1 ring-inset ring-teal')}>{onRowSelect ? <button type="button" className={cn('w-full text-left', row.indent === 1 && 'pl-3.5', row.indent === 2 && 'pl-7')} onClick={() => onRowSelect(row)}>{row.label}</button> : <span className={cn(row.indent === 1 && 'pl-3.5', row.indent === 2 && 'pl-7')}>{row.label}</span>}</th></> : <th className={cn(cellClass, 'border-t border-line px-2 text-left font-bold')}>{onRowSelect ? <button type="button" className="w-full text-left" onClick={() => onRowSelect(row)}><span className="inline-block w-13 text-[9px] font-medium text-muted-foreground">{prefix}{row.code}</span><span className={cn(row.indent === 1 && 'pl-3.5', row.indent === 2 && 'pl-7')}>{row.label}</span></button> : <><span className="inline-block w-13 text-[9px] font-medium text-muted-foreground">{prefix}{row.code}</span><span className={cn(row.indent === 1 && 'pl-3.5', row.indent === 2 && 'pl-7')}>{row.label}</span></>}</th>}
          {records.map((record, index) => {
            const kind = row.valueKind ?? 'money';
            const hasInput = !(isRecordEmpty?.(record, index) ?? Object.values(record).every((value) => value === null || value === undefined));
            const rawValue = row.field ? record[row.field] : null;
            const displayedValue = row.calculated ? (hasInput ? row.value?.(record, index, records) : null) : rawValue;
            const selectionClass = selectedCell(rowIndex, index + yearColumnOffset) && 'bg-teal/10 ring-1 ring-inset ring-teal';
            if (!row.supplementary && onValueChange && index >= (editableFromIndex ?? 0)) return <td {...cellInteraction(rowIndex, index + yearColumnOffset)} className={cn(cellClass, 'border-t border-line px-0.5 text-right tabular-nums', selectionClass)} key={years[index]}><EditableValueCell compact={compact} label={`${title} ${years[index]}年 ${row.label}`} step={financialInputStep(kind, moneyUnit)} maximumFractionDigits={financialInputFractionDigits(kind, moneyUnit)} value={toDisplayFinancialValue(Number(displayedValue ?? 0), kind, moneyUnit)} onEditStart={onEditStart} onEditEnd={onEditEnd} onCommit={(value) => onValueChange(index, row, fromDisplayFinancialValue(value, kind, moneyUnit))} /></td>;
            if (row.calculated) {
              return <td {...cellInteraction(rowIndex, index + yearColumnOffset)} className={cn(cellClass, 'border-t border-line px-0.5 text-right tabular-nums', selectionClass)} key={years[index]}><output className="font-extrabold text-[#234d3c]">{displayedValue === null || displayedValue === undefined ? '—' : formatFinancialValue(Number(displayedValue), kind, moneyUnit)}</output></td>;
            }
            const field = row.field;
            return <td {...cellInteraction(rowIndex, index + yearColumnOffset)} className={cn(cellClass, 'border-t border-line px-0.5 text-right tabular-nums', selectionClass)} key={years[index]}>{field && onChange
              ? <NumberInput className={cn('ml-auto select-text rounded px-0.5 py-0 text-right text-[10px]', compact ? 'h-5 w-[min(72px,100%)]' : 'h-6 w-[min(120px,100%)]')} aria-label={`${title} ${years[index]}年 ${row.label}`} step={financialInputStep(kind, moneyUnit)} value={rawValue === null || rawValue === undefined ? null : toDisplayFinancialValue(Number(rawValue), kind, moneyUnit)} emptyValue={rawValue === null || rawValue === undefined ? null : 0} onEditingStart={onEditStart} onEditingEnd={onEditEnd} onValueChange={(value) => onChange(index, field, fromDisplayFinancialValue(value, kind, moneyUnit))} />
              : rawValue === null || rawValue === undefined ? '—' : formatFinancialValue(Number(rawValue), kind, moneyUnit)}</td>;
          })}{hasEndGutter && <td aria-hidden="true" className="border-t border-line" />}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
