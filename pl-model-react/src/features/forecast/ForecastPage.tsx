import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, SlidersHorizontal, Table2, Workflow } from 'lucide-react';
import type { CSSProperties, RefObject } from 'react';
import { FinancialTable, type FinancialTableValueUpdate } from '../../components/FinancialTable';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { NumberInput } from '../../components/ui/number-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { StickyPanel } from '../../components/ui/sticky-panel';
import { StickySurface } from '../../components/ui/sticky-surface';
import { buildForecastPl, fitForecastPlCell, type ForecastSeries } from '../../domain/forecast-engine';
import { orderForecastSeriesByPl } from '../../domain/forecast-series-order';
import { calculatePlSeries, combinePlInputs } from '../../domain/financials';
import { forecastPlRows } from '../../domain/rows';
import type { HistoricalPlCalculated, HistoricalPlInput } from '../../domain/types';
import { formatFinancialValue, fromDisplayFinancialValue, moneyUnitLabel, roundFinancialInputValue, toDisplayFinancialValue, type MoneyDisplayUnit, type ValueKind } from '../../domain/value-units';
import { cn } from '../../lib/utils';
import { useModelStore } from '../../store/model-store-context';
import { MetricsPanel, OptimizationToolbar, useForecastOptimization } from './MetricsPanel';
import { chartAxisTicks, nextChartExtent, type ChartExtent } from '../../domain/chart-scale';
import { buildTimelineYearLabels, resolveTimeline } from '../../domain/timeline';
import { plLogicNodes } from '../../domain/pl-logic';
import { defaultForecastRange } from '../../domain/forecast-range';
import { settingsPeriodMinWidth, shouldAutoCollapseSettings } from './forecast-layout';
import { stickyStackOffsetCss, useObservedHeight } from '../../lib/sticky-stack';

type Scope = 'company' | 'base' | 'subsidy';
type ForecastView = 'chart' | 'table';
type ChartDisplay = Scope | 'comparison';
type ChartLine = { label: string; values: number[]; color: string };

const scopeLabels: Record<Scope, string> = { company: '全社合算', base: 'ベース事業', subsidy: '補助事業' };
const chartDisplayLabels: Record<ChartDisplay, string> = { ...scopeLabels, comparison: '事業比較' };
const chartDisplayOrder: ChartDisplay[] = ['company', 'base', 'subsidy', 'comparison'];
const colors = ['#183b56', '#167d78', '#c75b24', '#7c5c8e', '#9a7222'];
const calculatedPlFields: Record<string, keyof HistoricalPlCalculated> = { '2': 'salesGrowthRate', '5': 'grossProfit', '6': 'grossProfitMargin', '7': 'sga', '8': 'officerPay', '11': 'employeePay', '16': 'operatingProfit', '17': 'operatingProfitMargin', '18': 'ordinaryIncome', '19': 'preTaxIncome', '23': 'depreciation', '24': 'valueAdded', '25': 'valueAddedGrowthRate', '29': 'employeePayPerPerson', '30': 'employeePayPerPersonGrowthRate', '31': 'officerPayPerPerson', '32': 'officerPayPerPersonGrowthRate', '33': 'laborProductivity', '34': 'ebitda', '35': 'ebitdaMargin' };

function useCompactSettingsPanel(periodCount: number) {
  const ref = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const update = (width: number) => setCompact(shouldAutoCollapseSettings(width, periodCount));
    update(panel.getBoundingClientRect().width || panel.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
    };
  }, [periodCount]);
  return { ref, compact };
}

function SyncedHorizontalScrollbar({ contentRef, contentKey }: { contentRef: RefObject<HTMLDivElement | null>; contentKey: string }) {
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const [placement, setPlacement] = useState<{ left?: number; width?: number; visible: boolean }>({ visible: true });
  useEffect(() => {
    const scrollbar = scrollbarRef.current;
    const content = contentRef.current;
    if (!scrollbar || !content) return;
    const update = () => {
      setTrackWidth(Math.max(1, content.scrollWidth));
      scrollbar.scrollLeft = content.scrollLeft;
      const rect = content.getBoundingClientRect();
      const hasGeometry = rect.width > 0 || rect.height > 0;
      const overflowing = content.scrollWidth > content.clientWidth + 1;
      const visible = overflowing && (!hasGeometry || (rect.bottom > 0 && rect.top < window.innerHeight));
      setPlacement({ left: rect.width > 0 ? rect.left : undefined, width: rect.width > 0 ? rect.width : undefined, visible });
    };
    const syncFromScrollbar = () => {
      if (content.scrollLeft !== scrollbar.scrollLeft) content.scrollLeft = scrollbar.scrollLeft;
    };
    const syncFromContent = () => {
      if (scrollbar.scrollLeft !== content.scrollLeft) scrollbar.scrollLeft = content.scrollLeft;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    scrollbar.addEventListener('scroll', syncFromScrollbar);
    content.addEventListener('scroll', syncFromContent);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      scrollbar.removeEventListener('scroll', syncFromScrollbar);
      content.removeEventListener('scroll', syncFromContent);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [contentKey, contentRef]);
  return <div ref={scrollbarRef} data-testid="forecast-chart-horizontal-scrollbar" role="scrollbar" aria-label="チャート横スクロール" aria-orientation="horizontal" aria-hidden={!placement.visible} className={cn('fixed bottom-0 z-40 h-4 overflow-x-scroll border-y border-line bg-surface shadow-[0_-2px_6px_rgba(24,59,86,.12)] [scrollbar-gutter:stable]', !placement.visible && 'invisible')} style={{ left: placement.left, width: placement.width }}>
    <div aria-hidden="true" className="h-px" style={{ width: `${trackWidth}px` }} />
  </div>;
}

const MultiLineChart = memo(function MultiLineChart({ title, subtitle, contextLabel, years, lines, boundaries, kind, unit, editableFromYear, specialYearLabels }: { title: string; subtitle: string; contextLabel?: string; years: number[]; lines: ChartLine[]; boundaries: number[]; kind: ValueKind; unit: MoneyDisplayUnit; editableFromYear?: number; specialYearLabels?: Record<number, string[]> }) {
  const width = 360; const height = 150; const margin = { left: 48, right: 8, top: 9, bottom: 34 };
  const [hoveredYearIndex, setHoveredYearIndex] = useState<number | null>(null);
  const [pinnedYearIndex, setPinnedYearIndex] = useState<number | null>(null);
  const scale = useRef<ChartExtent | undefined>(undefined);
  const extent = nextChartExtent(scale.current, lines.flatMap((line) => line.values));
  scale.current = extent;
  const x = (index: number) => margin.left + (width - margin.left - margin.right) * index / Math.max(years.length - 1, 1);
  const y = (value: number) => margin.top + (height - margin.top - margin.bottom) * (extent.max - value) / (extent.max - extent.min || 1);
  const forecastStartIndex = years.findIndex((year) => year >= (editableFromYear ?? Infinity));
  const forecastBoundaryX = forecastStartIndex > 0 ? (x(forecastStartIndex - 1) + x(forecastStartIndex)) / 2 : x(Math.max(0, forecastStartIndex));
  const formatAxis = (value: number) => formatFinancialValue(value, kind, unit, 1).replace(` ${moneyUnitLabel(unit)}/人`, '');
  const activeYearIndex = hoveredYearIndex ?? pinnedYearIndex;
  const plotWidth = width - margin.left - margin.right;
  const yearTargetWidth = plotWidth / Math.max(years.length - 1, 1);
  const tooltipWidth = 126;
  const tooltipHeight = 22 + lines.length * 12;
  const tooltipX = activeYearIndex == null ? 0 : Math.min(width - margin.right - tooltipWidth, Math.max(margin.left, x(activeYearIndex) + (x(activeYearIndex) > width / 2 ? -tooltipWidth - 7 : 7)));
  const togglePinnedYear = (index: number) => setPinnedYearIndex((current) => current === index ? null : index);
  return <article data-testid="forecast-chart-card" className="self-start border border-line bg-white p-2">
    <div data-testid="forecast-chart-heading" className="flex min-w-0 items-baseline justify-between gap-2"><h4 className="m-0 shrink-0 text-sm font-bold">{title}</h4><p className="m-0 truncate text-[9px] text-muted-foreground" title={subtitle}>{subtitle}</p></div>
    <svg role="img" aria-label={`${contextLabel ? `${contextLabel} ` : ''}${title} 推移チャート`} viewBox={`0 0 ${width} ${height}`} className="h-38 w-full">
      {forecastStartIndex >= 0 && <rect data-testid="forecast-area" x={forecastBoundaryX} y={margin.top} width={width - margin.right - forecastBoundaryX} height={height - margin.top - margin.bottom} fill="#eef6ef" />}
      {chartAxisTicks(extent).map((value) => { const py = y(value); return <g key={value}><line x1={margin.left} x2={width - margin.right} y1={py} y2={py} stroke="#d2dbe2" /><text data-axis-tick="y" x={margin.left - 4} y={py + 3.5} textAnchor="end" fontSize="11" fill="#667085">{formatAxis(value)}</text></g>; })}
      {extent.min < 0 && extent.max > 0 && <line x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} stroke="#93a6b8" strokeWidth="1.5" />}
      {forecastStartIndex >= 0 && <line data-testid="forecast-start-boundary" x1={forecastBoundaryX} x2={forecastBoundaryX} y1={margin.top} y2={height - margin.bottom} stroke="#91aa97" strokeWidth="1.1" strokeDasharray="3 3" />}
      {boundaries.map((year) => { const index = years.indexOf(year); if (index < 0) return null; const boundaryX = index > 0 ? (x(index - 1) + x(index)) / 2 : x(index); return <line data-testid={`forecast-boundary-${year}`} key={year} x1={boundaryX} x2={boundaryX} y1={margin.top} y2={height - margin.bottom} stroke="#7890a4" strokeWidth="1.25" strokeDasharray="4 3" />; })}
      {lines.map((line) => { const points = (from: number, to: number) => line.values.map((value, index) => ({ value, index })).filter(({ value, index }) => Number.isFinite(value) && index >= from && index <= to).map(({ value, index }) => `${x(index)},${y(value)}`).join(' '); return <g key={line.label}><polyline data-line-phase="actual" points={points(0, forecastStartIndex < 0 ? years.length - 1 : forecastStartIndex - 1)} fill="none" stroke={line.color} strokeWidth="2.2" /><polyline data-line-phase="forecast" points={points(Math.max(0, forecastStartIndex - 1), years.length - 1)} fill="none" stroke={line.color} strokeWidth="2.2" strokeDasharray="5 4" />{line.values.map((value, index) => { if (!Number.isFinite(value)) return null; const phase = forecastStartIndex >= 0 && index >= forecastStartIndex ? 'forecast' : 'actual'; return <circle key={years[index]} data-point-phase={phase} cx={x(index)} cy={y(value)} r={phase === 'forecast' ? 3.2 : 2.8} fill={phase === 'forecast' ? '#fff' : line.color} stroke={phase === 'forecast' ? line.color : undefined} strokeWidth={phase === 'forecast' ? 1.5 : undefined} />; })}</g>; })}
      {years.map((year, index) => <g key={year}>
        <text x={x(index)} y={height - 17} textAnchor="middle" fontSize="11" fill="#667085">'{String(year).slice(-2)}</text>
        {!!specialYearLabels?.[year]?.length && <text data-testid={`chart-special-year-${year}`} x={x(index)} y={height - 5} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#167d78">{specialYearLabels[year].join('・')}</text>}
      </g>)}
      {years.map((year, index) => <rect key={`target-${year}`} data-testid={`chart-year-target-${year}`} aria-label={`${year}年の値を表示`} role="button" tabIndex={0} x={Math.max(margin.left, x(index) - yearTargetWidth / 2)} y={margin.top} width={Math.min(yearTargetWidth, width - margin.right - Math.max(margin.left, x(index) - yearTargetWidth / 2))} height={height - margin.top - margin.bottom} fill="transparent" onMouseEnter={() => setHoveredYearIndex(index)} onMouseLeave={() => setHoveredYearIndex(null)} onFocus={() => setHoveredYearIndex(index)} onBlur={() => setHoveredYearIndex(null)} onClick={() => togglePinnedYear(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePinnedYear(index); } }} />)}
      {activeYearIndex != null && <g data-testid="chart-tooltip" pointerEvents="none">
        <line x1={x(activeYearIndex)} x2={x(activeYearIndex)} y1={margin.top} y2={height - margin.bottom} stroke="#38566f" strokeWidth="1" strokeDasharray="2 2" />
        {lines.map((line) => Number.isFinite(line.values[activeYearIndex]) && <circle key={line.label} cx={x(activeYearIndex)} cy={y(line.values[activeYearIndex])} r="4.2" fill="#fff" stroke={line.color} strokeWidth="2" />)}
        <rect x={tooltipX} y={margin.top + 3} width={tooltipWidth} height={tooltipHeight} rx="4" fill="#fff" stroke="#9babb8" />
        <text x={tooltipX + 7} y={margin.top + 15} fontSize="10.5" fontWeight="700" fill="#183b56">{years[activeYearIndex]}年</text>
        {lines.map((line, index) => <g key={line.label}><circle cx={tooltipX + 8} cy={margin.top + 28 + index * 12} r="2.5" fill={line.color} /><text x={tooltipX + 14} y={margin.top + 31 + index * 12} fontSize="9.5" fill="#183b56">{line.label}</text><text x={tooltipX + tooltipWidth - 6} y={margin.top + 31 + index * 12} textAnchor="end" fontSize="9.5" fontWeight="700" fill="#183b56">{formatAxis(line.values[activeYearIndex])}</text></g>)}
      </g>}
    </svg>
    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">{lines.map((line) => <span key={line.label} className="flex items-center gap-1 text-[10px] leading-tight"><i className="h-0.5 w-3" style={{ backgroundColor: line.color }} />{line.label}</span>)}</div>
  </article>;
});

function SettingRow({ series, periodId, periodLabel, unit, variationOpen, readOnly = false }: { series: ForecastSeries; periodId: string; periodLabel: string; unit: MoneyDisplayUnit; variationOpen: boolean; readOnly?: boolean }) {
  const period = series.periods.find((candidate) => candidate.id === periodId)!;
  const update = useModelStore((state) => state.updateForecastPeriod);
  const begin = useModelStore((state) => state.beginTransaction);
  const commit = useModelStore((state) => state.commitTransaction);
  const linear = series.projectionMode === 'linear';
  const rateKind: ValueKind = linear ? 'point' : 'percent';
  const normalizeRate = (value: number) => roundFinancialInputValue(value, rateKind, unit);
  const annualGrowthRate = roundFinancialInputValue(period.annualGrowthRate, rateKind, unit);
  const startValue = period.startValue === null || period.startValue === undefined ? null : roundFinancialInputValue(toDisplayFinancialValue(period.startValue, series.valueKind, unit), series.valueKind, unit);
  const adjustment = roundFinancialInputValue(toDisplayFinancialValue(period.startAdjustment, series.valueKind, unit), series.valueKind, unit);
  const range = period.range ?? defaultForecastRange(series.projectionMode);
  const displayRange = {
    min: roundFinancialInputValue(range.min, rateKind, unit),
    max: roundFinancialInputValue(range.max, rateKind, unit),
  };
  const maxBeforeMinWasEmptied = useRef<number | null>(null);
  const minBeforeMaxWasEmptied = useRef<number | null>(null);
  const updateRangeMin = (inputValue: number) => {
    const min = normalizeRate(inputValue);
    const previousMax = maxBeforeMinWasEmptied.current ?? displayRange.max;
    update(series.id, period.id, { range: { min, max: Math.max(previousMax, min) } });
  };
  const updateRangeMax = (inputValue: number) => {
    const max = normalizeRate(inputValue);
    const previousMin = minBeforeMaxWasEmptied.current ?? displayRange.min;
    update(series.id, period.id, { range: { min: Math.min(previousMin, max), max } });
  };
  const clearRangeMin = () => {
    maxBeforeMinWasEmptied.current = displayRange.max;
    update(series.id, period.id, { range: { min: 0, max: Math.max(displayRange.max, 0) } });
  };
  const clearRangeMax = () => {
    minBeforeMaxWasEmptied.current = displayRange.min;
    update(series.id, period.id, { range: { min: Math.min(displayRange.min, 0), max: 0 } });
  };
  return <fieldset data-testid={`forecast-setting-row-${series.id}-${period.id}`} disabled={readOnly} className="m-0 min-w-0 border-0 border-t border-line px-1.5 py-1 [container-type:inline-size] first:border-t-0 disabled:opacity-55">
    <div data-testid="forecast-setting-row-header" className="mb-0.5 grid min-h-5 grid-cols-[minmax(0,1fr)_auto] items-center gap-1"><strong className="min-w-0 text-[11px] leading-tight">{series.label}</strong><span className="flex shrink-0 items-center gap-0.5"><NumberInput disabled={series.changePolicy === 'fixed'} data-position="item-name" aria-label={`${periodLabel} ${series.label} 年間変化`} value={annualGrowthRate} step="0.01" className="h-5 w-11 px-0.5 text-right text-[9px] font-bold text-orange" onEmptyChange={() => update(series.id, period.id, { annualGrowthRate: 0, range: { min: Math.min(range.min, 0), max: Math.max(range.max, 0) } })} onEditingStart={begin} onEditingEnd={commit} onValueChange={(inputValue) => { const value = normalizeRate(inputValue); update(series.id, period.id, { annualGrowthRate: value, range: { min: Math.min(range.min, value), max: Math.max(range.max, value) } }); }} /><small className="whitespace-nowrap text-[8px] text-orange">{linear ? 'pt/年' : '%/年'}</small></span></div>
    <div data-testid="forecast-setting-controls" className="forecast-setting-controls grid grid-cols-1 items-center gap-1.5">
      <div data-testid="forecast-level-slider-group" className="grid min-w-0 grid-cols-[38px_minmax(44px,1fr)_38px] items-center gap-1">
        <NumberInput disabled={series.changePolicy === 'fixed'} aria-label={`${periodLabel} ${series.label} 最小値`} value={displayRange.min} step="0.01" className="h-5 px-1 text-right text-[9px]" onEmptyChange={clearRangeMin} onEditingStart={begin} onEditingEnd={() => { maxBeforeMinWasEmptied.current = null; commit(); }} onValueChange={updateRangeMin} />
        <input aria-label={`${periodLabel} ${series.label} 水準`} type="range" min={displayRange.min} max={displayRange.max} step="0.01" value={Math.max(displayRange.min, Math.min(displayRange.max, annualGrowthRate))} disabled={displayRange.min === displayRange.max} onPointerDown={begin} onPointerUp={commit} onChange={(event) => update(series.id, period.id, { annualGrowthRate: normalizeRate(Number(event.target.value)) })} className="w-full accent-[#c75b24]" />
        <NumberInput disabled={series.changePolicy === 'fixed'} aria-label={`${periodLabel} ${series.label} 最大値`} value={displayRange.max} step="0.01" className="h-5 px-1 text-right text-[9px]" onEmptyChange={clearRangeMax} onEditingStart={begin} onEditingEnd={() => { minBeforeMaxWasEmptied.current = null; commit(); }} onValueChange={updateRangeMax} />
      </div>
      {variationOpen && <div data-testid="forecast-start-adjustment-group" className="grid grid-cols-2 gap-1 border-t border-dashed border-line pt-1"><label className="min-w-0 text-[7px] leading-none text-muted-foreground">開始時固定値<NumberInput aria-label={`${periodLabel} ${series.label} 開始時固定値`} title="未設定時は前年から通常計算" value={startValue} emptyValue={startValue === null ? null : 0} step="0.01" className="mt-0.5 h-5 w-full px-1 text-right text-[9px]" onEmptyChange={() => update(series.id, period.id, { startValue: 0 })} onEmpty={() => update(series.id, period.id, { startValue: null })} onEditingStart={begin} onEditingEnd={commit} onValueChange={(inputValue) => update(series.id, period.id, { startValue: fromDisplayFinancialValue(inputValue, series.valueKind, unit) })} /></label><label className="min-w-0 text-[7px] leading-none text-muted-foreground">開始時増減<NumberInput aria-label={`${periodLabel} ${series.label} 開始時増減`} title="固定値または通常計算値へ加算" value={adjustment} step="0.01" className="mt-0.5 h-5 w-full px-1 text-right text-[9px]" onEmptyChange={() => update(series.id, period.id, { startAdjustment: 0 })} onEditingStart={begin} onEditingEnd={commit} onValueChange={(inputValue) => update(series.id, period.id, { startAdjustment: fromDisplayFinancialValue(inputValue, series.valueKind, unit) })} /></label></div>}
    </div>
  </fieldset>;
}
function buildTimeline(actuals: HistoricalPlInput[], model: ReturnType<typeof useForecastModel>, scope: 'base' | 'subsidy') {
  const future = buildForecastPl(model, scope, actuals.at(-1)!);
  return { years: [...actuals.map((_, index) => model.series[0].baseYear - actuals.length + index + 1), ...future.map((row) => row.year)], records: [...calculatePlSeries(actuals), ...future.map((row) => row.calculated)] };
}
function useForecastModel() { return useModelStore((state) => state.forecast); }

export function ForecastPage({ onOpenLogicMap }: { onOpenLogicMap?: (code: string) => void }) {
  const [scope, setScope] = useState<Scope>('base');
  const [view, setView] = useState<ForecastView>('chart');
  const [chartDisplays, setChartDisplays] = useState<Record<ChartDisplay, boolean>>({ company: true, base: true, subsidy: true, comparison: true });
  const chartScrollContentRef = useRef<HTMLDivElement>(null);
  const businessHeaderScrollRef = useRef<HTMLDivElement>(null);
  const [selectedLogicCode, setSelectedLogicCode] = useState('16');
  const selectedLogic = plLogicNodes.find((node) => node.code === selectedLogicCode) ?? plLogicNodes[0];
  const model = useForecastModel();
  const optimization = useForecastOptimization();
  const operationLayer = useObservedHeight<HTMLDivElement>(71);
  const chartDisplayLayer = useObservedHeight<HTMLDivElement>(45);
  const program = useModelStore((state) => state.program);
  const baseActuals = useModelStore((state) => state.actuals.basePl);
  const subsidyActuals = useModelStore((state) => state.actuals.subsidyPl);
  const unit = useModelStore((state) => state.preferences.moneyUnit);
  const splitForecastAtYear = useModelStore((state) => state.splitForecastAtYear);
  const mergeForecastPeriod = useModelStore((state) => state.mergeForecastPeriod);
  const replaceForecast = useModelStore((state) => state.replaceForecast);
  const updateFinalYearSalesAllocation = useModelStore((state) => state.updateFinalYearSalesAllocation);
  const clearFinalYearSalesAllocation = useModelStore((state) => state.clearFinalYearSalesAllocation);
  const beginTransaction = useModelStore((state) => state.beginTransaction);
  const commitTransaction = useModelStore((state) => state.commitTransaction);
  const base = useMemo(() => buildTimeline(baseActuals, model, 'base'), [baseActuals, model]);
  const subsidy = useMemo(() => buildTimeline(subsidyActuals, model, 'subsidy'), [subsidyActuals, model]);
  const company = useMemo(() => {
    const inputs = base.records.map((row, index) => combinePlInputs(row, subsidy.records[index]));
    return { years: base.years, records: calculatePlSeries(inputs) };
  }, [base, subsidy]);
  const finalYear = Math.max(...(model.segments ?? program.timeline.periods).map((period) => period.endYear));
  const currentCompanyFinalSales = company.records.at(-1)?.sales ?? 0;
  const currentBaseFinalSales = base.records.at(-1)?.sales ?? 0;
  const currentBaseShare = currentCompanyFinalSales > 0 ? currentBaseFinalSales / currentCompanyFinalSales * 100 : 50;
  const currentBaseShareRounded = Math.round(currentBaseShare * 100) / 100;
  const displayedBaseShare = model.finalYearSalesAllocation
    ? Math.round(model.finalYearSalesAllocation.baseSharePercent * 100) / 100
    : null;
  const [baseShareDraft, setBaseShareDraft] = useState<number | null>(displayedBaseShare);
  useEffect(() => {
    setBaseShareDraft(displayedBaseShare);
  }, [displayedBaseShare]);
  const applyBaseShare = (value: number) => {
    const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    setBaseShareDraft(bounded);
    updateFinalYearSalesAllocation(bounded);
  };
  const clearBaseShare = () => {
    setBaseShareDraft(null);
    clearFinalYearSalesAllocation();
  };
  const selected = scope === 'base' ? base : scope === 'subsidy' ? subsidy : company;
  const applyForecastPlValues = (updates: FinancialTableValueUpdate<HistoricalPlCalculated>[]) => {
    if (scope === 'company') return;
    let nextModel = model;
    for (const { yearIndex, row, value } of updates) {
      const field = (row.field as keyof HistoricalPlCalculated | undefined) ?? calculatedPlFields[row.code];
      const year = selected.years[yearIndex];
      if (!field || year === undefined) continue;
      nextModel = scope === 'subsidy'
        ? fitForecastPlCell(nextModel, 'subsidy', subsidyActuals.at(-1)!, year, field, value)
        : fitForecastPlCell(nextModel, 'base', baseActuals.at(-1)!, year, field, value);
    }
    replaceForecast(nextModel);
  };
  const settingsScope = scope === 'subsidy' ? 'subsidy' : 'base';
  const settings = orderForecastSeriesByPl(model.series.filter((series) => series.scope === settingsScope));
  const segments = model.segments ?? program.timeline.periods.map((period) => ({ id: period.definitionId, definitionId: period.definitionId, startYear: period.startYear, endYear: period.endYear }));
  const settingsPanel = useCompactSettingsPanel(segments.length);
  const [variationOverride, setVariationOverride] = useState(true);
  const variationOpen = variationOverride ?? !settingsPanel.compact;
  const boundaryYears = segments.slice(1).map((period) => period.startYear);
  const yearLabels = buildTimelineYearLabels(program);
  const specialYearLabels = useMemo(() => resolveTimeline(program).specialYears.reduce<Record<number, string[]>>((labels, specialYear) => {
    (labels[specialYear.year] ??= []).push(specialYear.label);
    return labels;
  }, {}), [program]);
  const splitYears = segments.flatMap((segment) => Array.from(
    { length: Math.max(0, segment.endYear - segment.startYear) },
    (_, index) => segment.startYear + index + 1,
  ));
  const periodOperations = [
    ...splitYears.map((year) => ({ year, action: 'split' as const })),
    ...segments.slice(1)
      .filter((segment, index) => segments[index].definitionId === segment.definitionId)
      .map((segment) => ({ year: segment.startYear, action: 'merge' as const, segmentId: segment.id })),
  ].sort((left, right) => left.year - right.year);
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
  const comparisonCharts = [
    ['売上高', 'sales', 'money'], ['営業利益', 'operatingProfit', 'money'], ['従業員数（就業時間換算）', 'headcount', 'fte'], ['1人当たり給与', 'employeePayPerPerson', 'moneyPerPerson'], ['営業利益率', 'operatingProfitMargin', 'percent'], ['労働生産性', 'laborProductivity', 'moneyPerPerson'],
  ] as const;
  const activeChartDisplays = chartDisplayOrder.filter((item) => chartDisplays[item]);
  const activeBusinessDisplays = activeChartDisplays.filter((item): item is Scope => item !== 'comparison');
  const activeBusinessDisplayKey = activeBusinessDisplays.join(':');
  const comparisonVisible = chartDisplays.comparison;
  const chartDisplayLayout = activeChartDisplays.length === 1 ? 'single' : comparisonVisible && activeBusinessDisplays.length > 0 ? 'comparison-with-businesses' : 'multiple-businesses';
  const businessOverview = activeBusinessDisplays.length === 1;
  const toggleChartDisplay = (item: ChartDisplay) => setChartDisplays((current) => {
    const activeCount = chartDisplayOrder.filter((candidate) => current[candidate]).length;
    if (current[item] && activeCount === 1) return current;
    return { ...current, [item]: !current[item] };
  });
  const timelineByScope = { company, base, subsidy };
  const renderDetailCharts = (chartScope: Scope) => {
    const timeline = timelineByScope[chartScope];
    return charts.map((chart) => {
      const lines = chart.lines.map(([label, field], index) => ({ label, values: timeline.records.map((row) => Number(row[field] ?? NaN)), color: colors[index] }));
      return <MultiLineChart key={`${chartScope}-${chart.title}`} title={chart.title} subtitle={chart.subtitle} contextLabel={chartScope === 'base' ? undefined : scopeLabels[chartScope]} years={timeline.years} lines={lines} boundaries={boundaryYears} kind={chart.kind} unit={unit} editableFromYear={model.series[0].baseYear + 1} specialYearLabels={specialYearLabels} />;
    });
  };
  const renderComparisonCharts = () => comparisonCharts.map(([title, field, kind]) => <MultiLineChart key={title} title={title} subtitle="全社合算・ベース事業・補助事業" contextLabel="事業比較" years={company.years} lines={comparison(field)} boundaries={boundaryYears} kind={kind} unit={unit} editableFromYear={model.series[0].baseYear + 1} specialYearLabels={specialYearLabels} />);
  useEffect(() => {
    const content = chartScrollContentRef.current;
    const header = businessHeaderScrollRef.current;
    if (!content || !header) return;
    const syncHeader = () => { header.scrollLeft = content.scrollLeft; };
    syncHeader();
    content.addEventListener('scroll', syncHeader, { passive: true });
    return () => content.removeEventListener('scroll', syncHeader);
  }, [activeBusinessDisplayKey, view]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      const nextScope = ({ '1': 'company', '2': 'base', '3': 'subsidy' } as const)[event.key as '1' | '2' | '3'];
      const nextView = ({ '4': 'chart', '5': 'table' } as const)[event.key as '4' | '5'];
      if (!nextScope && !nextView) return;
      event.preventDefault();
      if (nextScope) setScope(nextScope);
      if (nextView) setView(nextView);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return <main className="mt-3 grid gap-3">
    <section data-testid="forecast-heading" className="border border-line bg-surface px-5 py-3">
      <div><p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold tracking-[.08em] text-orange"><SlidersHorizontal className="size-3" />FORECAST &amp; PL</p><h2 className="m-0 text-xl font-bold">将来予測・調整水準</h2></div>
    </section>
    <Tabs data-testid="forecast-workspace-tabs" value={view} onValueChange={(value) => setView(value as ForecastView)} className="gap-0" style={{ '--forecast-content-sticky-top': stickyStackOffsetCss('var(--app-toolbar-sticky-bottom)', operationLayer.height) } as CSSProperties}>
      <StickySurface ref={operationLayer.ref} data-testid="forecast-operation-sticky-layer" stickyTop="var(--app-toolbar-sticky-bottom)" layer="operation" className="grid">
      <section data-testid="forecast-operation-bar" className="flex min-w-0 items-center gap-2 overflow-x-auto border border-line bg-surface px-2 py-1.5 shadow-sm">
        <div data-testid="forecast-scope-shortcuts" className="flex shrink-0 flex-col items-center gap-0.5"><div className="flex rounded-lg bg-[#e8e6df] p-1" aria-label="対象事業">{(['company', 'base', 'subsidy'] as Scope[]).map((item) => <Button key={item} variant="ghost" size="sm" className={cn('h-7 px-2 text-[10px]', scope === item && 'bg-navy text-white hover:bg-navy/90 hover:text-white')} onClick={() => setScope(item)}>{scopeLabels[item]}</Button>)}</div><span className="text-[7px] leading-none text-muted-foreground">Ctrl+1 / 2 / 3</span></div>
        <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
        <div data-testid="forecast-view-shortcuts" className="flex shrink-0 flex-col items-center gap-0.5"><TabsList className="h-8"><TabsTrigger value="chart" className="text-[10px]"><BarChart3 />チャート</TabsTrigger><TabsTrigger value="table" className="text-[10px]"><Table2 />PL表</TabsTrigger></TabsList><span className="text-[7px] leading-none text-muted-foreground">Ctrl+4 / 5</span></div>
        <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
        <section data-testid="final-year-sales-allocation" className="flex w-[236px] shrink-0 items-center gap-1.5" title="入力した配分率は次回の最適化結果にのみ適用し、現在のPLは変更しません。">
          <span data-testid="final-year-allocation-title" className="flex shrink-0 flex-col items-center leading-none"><strong className="text-[9px]">最終年度配分</strong><small className="mt-1 text-[8px] text-muted-foreground">{finalYear}年</small></span>
          <label className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[8px] font-bold text-muted-foreground">ベース<NumberInput aria-label="ベース事業 配分率" className="h-7 w-[64px] shrink-0 text-right text-[10px] tabular-nums" min={0} max={100} step={0.01} value={baseShareDraft} emptyValue={null} onEmpty={clearBaseShare} placeholder="任意" onEditingStart={beginTransaction} onEditingEnd={commitTransaction} onValueChange={applyBaseShare} />% <span data-testid="current-base-share" className="inline-block w-[86px] shrink-0 font-normal tabular-nums">（現在 {currentBaseShareRounded.toFixed(2)}%）</span></label>
        </section>
        <OptimizationToolbar controller={optimization} compact />
      </section>
      <div data-testid="forecast-sticky-spacer" className="h-3 bg-canvas" aria-hidden="true" />
      </StickySurface>
    <div data-testid="forecast-layout" className="grid grid-cols-[clamp(320px,20vw,380px)_minmax(0,1fr)_clamp(250px,15vw,290px)] items-start gap-3">
      <StickyPanel
        ref={settingsPanel.ref}
        testIdPrefix="forecast-settings"
        stickyTop="var(--forecast-content-sticky-top)"
        headerClassName="px-2.5 py-2.5"
        bodyClassName="px-2.5 pb-2.5"
        header={<div className="flex items-center justify-between gap-2"><div><h3 className="m-0 text-base font-bold">水準設定</h3><p className="m-0 text-[10px] text-muted-foreground">{scope === 'company' ? '全社合算ではベース事業の水準を表示' : scopeLabels[scope]}・右端は開始時増減</p></div><span className="flex shrink-0 items-center gap-1"><Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[9px]" aria-label={variationOpen ? '変動設定を隠す' : '変動設定を表示'} aria-expanded={variationOpen} onClick={() => setVariationOverride(!variationOpen)}><ChevronDown className={cn('transition-transform', !variationOpen && '-rotate-90')} />変動設定</Button><Badge variant="outline">金額単位：{moneyUnitLabel(unit)}</Badge></span></div>}
      >
        {scope === 'company' && <p className="mb-2 rounded bg-soft p-2 text-[10px] text-muted-foreground">全社合算はベース事業と補助事業から自動計算します。水準を変更する場合は各事業へ切り替えてください。</p>}
        <div data-testid="forecast-period-grid" className="grid min-w-0 gap-2" style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(${settingsPeriodMinWidth(segments.length, variationOpen)}, 1fr))` }}>{segments.map((period, segmentIndex) => { const definitionLabel = program.definitions.periods.find((definition) => definition.id === period.definitionId)?.label ?? period.definitionId; const siblings = segments.filter((candidate) => candidate.definitionId === period.definitionId); const label = siblings.length > 1 ? `${definitionLabel}${siblings.indexOf(period) + 1}` : definitionLabel; return <section data-testid="forecast-period-column" key={period.id} className="min-w-0 bg-background"><StickySurface data-testid="forecast-period-header" stickyTop="0px" layer="panel" className="flex min-h-10 items-center justify-between gap-2 border-t-[3px] border-navy px-1.5 py-1 shadow-sm"><span className="flex min-w-0 items-center gap-2"><strong className="min-w-0 text-sm leading-tight">{label}</strong><span data-testid="forecast-period-years" className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">{period.startYear}–{period.endYear}</span></span>{segmentIndex > 0 && segments[segmentIndex - 1].definitionId === period.definitionId && <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1.5 text-[9px]" aria-label={`${period.startYear}年の期間分割を解除`} onClick={() => mergeForecastPeriod(period.id)}>解除</Button>}</StickySurface>{settings.map((series) => <SettingRow key={series.id} series={series} periodId={period.id} periodLabel={label} unit={unit} variationOpen={variationOpen} readOnly={scope === 'company'} />)}</section>; })}</div>
      </StickyPanel>
      <section className="min-w-0 border border-line bg-surface p-3">
          <TabsContent value="chart" className="mt-0">
            <StickySurface ref={chartDisplayLayer.ref} data-testid="forecast-chart-display-controls" stickyTop="var(--forecast-content-sticky-top)" layer="content" className="-mx-3 flex items-center justify-between gap-2 border-b border-line px-3 py-2 shadow-sm">
              <strong className="text-xs">表示区分</strong>
              <div className="flex flex-wrap items-center justify-end gap-1"><div aria-label="チャート表示区分" className="flex flex-wrap justify-end gap-1">{chartDisplayOrder.map((item) => {
                const enabled = chartDisplays[item];
                return <Button key={item} variant={enabled ? 'default' : 'outline'} size="sm" className="h-7 gap-1.5 px-2 text-[10px]" aria-pressed={enabled} aria-label={`${chartDisplayLabels[item]}を${enabled ? '非表示' : '表示'}`} disabled={enabled && activeChartDisplays.length === 1} onClick={() => toggleChartDisplay(item)}><span>{chartDisplayLabels[item]}</span><small className="text-[8px] opacity-70">{enabled ? 'ON' : 'OFF'}</small></Button>;
              })}</div><span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden="true" /><div className="flex shrink-0 items-center gap-1" aria-label="期間分割操作">{periodOperations.map((operation) => operation.action === 'split'
                ? <Button key={operation.year} variant="outline" size="sm" className="h-7 w-10 px-1 text-[9px]" aria-label={`${operation.year}年から期間を分割`} onClick={() => splitForecastAtYear(operation.year)}>＋ '{String(operation.year).slice(-2)}</Button>
                : <Button key={operation.year} variant="outline" size="sm" className="h-7 w-10 px-1 text-[9px] text-orange" aria-label={`${operation.year}年の期間分割を解除`} onClick={() => mergeForecastPeriod(operation.segmentId)}>− '{String(operation.year).slice(-2)}</Button>)}</div></div>
            </StickySurface>
            <div data-testid="forecast-chart-sections" data-layout={chartDisplayLayout} className="grid items-start gap-3" style={{ '--forecast-section-sticky-top': stickyStackOffsetCss('var(--forecast-content-sticky-top)', chartDisplayLayer.height) } as CSSProperties}>
              {comparisonVisible && <section data-testid="forecast-chart-section" data-scope="comparison" className="min-w-0">
                <div data-testid="forecast-comparison-section" data-placement="full-width" className="bg-surface">
                  <StickySurface data-testid="forecast-comparison-sticky-header" stickyTop="var(--forecast-section-sticky-top)" layer="section" className="flex items-center justify-between gap-2 border-t-2 border-orange py-1.5 shadow-sm"><h3 className="m-0 text-sm font-bold">事業比較</h3><span className="text-[9px] text-muted-foreground">{comparisonCharts.length}チャート・全社合算／ベース事業／補助事業</span></StickySurface>
                  <div data-testid="forecast-comparison-chart-list" data-layout="overview" className="grid grid-cols-3 items-start gap-2">{renderComparisonCharts()}</div>
                </div>
              </section>}
              {activeBusinessDisplays.length > 0 && <>
                <StickySurface ref={businessHeaderScrollRef} data-testid="forecast-business-sticky-headers" stickyTop="var(--forecast-section-sticky-top)" layer="section" className="overflow-hidden shadow-sm">
                  <div className="grid items-start gap-2" style={{ gridTemplateColumns: businessOverview ? 'minmax(0, 1fr)' : `repeat(${activeBusinessDisplays.length}, minmax(220px, 1fr))`, minWidth: businessOverview ? undefined : `${activeBusinessDisplays.length * 220}px` }}>
                    {activeBusinessDisplays.map((item) => <header key={item} data-testid="forecast-business-sticky-header" className="flex items-center justify-between gap-2 border-t-2 border-navy px-0.5 py-1"><h3 className="m-0 text-sm font-bold">{chartDisplayLabels[item]}</h3><span className="text-[9px] text-muted-foreground">{charts.length}チャート</span></header>)}
                  </div>
                </StickySurface>
                <SyncedHorizontalScrollbar contentRef={chartScrollContentRef} contentKey={activeBusinessDisplays.join(':')} />
                <div ref={chartScrollContentRef} data-testid="forecast-chart-scroll-content" className="overflow-x-auto pb-5">
                  <div data-testid="forecast-business-columns" data-orientation="horizontal" className="grid items-start gap-2 pb-1" style={{ gridTemplateColumns: businessOverview ? 'minmax(0, 1fr)' : `repeat(${activeBusinessDisplays.length}, minmax(220px, 1fr))` }}>
                    {activeBusinessDisplays.map((item) => <section key={item} data-testid="forecast-chart-section" data-scope={item} className="min-w-0 pt-1.5">
                      <div data-testid="forecast-business-chart-list" data-layout={businessOverview ? 'overview' : 'column'} className={cn('grid items-start gap-2', businessOverview ? 'grid-cols-3' : 'grid-cols-1')}>{renderDetailCharts(item)}</div>
                    </section>)}
                  </div>
                </div>
              </>}
            </div>
          </TabsContent>
          <TabsContent value="table" className="mt-0"><FinancialTable testId="forecast-pl-table" title={`${scopeLabels[scope]} P/L`} years={selected.years} yearLabels={yearLabels} records={selected.records} rows={forecastPlRows} moneyUnit={unit} editableFromIndex={baseActuals.length} stickyHeaderTop="var(--forecast-content-sticky-top)" stickyHeaderLayer="content" onRowSelect={(row) => setSelectedLogicCode(row.code)} onEditStart={beginTransaction} onEditEnd={commitTransaction} onValueChange={scope === 'company' ? undefined : (yearIndex, row, value) => applyForecastPlValues([{ yearIndex, row, value }])} onValuesChange={scope === 'company' ? undefined : applyForecastPlValues} /><div data-testid="forecast-logic-link" className="mt-2 flex min-w-0 items-center justify-between gap-2 rounded border border-line bg-soft px-3 py-2"><span className="min-w-0 truncate text-[10px] text-muted-foreground"><strong className="text-navy">{selectedLogic.code} {selectedLogic.label}</strong> の計算式・参照元・影響先</span><Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 text-[10px]" aria-label={`${selectedLogic.label}を04ロジックマップで確認`} onClick={() => onOpenLogicMap?.(selectedLogic.code)}><Workflow className="size-3.5" />04ロジックマップで確認</Button></div></TabsContent>
      </section>
      <MetricsPanel company={company} base={base} subsidy={subsidy} optimization={optimization} />
    </div>
    </Tabs>
  </main>;
}
