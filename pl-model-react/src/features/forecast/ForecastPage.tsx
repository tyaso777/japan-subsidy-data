import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, SlidersHorizontal, Table2 } from 'lucide-react';
import { FinancialTable } from '../../components/FinancialTable';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { buildForecastPl, fitForecastPlCell, type ForecastSeries } from '../../domain/forecast-engine';
import { calculatePlSeries, combinePlInputs } from '../../domain/financials';
import { historicalPlRows } from '../../domain/rows';
import type { HistoricalPlCalculated, HistoricalPlInput } from '../../domain/types';
import { formatFinancialValue, fromDisplayFinancialValue, moneyUnitLabel, roundFinancialInputValue, toDisplayFinancialValue, type MoneyDisplayUnit, type ValueKind } from '../../domain/value-units';
import { cn } from '../../lib/utils';
import { useModelStore } from '../../store/model-store-context';
import { MetricsPanel } from './MetricsPanel';
import { nextChartExtent, type ChartExtent } from '../../domain/chart-scale';
import { buildTimelineYearLabels } from '../../domain/timeline';
import { downstreamCodes, plLogicNodes } from '../../domain/pl-logic';
import { defaultForecastRange } from '../../domain/forecast-range';

type Scope = 'company' | 'base' | 'subsidy';
type ChartLine = { label: string; values: number[]; color: string; field?: keyof HistoricalPlCalculated };

const scopeLabels: Record<Scope, string> = { company: '全社合算', base: 'ベース事業', subsidy: '補助事業' };
const colors = ['#183b56', '#167d78', '#c75b24', '#7c5c8e', '#9a7222'];

const MultiLineChart = memo(function MultiLineChart({ title, subtitle, years, lines, boundaries, kind, unit, editableFromYear, onPointChange }: { title: string; subtitle: string; years: number[]; lines: ChartLine[]; boundaries: number[]; kind: ValueKind; unit: MoneyDisplayUnit; editableFromYear?: number; onPointChange?: (field: keyof HistoricalPlCalculated, year: number, value: number, phase: 'start' | 'change' | 'end') => void }) {
  const [drag, setDrag] = useState<{ lineIndex: number; pointIndex: number }>();
  const width = 360; const height = 150; const margin = { left: 48, right: 8, top: 9, bottom: 24 };
  const scale = useRef<ChartExtent | undefined>(undefined);
  const extent = nextChartExtent(scale.current, lines.flatMap((line) => line.values));
  scale.current = extent;
  const x = (index: number) => margin.left + (width - margin.left - margin.right) * index / Math.max(years.length - 1, 1);
  const y = (value: number) => margin.top + (height - margin.top - margin.bottom) * (extent.max - value) / (extent.max - extent.min || 1);
  const formatAxis = (value: number) => formatFinancialValue(value, kind, unit, 1).replace(` ${moneyUnitLabel(unit)}/人`, '');
  return <article className="border border-line bg-surface p-3">
    <h4 className="m-0 text-sm font-bold">{title}</h4><p className="mt-0.5 mb-1 text-[10px] text-muted-foreground">{subtitle}</p>
    <svg role="img" aria-label={`${title} 推移チャート`} viewBox={`0 0 ${width} ${height}`} className="h-38 w-full" onPointerMove={(event) => { if (!drag || !onPointChange) return; const line = lines[drag.lineIndex]; if (!line.field) return; const rect = event.currentTarget.getBoundingClientRect(); const pointerY = rect.height ? (event.clientY - rect.top) * height / rect.height : event.clientY; const value = extent.max - (pointerY - margin.top) / (height - margin.top - margin.bottom) * (extent.max - extent.min); onPointChange(line.field, years[drag.pointIndex], Math.max(extent.min, Math.min(extent.max, value)), 'change'); }} onPointerUp={(event) => { if (!drag || !onPointChange) return; const line = lines[drag.lineIndex]; if (line.field) onPointChange(line.field, years[drag.pointIndex], line.values[drag.pointIndex], 'end'); setDrag(undefined); event.currentTarget.releasePointerCapture?.(event.pointerId); }}>
      {[0, .5, 1].map((ratio) => { const value = extent.max - (extent.max - extent.min) * ratio; const py = margin.top + (height - margin.top - margin.bottom) * ratio; return <g key={ratio}><line x1={margin.left} x2={width - margin.right} y1={py} y2={py} stroke="#d2dbe2" /><text x={margin.left - 4} y={py + 3} textAnchor="end" fontSize="8" fill="#667085">{formatAxis(value)}</text></g>; })}
      {extent.min < 0 && extent.max > 0 && <line x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} stroke="#93a6b8" strokeWidth="1.5" />}
      {boundaries.map((year) => { const index = years.indexOf(year); return index < 0 ? null : <line data-testid={`forecast-boundary-${year}`} key={year} x1={x(index)} x2={x(index)} y1={margin.top} y2={height - margin.bottom} stroke="#7890a4" strokeWidth="1.25" strokeDasharray="4 3" />; })}
      {lines.map((line, lineIndex) => { const forecastStart = years.findIndex((year) => year >= (editableFromYear ?? Infinity)); const points = (from: number, to: number) => line.values.map((value, index) => ({ value, index })).filter(({ value, index }) => Number.isFinite(value) && index >= from && index <= to).map(({ value, index }) => `${x(index)},${y(value)}`).join(' '); return <g key={line.label}><polyline data-line-phase="actual" points={points(0, forecastStart < 0 ? years.length - 1 : forecastStart - 1)} fill="none" stroke={line.color} strokeWidth="2.2" /><polyline data-line-phase="forecast" points={points(Math.max(0, forecastStart - 1), years.length - 1)} fill="none" stroke={line.color} strokeWidth="2.2" strokeDasharray="5 4" />{line.values.map((value, index) => { if (!Number.isFinite(value)) return null; const editable = Boolean(onPointChange && line.field && years[index] >= (editableFromYear ?? Infinity)); return <circle key={years[index]} cx={x(index)} cy={y(value)} r={editable ? 4 : 2.2} fill={line.color} stroke={editable ? '#fff' : undefined} strokeWidth={editable ? 1.2 : undefined} className={editable ? 'cursor-ns-resize' : undefined} role={editable ? 'slider' : undefined} tabIndex={editable ? 0 : undefined} aria-label={editable ? `${title} ${years[index]}年 ${line.label}` : undefined} aria-valuenow={editable ? value : undefined} onPointerDown={editable ? (event) => { setDrag({ lineIndex, pointIndex: index }); event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId); onPointChange!(line.field!, years[index], value, 'start'); } : undefined} onKeyDown={editable ? (event) => { if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return; event.preventDefault(); const delta = (extent.max - extent.min) / 100 * (event.key === 'ArrowUp' ? 1 : -1); onPointChange!(line.field!, years[index], value, 'start'); onPointChange!(line.field!, years[index], value + delta, 'change'); onPointChange!(line.field!, years[index], value + delta, 'end'); } : undefined} />; })}</g>; })}
      {years.map((year, index) => <text key={year} x={x(index)} y={height - 6} textAnchor="middle" fontSize="8" fill="#667085">'{String(year).slice(-2)}</text>)}
    </svg>
    <div className="flex flex-wrap gap-x-3 gap-y-1">{lines.map((line) => <span key={line.label} className="flex items-center gap-1 text-[9px]"><i className="h-0.5 w-3" style={{ backgroundColor: line.color }} />{line.label}</span>)}</div>
  </article>;
});

function SettingRow({ series, periodId, periodLabel, unit, readOnly = false }: { series: ForecastSeries; periodId: string; periodLabel: string; unit: MoneyDisplayUnit; readOnly?: boolean }) {
  const [showEffects, setShowEffects] = useState(false);
  const period = series.periods.find((candidate) => candidate.id === periodId)!;
  const update = useModelStore((state) => state.updateForecastPeriod);
  const updateLayer = useModelStore((state) => state.updateForecastLayer);
  const begin = useModelStore((state) => state.beginTransaction);
  const commit = useModelStore((state) => state.commitTransaction);
  const linear = series.projectionMode === 'linear';
  const rateKind: ValueKind = linear ? 'point' : 'percent';
  const normalizeRate = (value: number) => roundFinancialInputValue(value, rateKind, unit);
  const annualGrowthRate = roundFinancialInputValue(period.annualGrowthRate, rateKind, unit);
  const adjustment = roundFinancialInputValue(toDisplayFinancialValue(period.startAdjustment, series.valueKind, unit), series.valueKind, unit);
  const range = period.range ?? defaultForecastRange(series.projectionMode);
  const displayRange = {
    min: roundFinancialInputValue(range.min, rateKind, unit),
    max: roundFinancialInputValue(range.max, rateKind, unit),
  };
  const layers = period.layers ?? { fixedAnnualIncrement: 0, steps: {}, spots: {}, acceleration: 0 };
  const fixed = roundFinancialInputValue(toDisplayFinancialValue(layers.fixedAnnualIncrement, series.valueKind, unit), series.valueKind, unit);
  const step = roundFinancialInputValue(toDisplayFinancialValue(layers.steps[period.startYear] ?? 0, series.valueKind, unit), series.valueKind, unit);
  const spot = roundFinancialInputValue(toDisplayFinancialValue(layers.spots[period.startYear] ?? 0, series.valueKind, unit), series.valueKind, unit);
  const acceleration = roundFinancialInputValue(layers.acceleration, rateKind, unit);
  return <fieldset data-testid={`forecast-setting-row-${series.id}-${period.id}`} disabled={readOnly} className="m-0 min-w-0 border-0 border-t border-line px-1.5 py-1.5 first:border-t-0 disabled:opacity-55">
    <div className="mb-0.5 flex min-h-5 items-center justify-between gap-1"><strong className="min-w-0 text-[11px] leading-tight">{series.label}</strong><Button variant="ghost" size="sm" className="h-5 shrink-0 px-1 text-[8px] text-muted-foreground" aria-label={`${periodLabel} ${series.label} 変動設定`} onClick={() => setShowEffects((value) => !value)}>変動設定</Button></div>
    <div className="grid grid-cols-[minmax(0,1fr)_54px] items-end gap-1.5">
      <div className="min-w-0">
        <div className="mb-0.5 flex items-center justify-center gap-0.5"><Input data-position="slider-top" aria-label={`${periodLabel} ${series.label} 年間変化`} type="number" value={annualGrowthRate} step="0.01" className="h-6 w-14 px-1 text-right text-[10px] font-bold text-orange" onFocus={begin} onBlur={commit} onChange={(event) => { const value = normalizeRate(Number(event.target.value)); update(series.id, period.id, { annualGrowthRate: value, range: { min: Math.min(range.min, value), max: Math.max(range.max, value) } }); }} /><small className="whitespace-nowrap text-[8px] text-orange">{linear ? 'pt/年' : '%/年'}</small></div>
        <div data-testid="forecast-level-slider-group" className="grid grid-cols-[38px_minmax(44px,1fr)_38px] items-center gap-1">
          <Input aria-label={`${periodLabel} ${series.label} 最小値`} type="number" value={displayRange.min} step="0.01" className="h-6 px-1 text-right text-[9px]" onChange={(event) => { const min = normalizeRate(Number(event.target.value)); update(series.id, period.id, { range: { min, max: displayRange.max } }); }} />
          <input aria-label={`${periodLabel} ${series.label} 水準`} type="range" min={displayRange.min} max={displayRange.max} step="0.01" value={Math.max(displayRange.min, Math.min(displayRange.max, annualGrowthRate))} disabled={displayRange.min === displayRange.max} onPointerDown={begin} onPointerUp={commit} onChange={(event) => update(series.id, period.id, { annualGrowthRate: normalizeRate(Number(event.target.value)) })} className="w-full accent-[#c75b24]" />
          <Input aria-label={`${periodLabel} ${series.label} 最大値`} type="number" value={displayRange.max} step="0.01" className="h-6 px-1 text-right text-[9px]" onChange={(event) => { const max = normalizeRate(Number(event.target.value)); update(series.id, period.id, { range: { min: displayRange.min, max } }); }} />
        </div>
      </div>
      <div data-testid="forecast-start-adjustment-group" className="border-l border-dashed border-line pl-1.5"><small className="mb-0.5 block whitespace-nowrap text-center text-[7px] text-muted-foreground">開始時増減</small><Input aria-label={`${periodLabel} ${series.label} 開始時増減`} title="開始時増減" type="number" value={adjustment} step="0.01" className="h-6 px-1 text-right text-[9px]" onFocus={begin} onBlur={commit} onChange={(event) => update(series.id, period.id, { startAdjustment: fromDisplayFinancialValue(Number(event.target.value), series.valueKind, unit) })} /></div>
    </div>
    {showEffects && <div className="mt-2 grid grid-cols-2 gap-1 rounded border border-line bg-surface p-1.5"><label className="text-[8px] text-muted-foreground">毎年固定増減<Input aria-label={`${periodLabel} ${series.label} 毎年固定増減`} type="number" value={fixed} className="mt-0.5 h-6 px-1 text-right text-[9px]" onChange={(event) => updateLayer(series.id, period.id, { fixedAnnualIncrement: fromDisplayFinancialValue(Number(event.target.value), series.valueKind, unit) })} /></label><label className="text-[8px] text-muted-foreground">成長加速度<Input aria-label={`${periodLabel} ${series.label} 成長加速度`} type="number" value={acceleration} className="mt-0.5 h-6 px-1 text-right text-[9px]" onChange={(event) => updateLayer(series.id, period.id, { acceleration: Number(event.target.value) })} /></label><label className="text-[8px] text-muted-foreground">単年以降増減<Input aria-label={`${periodLabel} ${series.label} 単年増減`} type="number" value={step} className="mt-0.5 h-6 px-1 text-right text-[9px]" onChange={(event) => updateLayer(series.id, period.id, { steps: { [period.startYear]: fromDisplayFinancialValue(Number(event.target.value), series.valueKind, unit) } })} /></label><label className="text-[8px] text-muted-foreground">当年のみ増減<Input aria-label={`${periodLabel} ${series.label} 当年のみ増減`} type="number" value={spot} className="mt-0.5 h-6 px-1 text-right text-[9px]" onChange={(event) => updateLayer(series.id, period.id, { spots: { [period.startYear]: fromDisplayFinancialValue(Number(event.target.value), series.valueKind, unit) } })} /></label></div>}
  </fieldset>;
}
function buildTimeline(actuals: HistoricalPlInput[], model: ReturnType<typeof useForecastModel>, scope: 'base' | 'subsidy') {
  const future = buildForecastPl(model, scope, actuals.at(-1)!);
  return { years: [...actuals.map((_, index) => model.series[0].baseYear - actuals.length + index + 1), ...future.map((row) => row.year)], records: [...calculatePlSeries(actuals), ...future.map((row) => row.calculated)] };
}
function useForecastModel() { return useModelStore((state) => state.forecast); }

export function ForecastPage() {
  const [scope, setScope] = useState<Scope>('base');
  const [selectedLogicCode, setSelectedLogicCode] = useState('16');
  const model = useForecastModel();
  const program = useModelStore((state) => state.program);
  const baseActuals = useModelStore((state) => state.actuals.basePl);
  const subsidyActuals = useModelStore((state) => state.actuals.subsidyPl);
  const unit = useModelStore((state) => state.preferences.moneyUnit);
  const splitForecastAtYear = useModelStore((state) => state.splitForecastAtYear);
  const mergeForecastPeriod = useModelStore((state) => state.mergeForecastPeriod);
  const replaceForecast = useModelStore((state) => state.replaceForecast);
  const beginTransaction = useModelStore((state) => state.beginTransaction);
  const commitTransaction = useModelStore((state) => state.commitTransaction);
  const base = useMemo(() => buildTimeline(baseActuals, model, 'base'), [baseActuals, model]);
  const subsidy = useMemo(() => buildTimeline(subsidyActuals, model, 'subsidy'), [subsidyActuals, model]);
  const company = useMemo(() => {
    const inputs = base.records.map((row, index) => combinePlInputs(row, subsidy.records[index]));
    return { years: base.years, records: calculatePlSeries(inputs) };
  }, [base, subsidy]);
  const selected = scope === 'base' ? base : scope === 'subsidy' ? subsidy : company;
  const settingsScope = scope === 'subsidy' ? 'subsidy' : 'base';
  const settings = model.series.filter((series) => series.scope === settingsScope);
  const segments = model.segments ?? program.timeline.periods.map((period) => ({ id: period.definitionId, definitionId: period.definitionId, startYear: period.startYear, endYear: period.endYear }));
  const boundaryYears = segments.slice(1).map((period) => period.startYear);
  const yearLabels = buildTimelineYearLabels(program);
  const splitYears = segments.flatMap((segment) => Array.from(
    { length: Math.max(0, segment.endYear - segment.startYear) },
    (_, index) => segment.startYear + index + 1,
  ));
  const comparison = (field: keyof HistoricalPlCalculated) => [
    { label: '全社合算', values: company.records.map((row) => Number(row[field])), color: colors[0] },
    { label: 'ベース事業', values: base.records.map((row) => Number(row[field])), color: colors[1] },
    { label: '補助事業', values: subsidy.records.map((row) => Number(row[field])), color: colors[2] },
  ];
  const charts = [
    { title: '売上高・利益額', subtitle: '事業規模と利益創出力', kind: 'money' as const, lines: [['売上高', 'sales'], ['売上総利益', 'grossProfit'], ['営業利益', 'operatingProfit']] as const },
    { title: '前年比増加率', subtitle: '前年からの伸び（初年度は—）', kind: 'percent' as const, lines: [['売上高成長率', 'salesGrowthRate'], ['従業員数（就業時間換算）増加率', 'headcountGrowthRate'], ['1人当たり給与増加率', 'employeePayPerPersonGrowthRate'], ['従業員人件費増加率', 'employeePayGrowthRate']] as const },
    { title: '収益性', subtitle: '原価・その他販管費・営業利益の率', kind: 'percent' as const, lines: [['売上原価率', 'cogsRate'], ['その他販管費率', 'otherSgaRate'], ['営業利益率', 'operatingProfitMargin']] as const },
    { title: '売上原価の内訳', subtitle: '原価総額と原価内減価償却費', kind: 'money' as const, lines: [['売上原価', 'cogs'], ['原価内減価償却費', 'cogsDepreciation']] as const },
    { title: '販管費の内訳', subtitle: '人件費・減価償却・研究開発・その他', kind: 'money' as const, lines: [['役員人件費', 'officerPay'], ['従業員人件費', 'employeePay'], ['販管費内減価償却費', 'sgaDepreciation'], ['研究開発費', 'researchDevelopment'], ['その他販管費', 'otherSga']] as const },
    { title: '人件費の内訳', subtitle: '給与・賞与と役員報酬・賞与', kind: 'money' as const, lines: [['従業員給与', 'employeeSalary'], ['従業員賞与', 'employeeBonus'], ['役員報酬', 'officerCompensation'], ['役員賞与', 'officerBonus']] as const },
    { title: '営業利益以下', subtitle: '営業外・特別損益と各利益段階', kind: 'money' as const, lines: [['営業外損益', 'nonOperating'], ['特別損益', 'extraordinary'], ['経常利益', 'ordinaryIncome'], ['税引前利益', 'preTaxIncome'], ['当期純利益', 'netIncome']] as const },
    { title: '従業員数（就業時間換算）', subtitle: 'FTE換算人数', kind: 'fte' as const, lines: [['従業員数', 'headcount']] as const },
    { title: '1人当たり給与', subtitle: '従業員給与総額 ÷ FTE', kind: 'moneyPerPerson' as const, lines: [['1人当たり給与', 'employeePayPerPerson']] as const },
    { title: '労働生産性', subtitle: '付加価値額 ÷ FTE（実額）', kind: 'moneyPerPerson' as const, lines: [['労働生産性', 'laborProductivity']] as const },
  ];
  const applyForecastTarget = (field: keyof HistoricalPlCalculated, year: number, target: number, phase: 'start' | 'change' | 'end') => {
    if (phase === 'start') { beginTransaction(); return; }
    if (phase === 'end') { commitTransaction(); return; }
    const yearIndex = selected.years.indexOf(year);
    if (scope === 'subsidy') replaceForecast(fitForecastPlCell(model, 'subsidy', subsidyActuals.at(-1)!, year, field, target));
    else if (scope === 'base') replaceForecast(fitForecastPlCell(model, 'base', baseActuals.at(-1)!, year, field, target));
    else {
      const currentCompany = Number(company.records[yearIndex]?.[field]);
      const currentBase = Number(base.records[yearIndex]?.[field]);
      replaceForecast(fitForecastPlCell(model, 'base', baseActuals.at(-1)!, year, field, currentBase + target - currentCompany));
    }
  };
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (!event.ctrlKey || !['1', '2', '3'].includes(event.key)) return; event.preventDefault(); setScope(({ '1': 'company', '2': 'base', '3': 'subsidy' } as const)[event.key as '1' | '2' | '3']); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);

  return <main className="mt-3 grid gap-3">
    <section className="flex items-center justify-between border border-line bg-surface px-5 py-3">
      <div><p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold tracking-[.08em] text-orange"><SlidersHorizontal className="size-3" />FORECAST &amp; PL</p><h2 className="m-0 text-xl font-bold">将来予測・調整水準</h2></div>
      <div><div className="flex rounded-lg bg-[#e8e6df] p-1">{(['company', 'base', 'subsidy'] as Scope[]).map((item) => <Button key={item} variant="ghost" size="sm" className={cn(scope === item && 'bg-navy text-white hover:bg-navy/90 hover:text-white')} onClick={() => setScope(item)}>{scopeLabels[item]}</Button>)}</div><p className="mt-1 mb-0 text-center text-[9px] text-muted-foreground">Ctrl+1 / Ctrl+2 / Ctrl+3</p></div>
    </section>
    <div data-testid="forecast-layout" className="grid grid-cols-[clamp(360px,26vw,500px)_minmax(0,1fr)_clamp(320px,22vw,420px)] items-start gap-3 [&>aside]:top-16 [&>aside]:max-h-[calc(100vh-76px)]">
      <aside data-testid="forecast-settings-panel" className="sticky top-3 max-h-[calc(100vh-24px)] overflow-y-auto border border-line bg-surface p-2.5">
        <div className="mb-2 flex items-center justify-between"><div><h3 className="m-0 text-base font-bold">水準設定</h3><p className="m-0 text-[10px] text-muted-foreground">{scope === 'company' ? '全社合算ではベース事業の水準を表示' : scopeLabels[scope]}・右端は開始時増減</p></div><Badge variant="outline">金額単位：{moneyUnitLabel(unit)}</Badge></div>
        {scope === 'company' && <p className="mb-2 rounded bg-soft p-2 text-[10px] text-muted-foreground">全社合算はベース事業と補助事業から自動計算します。水準を変更する場合は各事業へ切り替えてください。</p>}
        <div className="grid gap-2 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(210px, 1fr))` }}>{segments.map((period, segmentIndex) => { const definitionLabel = program.definitions.periods.find((definition) => definition.id === period.definitionId)?.label ?? period.definitionId; const siblings = segments.filter((candidate) => candidate.definitionId === period.definitionId); const label = siblings.length > 1 ? `${definitionLabel}${siblings.indexOf(period) + 1}` : definitionLabel; return <section data-testid="forecast-period-column" key={period.id} className="border-t-[3px] border-navy bg-background"><header data-testid="forecast-period-header" className="flex min-h-10 items-center justify-between gap-2 px-1.5 py-1"><span className="flex min-w-0 items-center gap-2"><strong className="min-w-0 text-sm leading-tight">{label}</strong><span data-testid="forecast-period-years" className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">{period.startYear}–{period.endYear}</span></span>{segmentIndex > 0 && segments[segmentIndex - 1].definitionId === period.definitionId && <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1.5 text-[9px]" aria-label={`${period.startYear}年の期間分割を解除`} onClick={() => mergeForecastPeriod(period.id)}>解除</Button>}</header>{settings.map((series) => <SettingRow key={series.id} series={series} periodId={period.id} periodLabel={label} unit={unit} readOnly={scope === 'company'} />)}</section>; })}</div>
      </aside>
      <section className="min-w-0 border border-line bg-surface p-3">
        <Tabs defaultValue="chart"><div className="mb-3 flex items-center justify-between gap-3"><TabsList><TabsTrigger value="chart"><BarChart3 />チャート</TabsTrigger><TabsTrigger value="table"><Table2 />PL表</TabsTrigger><TabsTrigger value="comparison"><Activity />事業比較</TabsTrigger></TabsList><div className="flex flex-wrap justify-end gap-1" aria-label="期間分割操作">{splitYears.map((year) => <Button key={year} variant="outline" size="sm" className="h-7 px-2 text-[9px]" aria-label={`${year}年から期間を分割`} onClick={() => splitForecastAtYear(year)}>＋ '{String(year).slice(-2)}</Button>)}{segments.slice(1).filter((segment, index) => segments[index].definitionId === segment.definitionId).map((segment) => <Button key={segment.id} variant="ghost" size="sm" className="h-7 px-2 text-[9px] text-orange" aria-label={`${segment.startYear}年の期間分割を解除`} onClick={() => mergeForecastPeriod(segment.id)}>− '{String(segment.startYear).slice(-2)}</Button>)}</div></div>
          <TabsContent value="chart"><div className="grid grid-cols-3 gap-2">{charts.map((chart) => { const lines = chart.lines.map(([label, field], index) => ({ label, values: selected.records.map((row) => Number(row[field] ?? NaN)), color: colors[index], field: field as keyof HistoricalPlCalculated })); return <MultiLineChart key={chart.title} title={chart.title} subtitle={chart.subtitle} years={selected.years} lines={lines} boundaries={boundaryYears} kind={chart.kind} unit={unit} editableFromYear={model.series[0].baseYear + 1} onPointChange={scope === 'company' ? undefined : applyForecastTarget} />; })}</div></TabsContent>
          <TabsContent value="table"><FinancialTable testId="forecast-pl-table" title={`${scopeLabels[scope]} P/L`} years={selected.years} yearLabels={yearLabels} records={selected.records} rows={historicalPlRows} moneyUnit={unit} editableFromIndex={baseActuals.length} onRowSelect={(row) => setSelectedLogicCode(row.code)} onEditStart={beginTransaction} onEditEnd={commitTransaction} onValueChange={scope === 'company' ? undefined : (yearIndex, row, target) => {
            const calculatedFields: Record<string, keyof HistoricalPlCalculated> = { '2': 'salesGrowthRate', '5': 'grossProfit', '6': 'grossProfitMargin', '7': 'sga', '8': 'officerPay', '11': 'employeePay', '16': 'operatingProfit', '17': 'operatingProfitMargin', '18': 'ordinaryIncome', '19': 'preTaxIncome', '23': 'depreciation', '24': 'valueAdded', '25': 'valueAddedGrowthRate', '29': 'employeePayPerPerson', '33': 'laborProductivity', '34': 'ebitda', '35': 'ebitdaMargin' };
            const field = (row.field as keyof HistoricalPlCalculated | undefined) ?? calculatedFields[row.code];
            if (!field) return;
            const year = selected.years[yearIndex];
            if (scope === 'subsidy') replaceForecast(fitForecastPlCell(model, 'subsidy', subsidyActuals.at(-1)!, year, field, target));
            else if (scope === 'base') replaceForecast(fitForecastPlCell(model, 'base', baseActuals.at(-1)!, year, field, target));
            else {
              const currentCompany = Number(company.records[yearIndex][field]);
              const currentBase = Number(base.records[yearIndex][field]);
              replaceForecast(fitForecastPlCell(model, 'base', baseActuals.at(-1)!, year, field, currentBase + target - currentCompany));
            }
          }} /></TabsContent>
          <TabsContent value="comparison"><div className="grid grid-cols-3 gap-2">{[
            ['売上高', 'sales', 'money'], ['営業利益', 'operatingProfit', 'money'], ['従業員数（就業時間換算）', 'headcount', 'fte'], ['1人当たり給与', 'employeePayPerPerson', 'moneyPerPerson'], ['営業利益率', 'operatingProfitMargin', 'percent'], ['労働生産性', 'laborProductivity', 'moneyPerPerson'],
          ].map(([title, field, kind]) => <MultiLineChart key={title} title={title} subtitle="全社合算・ベース事業・補助事業" years={company.years} lines={comparison(field as keyof HistoricalPlCalculated)} boundaries={boundaryYears} kind={kind as ValueKind} unit={unit} />)}</div></TabsContent>
        </Tabs>
      </section>
      <MetricsPanel company={company} base={base} subsidy={subsidy} />
    </div>
    {(() => { const logic = plLogicNodes.find((node) => node.code === selectedLogicCode) ?? plLogicNodes[0]; const labels = new Map(plLogicNodes.map((node) => [node.code, node.label])); const downstream = downstreamCodes(plLogicNodes, logic.code); return <section data-testid="forecast-logic-detail" className="grid grid-cols-[minmax(0,1fr)_360px] gap-3 border border-line bg-surface p-4"><div><h3 className="m-0 text-base font-bold">選択したロジック</h3><p className="mt-1 text-[10px] text-muted-foreground">P/L項目を選択して計算式・参照元・影響先を確認</p><div className="mt-2 flex flex-wrap gap-1">{plLogicNodes.map((node) => <Button key={node.code} variant={node.code === logic.code ? 'default' : 'outline'} size="sm" className="h-7" onClick={() => setSelectedLogicCode(node.code)}>{node.code} {node.label}</Button>)}</div></div><aside className="border-t-[3px] border-orange bg-background p-3"><strong className="text-sm">{logic.label}</strong><code className="mt-2 block rounded bg-soft p-2 text-[10px]">{logic.formula}</code><p className="mb-1 text-[9px] text-muted-foreground">参照：{logic.dependsOn.map((code) => labels.get(code)).join('・') || '外部入力・前年値'}</p><p className="m-0 text-[9px] text-muted-foreground">影響先：{downstream.map((code) => labels.get(code)).join('・') || '最終出力'}</p></aside></section>; })()}
  </main>;
}
