import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { StickyPanel } from '../../components/ui/sticky-panel';
import { Input } from '../../components/ui/input';
import { NumberInput } from '../../components/ui/number-input';
import { Slider } from '../../components/ui/slider';
import { Textarea } from '../../components/ui/textarea';
import { evaluateManagementMetric, resolveMetricTarget } from '../../domain/metrics';
import { metricAttainmentColor, metricAttainmentScore } from '../../domain/metric-attainment';
import { applyOptimizationExpansionPlan, applyOptimizationStrength, inferOptimizationStrength, type OptimizationProposal, type OptimizationRangeMode, type OptimizationStrategy } from '../../domain/optimization';
import type { HistoricalPlCalculated, ManagementMetricDefinition, ProgramConfiguration } from '../../domain/types';
import { useModelStore } from '../../store/model-store-context';
import { calculateMetricOptimization, calculateMetricOptimizationExpansion } from './optimization-worker-client';

type Timeline = { years: number[]; records: HistoricalPlCalculated[] };

const strategyLabels: Record<OptimizationStrategy, string> = { 'minimum-change': '最小変更', balanced: 'バランス', sparse: '最少項目', priority: '優先順位' };
const strategyDescriptions: Record<OptimizationStrategy, string> = {
  'minimum-change': '目標達成に必要な変更を複数の水準へ分散',
  balanced: '一つの水準へ変更が集中しないよう最大変更率を抑制',
  sparse: '目標改善効率の高い水準を選び、変更する項目数を抑制',
  priority: '水準設定の上から順に、必要なところまで調整',
};

function position(value: number, min: number, max: number) { return Math.max(0, Math.min(100, (value - min) / (max - min || 1) * 100)); }

function MetricBullet({ metric, timeline, editing }: { metric: ManagementMetricDefinition; timeline: Timeline; editing: boolean }) {
  const program = useModelStore((state) => state.program);
  const metricInputs = useModelStore((state) => state.actuals.metricInputs);
  const balanceSheets = useModelStore((state) => state.actuals.balanceSheets);
  const updateMetricActual = useModelStore((state) => state.updateMetricActual);
  const companyTargets = useModelStore((state) => state.caseSettings.metricTargets);
  const updateMetricTarget = useModelStore((state) => state.updateMetricTarget);
  const replaceProgram = useModelStore((state) => state.replaceProgram);
  const source = useMemo(() => ({ records: new Map(timeline.years.map((year, index) => [year, timeline.records[index]])), balanceSheets: new Map(balanceSheets.map((record, index) => [program.timeline.historical.startYear + index, record])), actualInputs: metricInputs }), [balanceSheets, metricInputs, program.timeline.historical.startYear, timeline]);
  const result = evaluateManagementMetric(metric, program, source);
  const current = result.value;
  const target = resolveMetricTarget(metric, companyTargets[metric.id]);
  const finiteCurrent = Number.isFinite(current);
  const rawMin = Math.min(0, target.programTarget, target.effectiveTarget, finiteCurrent ? current! : 0);
  const rawMax = Math.max(0, target.programTarget, target.effectiveTarget, finiteCurrent ? current! : 0);
  const padding = Math.max((rawMax - rawMin) * .18, Math.abs(target.effectiveTarget) * .1, 1);
  const min = rawMin < 0 ? rawMin - padding : 0;
  const max = rawMax + padding;
  const programTargetPosition = position(target.programTarget, min, max);
  const companyTargetPosition = target.companyTarget === undefined ? undefined : position(target.companyTarget, min, max);
  const currentPosition = finiteCurrent ? position(current!, min, max) : 0;
  const attainmentScore = metricAttainmentScore(metric.direction, current ?? NaN, target.effectiveTarget);
  const attainmentColor = metricAttainmentColor(attainmentScore);
  const definition = metric.timePoints.map((point) => `${result.years[point.id] ?? '—'}`).join('→');
  const compactUnit = metric.outputUnit.replace(/\s*\/\s*/g, '/');
  const definitionWithUnit = `${definition}${compactUnit ? ` · ${compactUnit}` : ''}`;
  const updateMetric = (mutate: (draft: ManagementMetricDefinition) => void) => { const draft = structuredClone(program); const index = draft.definitions.managementMetrics.findIndex((candidate) => candidate.id === metric.id); if (index >= 0) { mutate(draft.definitions.managementMetrics[index]); replaceProgram(draft); } };
  const anchorValue = (point: ManagementMetricDefinition['timePoints'][number]) => point.anchor.type === 'historicalEnd' ? 'historicalEnd' : point.anchor.type === 'specialYear' ? `specialYear:${point.anchor.specialYearId}` : `${point.anchor.type}:${point.anchor.periodId}`;
  const decodeAnchor = (value: string) => { const [type, id] = value.split(':'); if (type === 'historicalEnd') return { type: 'historicalEnd' as const }; if (type === 'specialYear') return { type: 'specialYear' as const, specialYearId: id }; return { type: type as 'periodStart' | 'periodEnd', periodId: id }; };
  return <article data-testid={`metric-bullet-${metric.id}`} data-reference={metric.optimization === 'fixed' ? 'fixed' : 'adjustable'} className={`border-t border-line px-1 py-1.5 ${metric.enabled ? '' : 'opacity-40'}`}>
    <div data-testid="metric-bullet-layout" className="grid grid-cols-[minmax(92px,0.88fr)_minmax(84px,0.72fr)] items-center gap-1.5">
      <div className="min-w-0"><div data-testid="metric-title-row" className="min-w-0"><strong className="min-w-0 break-words text-[12px] leading-tight">{metric.label}</strong></div><small data-testid="metric-meta-row" className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] leading-tight text-muted-foreground"><span data-testid="metric-scope-badge" className="shrink-0 rounded-full border border-line px-1 py-0 text-[8px]">{metric.scope === 'company' ? '全社' : metric.scope === 'base' ? 'ベース' : '補助'}</span><span className="min-w-0 truncate">{definitionWithUnit}</span>{metric.optimization === 'fixed' && <span className="shrink-0 font-bold text-orange">固定</span>}</small></div>
      <div className="min-w-0 self-center">
        <div className="mb-0.5 grid grid-cols-2 gap-1 text-[9px] font-bold leading-tight"><span className="min-w-0 break-words" style={{ color: attainmentColor }}>現在 {finiteCurrent ? current!.toFixed(1) : result.status === 'missing-actual' ? '実績未入力' : '計算不可'}</span><span className="min-w-0 break-words text-right text-orange">{target.companyTarget === undefined ? '制度' : target.effectiveTarget === target.companyTarget ? '個社' : '実効'}{metric.direction === 'min' ? '≥' : '≤'} {target.effectiveTarget}</span></div>
        <div className="relative h-2 rounded-full bg-[#e7e4dc]">
          {finiteCurrent && <div data-testid={`metric-bullet-bar-${metric.id}`} data-attainment-score={attainmentScore ?? undefined} className={`${metric.optimization === 'fixed' ? 'border-2 bg-transparent' : ''} absolute inset-y-0 left-0 rounded-full`} style={{ width: `${currentPosition}%`, backgroundColor: metric.optimization === 'fixed' ? 'transparent' : attainmentColor, borderColor: metric.optimization === 'fixed' ? attainmentColor : undefined }} />}
          <i data-testid={`metric-program-target-${metric.id}`} aria-label={`制度目標 ${target.programTarget}`} className={`absolute -top-1 h-4 w-0.5 ${target.companyTarget === undefined ? 'bg-orange' : 'bg-navy/55'}`} style={{ left: `${programTargetPosition}%` }} />
          {companyTargetPosition !== undefined && <i data-testid={`metric-company-target-${metric.id}`} aria-label={`個社目標 ${target.companyTarget}`} className="absolute -top-1 h-4 w-0.5 bg-orange" style={{ left: `${companyTargetPosition}%` }} />}
        </div>
        {target.companyTarget !== undefined && <small className="mt-0.5 block truncate text-[8px] text-muted-foreground">制度 {target.programTarget} / 個社 {target.companyTarget}</small>}
      </div>
    </div>
    {editing && <div className="mt-2 grid gap-2 border-t border-dashed border-line pt-2 text-[9px]"><div className="grid grid-cols-2 gap-2"><label className="font-bold text-muted-foreground">対象範囲<select aria-label={`${metric.label} 対象範囲`} className="mt-1 h-7 w-full rounded border border-input bg-surface px-1" value={metric.scope} onChange={(event) => updateMetric((draft) => { draft.scope = event.target.value as ManagementMetricDefinition['scope']; })}><option value="company">全社</option><option value="base">ベース事業</option><option value="subsidy">補助事業</option></select></label><label className="font-bold text-muted-foreground">個社目標 <span className="font-normal">（制度 {metric.target}）</span><NumberInput aria-label={`${metric.label} 個社目標`} className="mt-1 h-7 text-right text-xs" step="0.1" value={target.companyTarget ?? null} emptyValue={null} placeholder={`制度 ${metric.target}`} onValueChange={(value) => updateMetricTarget(metric.id, value)} onEmpty={() => updateMetricTarget(metric.id, null)} /></label></div>{metric.timePoints.map((point, pointIndex) => <div key={point.id} className="grid grid-cols-[18px_1fr_54px_22px] items-end gap-1"><strong className="self-center text-teal">{point.id}</strong><label className="font-bold text-muted-foreground">基準時点<select aria-label={`${metric.label} 時点${point.id} 基準時点`} className="mt-1 h-7 w-full rounded border border-input bg-surface px-1" value={anchorValue(point)} onChange={(event) => updateMetric((draft) => { draft.timePoints[pointIndex].anchor = decodeAnchor(event.target.value); })}><option value="historicalEnd">過去実績・終了年</option>{program.definitions.specialYears.map((year) => <option key={year.id} value={`specialYear:${year.id}`}>{year.label}</option>)}{program.definitions.periods.flatMap((period) => [<option key={`${period.id}-start`} value={`periodStart:${period.id}`}>{period.label}・開始年</option>, <option key={`${period.id}-end`} value={`periodEnd:${period.id}`}>{period.label}・終了年</option>])}</select></label><label className="font-bold text-muted-foreground">±年<NumberInput aria-label={`${metric.label} 時点${point.id} 調整年数`} className="mt-1 h-7 px-1" value={point.offset} onValueChange={(value) => updateMetric((draft) => { draft.timePoints[pointIndex].offset = value; })} /></label><Button variant="ghost" size="sm" className="h-7 px-1" disabled={metric.timePoints.length <= 1} aria-label={`${metric.label} 時点${point.id}を削除`} onClick={() => updateMetric((draft) => { draft.timePoints.splice(pointIndex, 1); })}>×</Button></div>)}<Button variant="outline" size="sm" className="h-7" onClick={() => updateMetric((draft) => { const used = new Set(draft.timePoints.map((point) => point.id)); const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((candidate) => !used.has(candidate)) ?? `P${draft.timePoints.length + 1}`; draft.timePoints.push({ id, anchor: { type: 'historicalEnd' }, offset: 0 }); })}>＋ 時点</Button><label className="font-bold text-muted-foreground">計算式<Textarea aria-label={`${metric.label} 計算式`} className="mt-1 min-h-16 text-[9px]" value={metric.formula} onChange={(event) => updateMetric((draft) => { draft.formula = event.target.value; })} /></label><label className="font-bold text-muted-foreground">出力単位<Input aria-label={`${metric.label} 出力単位`} className="mt-1 h-7" value={metric.outputUnit} onChange={(event) => updateMetric((draft) => { draft.outputUnit = event.target.value; })} /></label>{metric.requiresActualInput && <label className="font-bold text-muted-foreground">最新決算期実績<NumberInput aria-label={`${metric.label} 実績値`} className="mt-1 h-7 text-right text-xs" step="0.1" value={metricInputs[metric.id]} onValueChange={(value) => updateMetricActual(metric.id, value)} /></label>}</div>}
  </article>;
}

function FeasibilityReport({ proposal, program, rangeMode, isExpansionSearching }: {
  proposal: OptimizationProposal;
  program: ProgramConfiguration;
  rangeMode: OptimizationRangeMode;
  isExpansionSearching: boolean;
}) {
  if (proposal.feasibility === 'feasible') return null;
  const unavailable = proposal.metricDiagnostics.filter((metric) => metric.status === 'unavailable');
  const unmet = proposal.metricDiagnostics.filter((metric) => metric.status === 'unmet');
  return <section data-testid="optimization-feasibility-report" className="mt-3 rounded border border-orange/45 bg-orange/5 p-2.5 text-[10px]">
    <strong className="block text-[12px] text-orange">{proposal.feasibility === 'unavailable' ? '指標を計算できないため最適化不能' : '目標未達の詳細'}</strong>
    {proposal.feasibility === 'infeasible' && <p className="mt-0.5 mb-0 text-muted-foreground">{isExpansionSearching ? '現在のMin・Max内では目標未達です。Min・Max超過にペナルティを付けた水準外探索を続けています。' : rangeMode === 'outside-levels' ? '今回の数値探索では達成解を確認できませんでした。これは数学的な達成不能を意味しません。探索済みの最良案と必要な水準範囲を表示します。' : '現在のMin・Max内では目標未達です。水準外最適化へ切り替えると、Min・Maxを推奨範囲として扱い、必要な範囲を追加探索できます。'}</p>}
    {unavailable.length > 0 && <div className="mt-2"><b>計算できない指標</b>{unavailable.map((metric) => <div key={metric.id} className="mt-1 border-t border-orange/20 pt-1">{metric.label}</div>)}</div>}
    {unmet.length > 0 && <div className="mt-2"><b>未達の指標</b>{unmet.map((metric) => <div key={metric.id} className="mt-1 border-t border-orange/20 pt-1"><strong>{metric.label}</strong><div>最大限調整した場合の値：{metric.value?.toFixed(2)} {metric.unit}</div><div>目標：{metric.direction === 'min' ? '≥' : '≤'} {metric.target} {metric.unit}</div><div>目標との差：{metric.gap?.toFixed(2)} {metric.unit}</div></div>)}</div>}
    {isExpansionSearching ? <div className="mt-2 flex items-center gap-2 rounded border border-teal/30 bg-teal/5 p-2 text-teal" role="status"><LoaderCircle data-testid="expansion-search-spinner" className="animate-spin will-change-transform [animation-duration:850ms]" aria-hidden="true" /><div><b className="block">水準外最適化を追加探索中…</b><small>ドメイン制約を守りながら、Min・Max外の候補を段階的に検証しています。</small></div></div> : proposal.expansionPlan ? <div className="mt-2 rounded border border-orange/35 bg-surface p-2" data-testid="optimization-expansion-plan"><div className="flex items-center justify-between gap-2"><b>推奨水準範囲</b><span className={`rounded px-1.5 py-0.5 font-bold ${proposal.expansionPlan.status === 'feasible' ? 'bg-teal/10 text-teal' : 'bg-orange/10 text-orange'}`}>{proposal.expansionPlan.status === 'feasible' ? '全目標を達成見込み' : '探索済みの最良案'}</span></div><p className="mt-1 mb-0 text-muted-foreground">元のMin・Maxからの超過へペナルティを付け、PLと全指標を再計算して得た組合せです。</p>{proposal.expansionPlan.entries.map((entry) => {
      const periodLabel = program.definitions.periods.find((period) => period.id === entry.periodId)?.label ?? entry.periodId;
      const boundaryLabel = entry.boundary === 'max' ? '上限' : '下限';
      return <div key={`${entry.seriesId}-${entry.periodId}-${entry.boundary}`} className="mt-1 border-t border-line pt-1"><strong>{entry.seriesLabel} / {periodLabel}</strong><div>{boundaryLabel}：{entry.before.toFixed(2)} → <strong className="text-orange">{entry.after.toFixed(2)}</strong></div>{entry.affectedMetricLabels.length > 0 && <small className="text-muted-foreground">主に改善：{entry.affectedMetricLabels.join('、')}</small>}</div>;
    })}<p className="mt-2 mb-0 rounded bg-teal/5 px-2 py-1 text-teal">このMin・Maxと最適水準は水準外最適化の実行時に適用済みです。適用率スライダーで最適化前まで戻して比較できます。</p></div> : proposal.feasibility === 'infeasible' && rangeMode === 'outside-levels' && <p className="mt-2 mb-0 text-muted-foreground">現在の数値探索では、有効な水準範囲を特定できませんでした。</p>}
  </section>;
}

export function useForecastOptimization() {
  const [strategy, setStrategy] = useState<OptimizationStrategy>('minimum-change');
  const [rangeMode, setRangeMode] = useState<OptimizationRangeMode>('within-levels');
  const [proposal, setProposal] = useState<OptimizationProposal>();
  const [strength, setStrength] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isExpansionSearching, setIsExpansionSearching] = useState(false);
  const [applicationResult, setApplicationResult] = useState<string[]>();
  const calculationGeneration = useRef(0);
  const program = useModelStore((state) => state.program);
  const forecast = useModelStore((state) => state.forecast);
  const actuals = useModelStore((state) => state.actuals);
  const metricTargets = useModelStore((state) => state.caseSettings.metricTargets);
  const replaceForecast = useModelStore((state) => state.replaceForecast);
  const begin = useModelStore((state) => state.beginTransaction);
  const commit = useModelStore((state) => state.commitTransaction);
  useEffect(() => {
    if (!proposal) return;
    const restoredStrength = inferOptimizationStrength(proposal, forecast);
    setStrength((current) => current === restoredStrength ? current : restoredStrength);
  }, [forecast, proposal]);
  const invalidateProposal = () => {
    calculationGeneration.current += 1;
    setProposal(undefined);
    setStrength(0);
    setApplicationResult(undefined);
    setIsOptimizing(false);
    setIsExpansionSearching(false);
  };
  const calculateProposal = (sourceForecast: typeof forecast) => {
    const generation = ++calculationGeneration.current;
    setIsOptimizing(true);
    setIsExpansionSearching(false);
    setProposal(undefined);
    setStrength(0);
    window.setTimeout(async () => {
      try {
        const input = { model: sourceForecast, program, baseActuals: actuals.basePl, subsidyActuals: actuals.subsidyPl, actualInputs: actuals.metricInputs, metricTargets, strategy, rangeMode };
        const initial = await calculateMetricOptimization(input);
        if (generation !== calculationGeneration.current) return;
        setProposal(initial);
        if (initial.feasibility === 'infeasible' && rangeMode === 'outside-levels') {
          setIsExpansionSearching(true);
          // A separate worker keeps the progress indicator and strength slider
          // responsive while the CPU-heavy expansion search is running.
          window.setTimeout(async () => {
            try {
              const expansionPlan = await calculateMetricOptimizationExpansion(input, initial);
              if (generation !== calculationGeneration.current) return;
              if (!expansionPlan) return;
              const proposalWithExpansion = { ...initial, expansionPlan };
              const expanded = applyOptimizationExpansionPlan(proposalWithExpansion);
              const applied = expansionPlan.entries.map((entry) => {
                const period = program.definitions.periods.find((candidate) => candidate.id === entry.periodId)?.label ?? entry.periodId;
                return `${entry.seriesLabel}／${period} ${entry.boundary === 'max' ? '上限' : '下限'} ${entry.before.toFixed(2)} → ${entry.after.toFixed(2)}`;
              });
              const optimizedInExpandedRange = await calculateMetricOptimization({ ...input, model: expanded });
              if (generation !== calculationGeneration.current) return;
              const completedProposal = { ...optimizedInExpandedRange, expansionPlan };
              begin();
              replaceForecast(applyOptimizationStrength(completedProposal, 100));
              commit();
              setApplicationResult(applied);
              setProposal(completedProposal);
              setStrength(100);
            } finally {
              if (generation === calculationGeneration.current) setIsExpansionSearching(false);
            }
          }, 500);
        }
      } finally {
        if (generation === calculationGeneration.current) setIsOptimizing(false);
      }
    }, 0);
  };
  const createProposal = () => {
    setApplicationResult(undefined);
    calculateProposal(forecast);
  };
  const apply = (nextStrength: number) => {
    begin();
    setStrength(nextStrength);
    if (proposal) replaceForecast(applyOptimizationStrength(proposal, nextStrength));
  };
  return { strategy, setStrategy, rangeMode, setRangeMode, proposal, strength, isOptimizing, isExpansionSearching, applicationResult, createProposal, apply, commit, invalidateProposal };
}

export type ForecastOptimizationController = ReturnType<typeof useForecastOptimization>;

export function OptimizationToolbar({ controller, compact = false }: { controller: ForecastOptimizationController; compact?: boolean }) {
  const { strategy, setStrategy, rangeMode, setRangeMode, proposal, strength, isOptimizing, isExpansionSearching, createProposal, apply, commit, invalidateProposal } = controller;
  const createButtonContent = isOptimizing ? <><LoaderCircle data-testid="optimization-spinner" className="animate-spin will-change-transform [animation-duration:850ms]" aria-hidden="true" /><span role="status">水準案を計算中…</span></> : isExpansionSearching ? <><LoaderCircle className="animate-spin will-change-transform [animation-duration:850ms]" aria-hidden="true" />水準外を探索中…</> : compact ? '水準案を作成' : '目標を満たす水準案を作成';
  if (compact) return <section data-testid="forecast-optimization-toolbar" data-layout="compact" className="flex shrink-0 items-center gap-1.5 border-l border-line pl-2">
    <label className="flex shrink-0 items-center gap-1 text-[8px] font-bold text-muted-foreground">方法<select aria-label="最適化方法" className="h-7 w-[82px] rounded border border-input bg-surface px-1.5 text-[9px]" value={strategy} onChange={(event) => { setStrategy(event.target.value as OptimizationStrategy); invalidateProposal(); }}><option value="minimum-change">最小変更</option><option value="balanced">バランス</option><option value="sparse">最少項目</option><option value="priority">優先順位</option></select></label>
    <label className="flex shrink-0 items-center gap-1 text-[8px] font-bold text-muted-foreground">範囲<select aria-label="探索範囲" className="h-7 w-[98px] rounded border border-input bg-surface px-1.5 text-[9px]" value={rangeMode} onChange={(event) => { setRangeMode(event.target.value as OptimizationRangeMode); invalidateProposal(); }}><option value="within-levels">水準内最適化</option><option value="outside-levels">水準外最適化</option></select></label>
    <Button className="h-7 min-w-0 whitespace-nowrap px-2 text-[9px]" aria-label="目標を満たす水準案を作成" disabled={isOptimizing || isExpansionSearching} aria-busy={isOptimizing || isExpansionSearching} onClick={createProposal}>{createButtonContent}</Button>
    {proposal && <label className="grid w-[170px] shrink-0 grid-cols-[auto_minmax(70px,1fr)_28px] items-center gap-1 text-[8px] font-bold">適用率<Slider aria-label="最適化方向の適用率" data-testid="optimization-strength-control" className="h-7 cursor-pointer [&_[data-slot=slider-thumb]]:size-5" min={0} max={100} step={1} value={[strength]} onPointerCancel={commit} onLostPointerCapture={commit} onValueChange={(values) => apply(values[0] ?? 0)} onValueCommit={commit} onBlur={commit} /><b className="text-right text-orange">{strength}%</b></label>}
    <a aria-label="最適化方法の詳しい説明" className="shrink-0 text-[9px] font-bold text-teal underline underline-offset-2" href="./docs/optimization-methods.html" target="_blank" rel="noreferrer">説明</a>
  </section>;
  return <section data-testid="forecast-optimization-toolbar" className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(105px,1fr))] items-end gap-2 overflow-hidden rounded border border-line bg-background p-2">
    <label className="min-w-0 text-[9px] font-bold text-muted-foreground">最適化方法<select aria-label="最適化方法" className="mt-0.5 h-7 w-full min-w-0 rounded border border-input bg-surface px-2 text-[10px]" value={strategy} onChange={(event) => { setStrategy(event.target.value as OptimizationStrategy); invalidateProposal(); }}><option value="minimum-change">最小変更</option><option value="balanced">バランス</option><option value="sparse">最少項目</option><option value="priority">優先順位</option></select></label>
    <label className="min-w-0 text-[9px] font-bold text-muted-foreground">探索範囲<select aria-label="探索範囲" className="mt-0.5 h-7 w-full min-w-0 rounded border border-input bg-surface px-2 text-[10px]" value={rangeMode} onChange={(event) => { setRangeMode(event.target.value as OptimizationRangeMode); invalidateProposal(); }}><option value="within-levels">水準内最適化</option><option value="outside-levels">水準外最適化</option></select></label>
    <Button className="h-7 w-full min-w-0 overflow-hidden whitespace-nowrap px-2 text-[10px]" disabled={isOptimizing || isExpansionSearching} aria-busy={isOptimizing || isExpansionSearching} onClick={createProposal}>{createButtonContent}</Button>
    <div className="col-span-full flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-1.5"><span className="min-w-0 text-[9px] text-muted-foreground">{rangeMode === 'within-levels' ? 'Min・Max内' : 'Min・Max外も探索'}・{strategyDescriptions[strategy]}</span><a className="shrink-0 text-[9px] font-bold text-teal underline underline-offset-2" href="./docs/optimization-methods.html" target="_blank" rel="noreferrer">最適化方法の詳しい説明</a>{proposal && <label className="ml-auto grid min-w-[210px] flex-1 grid-cols-[auto_minmax(100px,1fr)_32px] items-center gap-2 text-[9px] font-bold">適用率<Slider aria-label="最適化方向の適用率" data-testid="optimization-strength-control" className="h-7 cursor-pointer [&_[data-slot=slider-thumb]]:size-5" min={0} max={100} step={1} value={[strength]} onPointerCancel={commit} onLostPointerCapture={commit} onValueChange={(values) => apply(values[0] ?? 0)} onValueCommit={commit} onBlur={commit} /><b className="text-right text-orange">{strength}%</b></label>}</div>
  </section>;
}

export function MetricsPanel({ company, base, subsidy, optimization }: { company: Timeline; base: Timeline; subsidy: Timeline; optimization: ForecastOptimizationController }) {
  const [editing, setEditing] = useState(false);
  const { proposal, rangeMode, isExpansionSearching, applicationResult } = optimization;
  const metrics = useModelStore((state) => state.program.definitions.managementMetrics);
  const program = useModelStore((state) => state.program);
  return <StickyPanel
    testIdPrefix="forecast-metrics"
    stickyTop="var(--forecast-content-sticky-top)"
    scrollMode="always"
    headerClassName="px-2 py-2 pr-3"
    bodyClassName="p-2 pr-3"
    bodyStyle={{ scrollbarGutter: 'stable' }}
    header={<div className="flex items-center justify-between gap-2"><div><h3 className="m-0 text-base font-bold">経営指標・目標</h3><p className="m-0 text-[10px] text-muted-foreground">制度式で全社・事業別を同時評価</p></div><Button variant={editing ? 'default' : 'outline'} size="sm" onClick={() => setEditing((value) => !value)}>{editing ? '編集完了' : 'すべて編集'}</Button></div>}
  >
      <div>{metrics.map((metric) => <MetricBullet key={metric.id} metric={metric} editing={editing} timeline={metric.scope === 'company' ? company : metric.scope === 'base' ? base : subsidy} />)}</div>
      {proposal && <section data-testid="optimization-proposal" className="mt-3 border-t-[3px] border-orange bg-background p-3">
      <div data-testid="optimization-status-summary" aria-live="polite" className={`mb-2 flex items-center justify-between rounded px-2 py-1.5 text-[11px] font-bold ${proposal.feasibility === 'feasible' ? 'bg-teal/10 text-teal' : 'bg-orange/10 text-orange'}`}><span>{proposal.feasibility === 'feasible' ? '目標達成' : proposal.feasibility === 'infeasible' ? '目標未達' : '評価不能'}</span><span className="text-[9px] font-normal">{proposal.feasibility === 'feasible' ? '選択した探索範囲で達成できます' : proposal.feasibility === 'infeasible' ? rangeMode === 'within-levels' ? '現在のMin・Max内の最良案' : '水準外の候補も探索中／探索済み' : '必要な実績値を確認してください'}</span></div>
      {applicationResult && <section data-testid="optimization-application-result" aria-live="polite" className="mt-2 rounded border border-teal/40 bg-teal/5 p-2 text-[10px] text-teal"><strong>水準外最適化を完了しました（{applicationResult.length}項目）</strong><p className="my-1 text-muted-foreground">1回の実行で必要な上限・下限と最適水準を100%適用しました。スライダーで最適化前まで戻して比較できます。</p>{applicationResult.slice(0, 3).map((line) => <div key={line} className="border-t border-teal/15 py-0.5">{line}</div>)}{applicationResult.length > 3 && <small>ほか{applicationResult.length - 3}項目</small>}</section>}
      <FeasibilityReport proposal={proposal} program={program} rangeMode={rangeMode} isExpansionSearching={isExpansionSearching} />
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3"><strong className="text-sm">最適化方向・{strategyLabels[proposal.strategy]}</strong><span className="text-[10px] text-muted-foreground">PLは適用率で段階反映</span></div>
      <div className="mt-2 max-h-32 overflow-y-auto">{proposal.changes.map((change) => <div key={`${change.seriesId}-${change.periodId}`} className="grid grid-cols-[1fr_48px] items-center border-t border-line py-1 text-[9px]"><span>{change.seriesId} / {change.periodId}</span><strong className={change.direction === 'up' ? 'text-teal' : 'text-orange'}>{change.direction === 'up' ? '↗' : '↘'} {Math.abs(change.delta).toFixed(1)}</strong></div>)}</div>
      </section>}
  </StickyPanel>;
}
