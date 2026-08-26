import { useEffect, useState } from 'react';
import { Link2, LockKeyhole } from 'lucide-react';
import { Input } from '../../components/ui/input';
import type { ProgramConfiguration } from '../../domain/types';
import { describeSpecialYearAnchor, resolveTimeline } from '../../domain/timeline';

type Props = { program: ProgramConfiguration; onEndYearChange: (index: number, year: number) => void; onHistoricalBoundaryChange: (boundary: 'startYear' | 'endYear', year: number) => void };

function PeriodEndInput({ label, fieldLabel = '終了年', value, onCommit }: { label: string; fieldLabel?: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    if (/^\d{4}$/.test(nextDraft)) onCommit(Number(nextDraft));
  };
  return <Input aria-label={`${label} ${fieldLabel}`} type="number" value={draft} onChange={(event) => updateDraft(event.target.value)} onBlur={() => {
    const next = Number(draft);
    if (next !== value) onCommit(next);
  }} />;
}

const labelClass = 'grid gap-1 text-[9px] font-bold text-muted-foreground';
const rowClass = 'grid grid-cols-[minmax(140px,1fr)_repeat(2,minmax(110px,150px))_110px] items-end gap-3 bg-surface px-4.5 py-2.5';

export function PeriodEditor({ program, onEndYearChange, onHistoricalBoundaryChange }: Props) {
  const specialYears = resolveTimeline(program).specialYears;
  return <section data-testid="period-editor" className="mx-auto w-full max-w-[760px] border border-line bg-surface">
    <div className="px-4.5 py-3.5"><h2 className="m-0 text-lg font-bold">個社の期間</h2><p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Link2 className="size-3" aria-hidden="true" />前期間の終了年＋1を、次期間の開始年へ自動反映します。</p></div>
    <div className="grid gap-px border-t border-line bg-line">
      <div className={`${rowClass} border-l-4 border-l-[#657484]`}><strong className="self-center text-sm">{program.definitions.historical.label}</strong><label className={labelClass}>開始年<PeriodEndInput label={program.definitions.historical.label} fieldLabel="開始年" value={program.timeline.historical.startYear} onCommit={(year) => onHistoricalBoundaryChange('startYear', year)} /></label><label className={labelClass}>終了年<PeriodEndInput label={program.definitions.historical.label} value={program.timeline.historical.endYear} onCommit={(year) => onHistoricalBoundaryChange('endYear', year)} /></label><span className="flex items-center justify-end gap-1 self-center text-right text-[10px] text-muted-foreground"><LockKeyhole className="size-3" aria-hidden="true" />区間定義は削除不可</span></div>
      {program.timeline.periods.map((period, index) => {
        const definition = program.definitions.periods.find((item) => item.id === period.definitionId);
        const label = definition?.label ?? period.definitionId;
        return <div className={rowClass} key={period.definitionId}>
          <strong className="self-center text-sm">{label}</strong>
          <label className={labelClass}>開始年<Input aria-label={`${label} 開始年`} type="number" value={period.startYear} readOnly /></label>
          <label className={labelClass}>終了年<PeriodEndInput label={label} value={period.endYear} onCommit={(year) => onEndYearChange(index, year)} /></label>
          <span className="self-center text-right text-[10px] text-muted-foreground">{period.endYear - period.startYear + 1}年度分</span>
        </div>;
      })}
    </div>
    <div className="border-t border-line px-4.5 py-3"><div className="mb-2"><h3 className="m-0 text-sm font-bold">特別年の呼称</h3><p className="mt-0.5 mb-0 text-[10px] text-muted-foreground">制度定義の基準時点を、この会社の期間へ当てはめた結果です。</p></div><div data-testid="special-year-summary" className="grid grid-cols-2 gap-2">{specialYears.map((special) => <article key={special.id} className="border border-dashed border-line bg-background px-3 py-2"><strong className="block text-xs">{special.label}</strong><span className="mt-1 block text-lg font-bold text-teal">{special.year}年</span><small className="block text-[9px] text-muted-foreground">{describeSpecialYearAnchor(program, special.id)}</small></article>)}</div></div>
  </section>;
}
