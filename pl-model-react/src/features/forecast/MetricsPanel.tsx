import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Slider } from '../../components/ui/slider';
import { Textarea } from '../../components/ui/textarea';
import { evaluateManagementMetric } from '../../domain/metrics';
import { metricAttainmentColor, metricAttainmentScore } from '../../domain/metric-attainment';
import { applyOptimizationStrength, createMetricOptimizationProposal, type OptimizationProposal } from '../../domain/optimization';
import type { HistoricalPlCalculated, ManagementMetricDefinition } from '../../domain/types';
import { useModelStore } from '../../store/model-store-context';

type Timeline = { years: number[]; records: HistoricalPlCalculated[] };

function position(value: number, min: number, max: number) { return Math.max(0, Math.min(100, (value - min) / (max - min || 1) * 100)); }

function MetricBullet({ metric, timeline, editing }: { metric: ManagementMetricDefinition; timeline: Timeline; editing: boolean }) {
  const program = useModelStore((state) => state.program);
  const metricInputs = useModelStore((state) => state.actuals.metricInputs);
  const updateMetricActual = useModelStore((state) => state.updateMetricActual);
  const replaceProgram = useModelStore((state) => state.replaceProgram);
  const source = useMemo(() => ({ records: new Map(timeline.years.map((year, index) => [year, timeline.records[index]])), actualInputs: metricInputs }), [metricInputs, timeline]);
  const result = evaluateManagementMetric(metric, program, source);
  const current = result.value;
  const finiteCurrent = Number.isFinite(current);
  const rawMin = Math.min(0, metric.target, finiteCurrent ? current! : 0);
  const rawMax = Math.max(0, metric.target, finiteCurrent ? current! : 0);
  const padding = Math.max((rawMax - rawMin) * .18, Math.abs(metric.target) * .1, 1);
  const min = rawMin < 0 ? rawMin - padding : 0;
  const max = rawMax + padding;
  const targetPosition = position(metric.target, min, max);
  const currentPosition = finiteCurrent ? position(current!, min, max) : 0;
  const achieved = finiteCurrent && (metric.direction === 'min' ? current! >= metric.target : current! <= metric.target);
  const attainmentScore = metricAttainmentScore(metric.direction, current ?? NaN, metric.target);
  const attainmentColor = metricAttainmentColor(attainmentScore);
  const definition = metric.timePoints.map((point) => `${point.id}:${result.years[point.id] ?? '—'}`).join(' → ');
  const updateMetric = (mutate: (draft: ManagementMetricDefinition) => void) => { const draft = structuredClone(program); const index = draft.definitions.managementMetrics.findIndex((candidate) => candidate.id === metric.id); if (index >= 0) { mutate(draft.definitions.managementMetrics[index]); replaceProgram(draft); } };
  const updateTarget = (target: number) => updateMetric((draft) => { draft.target = target; });
  const anchorValue = (point: ManagementMetricDefinition['timePoints'][number]) => point.anchor.type === 'historicalEnd' ? 'historicalEnd' : point.anchor.type === 'specialYear' ? `specialYear:${point.anchor.specialYearId}` : `${point.anchor.type}:${point.anchor.periodId}`;
  const decodeAnchor = (value: string) => { const [type, id] = value.split(':'); if (type === 'historicalEnd') return { type: 'historicalEnd' as const }; if (type === 'specialYear') return { type: 'specialYear' as const, specialYearId: id }; return { type: type as 'periodStart' | 'periodEnd', periodId: id }; };
  return <article data-testid={`metric-bullet-${metric.id}`} data-reference={metric.optimization === 'fixed' ? 'fixed' : 'adjustable'} className={`border-t border-line px-1 py-2 ${metric.enabled ? '' : 'opacity-40'}`}>
    <div className="grid grid-cols-[minmax(150px,0.9fr)_minmax(180px,1.1fr)] items-center gap-2"><div><div className="mb-0.5 flex items-center gap-1"><span className="rounded-full border border-line px-1.5 py-0.5 text-[9px] text-muted-foreground">{metric.scope === 'company' ? '全社' : metric.scope === 'base' ? 'ベース' : '補助'}</span>{metric.optimization === 'fixed' && <span className="text-[9px] font-bold text-orange">固定参照</span>}</div><strong className="block text-[12px] leading-tight">{metric.label}</strong><small className="mt-0.5 block text-[9px] text-muted-foreground">{definition}</small></div><div className="self-center"><div className="mb-1 flex justify-between gap-2 text-[10px] font-bold"><span style={{ color: attainmentColor }}>現在 {finiteCurrent ? current!.toFixed(1) : result.status === 'missing-actual' ? '実績未入力' : '計算不可'} {metric.outputUnit}</span><span className="text-orange">目標 {metric.direction === 'min' ? '≥' : '≤'} {metric.target} {metric.outputUnit}</span></div><div className="relative h-2 rounded-full bg-[#e7e4dc]">{finiteCurrent && <div data-testid={`metric-bullet-bar-${metric.id}`} data-attainment-score={attainmentScore ?? undefined} className={`${metric.optimization === 'fixed' ? 'border-2 bg-transparent' : ''} absolute inset-y-0 left-0 rounded-full`} style={{ width: `${currentPosition}%`, backgroundColor: metric.optimization === 'fixed' ? 'transparent' : attainmentColor, borderColor: metric.optimization === 'fixed' ? attainmentColor : undefined }} />}<i className="absolute -top-1 h-4 w-0.5 bg-orange" style={{ left: `${targetPosition}%` }} /></div><p className="mt-0.5 mb-0 text-center text-[9px] text-muted-foreground">{finiteCurrent ? achieved ? '目標達成' : `目標まで ${Math.abs(metric.target - current!).toFixed(1)} ${metric.outputUnit}` : result.message ?? '実績を入力すると比較表示'}</p></div></div>
    {editing && <div className="mt-2 grid gap-2 border-t border-dashed border-line pt-2 text-[9px]"><div className="grid grid-cols-2 gap-2"><label className="font-bold text-muted-foreground">対象範囲<select aria-label={`${metric.label} 対象範囲`} className="mt-1 h-7 w-full rounded border border-input bg-surface px-1" value={metric.scope} onChange={(event) => updateMetric((draft) => { draft.scope = event.target.value as ManagementMetricDefinition['scope']; })}><option value="company">全社</option><option value="base">ベース事業</option><option value="subsidy">補助事業</option></select></label><label className="font-bold text-muted-foreground">目標値<Input aria-label={`${metric.label} 目標値`} className="mt-1 h-7 text-right text-xs" type="number" step="0.1" value={metric.target} onChange={(event) => updateTarget(Number(event.target.value))} /></label></div>{metric.timePoints.map((point, pointIndex) => <div key={point.id} className="grid grid-cols-[18px_1fr_54px_22px] items-end gap-1"><strong className="self-center text-teal">{point.id}</strong><label className="font-bold text-muted-foreground">基準時点<select aria-label={`${metric.label} 時点${point.id} 基準時点`} className="mt-1 h-7 w-full rounded border border-input bg-surface px-1" value={anchorValue(point)} onChange={(event) => updateMetric((draft) => { draft.timePoints[pointIndex].anchor = decodeAnchor(event.target.value); })}><option value="historicalEnd">過去実績・終了年</option>{program.definitions.specialYears.map((year) => <option key={year.id} value={`specialYear:${year.id}`}>{year.label}</option>)}{program.definitions.periods.flatMap((period) => [<option key={`${period.id}-start`} value={`periodStart:${period.id}`}>{period.label}・開始年</option>, <option key={`${period.id}-end`} value={`periodEnd:${period.id}`}>{period.label}・終了年</option>])}</select></label><label className="font-bold text-muted-foreground">±年<Input aria-label={`${metric.label} 時点${point.id} 調整年数`} className="mt-1 h-7 px-1" type="number" value={point.offset} onChange={(event) => updateMetric((draft) => { draft.timePoints[pointIndex].offset = Number(event.target.value); })} /></label><Button variant="ghost" size="sm" className="h-7 px-1" disabled={metric.timePoints.length <= 1} aria-label={`${metric.label} 時点${point.id}を削除`} onClick={() => updateMetric((draft) => { draft.timePoints.splice(pointIndex, 1); })}>×</Button></div>)}<Button variant="outline" size="sm" className="h-7" onClick={() => updateMetric((draft) => { const used = new Set(draft.timePoints.map((point) => point.id)); const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((candidate) => !used.has(candidate)) ?? `P${draft.timePoints.length + 1}`; draft.timePoints.push({ id, anchor: { type: 'historicalEnd' }, offset: 0 }); })}>＋ 時点</Button><label className="font-bold text-muted-foreground">計算式<Textarea aria-label={`${metric.label} 計算式`} className="mt-1 min-h-16 text-[9px]" value={metric.formula} onChange={(event) => updateMetric((draft) => { draft.formula = event.target.value; })} /></label><label className="font-bold text-muted-foreground">出力単位<Input aria-label={`${metric.label} 出力単位`} className="mt-1 h-7" value={metric.outputUnit} onChange={(event) => updateMetric((draft) => { draft.outputUnit = event.target.value; })} /></label>{metric.requiresActualInput && <label className="font-bold text-muted-foreground">最新決算期実績<Input aria-label={`${metric.label} 実績値`} className="mt-1 h-7 text-right text-xs" type="number" step="0.1" value={metricInputs[metric.id] ?? ''} onChange={(event) => updateMetricActual(metric.id, Number(event.target.value))} /></label>}</div>}
  </article>;
}

export function MetricsPanel({ company, base, subsidy }: { company: Timeline; base: Timeline; subsidy: Timeline }) {
  const [editing, setEditing] = useState(false);
  const [proposal, setProposal] = useState<OptimizationProposal>();
  const [strength, setStrength] = useState(0);
  const metrics = useModelStore((state) => state.program.definitions.managementMetrics);
  const program = useModelStore((state) => state.program);
  const forecast = useModelStore((state) => state.forecast);
  const actuals = useModelStore((state) => state.actuals);
  const replaceForecast = useModelStore((state) => state.replaceForecast);
  const begin = useModelStore((state) => state.beginTransaction);
  const commit = useModelStore((state) => state.commitTransaction);
  const createProposal = () => { setProposal(createMetricOptimizationProposal(forecast, program, actuals.basePl, actuals.subsidyPl, actuals.metricInputs)); setStrength(0); };
  const apply = (nextStrength: number) => {
    begin();
    setStrength(nextStrength);
    if (proposal) replaceForecast(applyOptimizationStrength(proposal, nextStrength));
  };
  return <aside data-testid="forecast-metrics-panel" className="sticky top-3 max-h-[calc(100vh-24px)] overflow-y-auto border border-line bg-surface p-2.5"><div className="mb-1 flex items-center justify-between gap-2"><div><h3 className="m-0 text-base font-bold">経営指標・目標</h3><p className="m-0 text-[10px] text-muted-foreground">制度式で全社・事業別を同時評価</p></div><Button variant={editing ? 'default' : 'outline'} size="sm" onClick={() => setEditing((value) => !value)}>{editing ? '編集完了' : 'すべて編集'}</Button></div><div>{metrics.map((metric) => <MetricBullet key={metric.id} metric={metric} editing={editing} timeline={metric.scope === 'company' ? company : metric.scope === 'base' ? base : subsidy} />)}</div><Button className="mt-2 w-full" onClick={createProposal}>目標を満たす水準案を作成</Button>{proposal && <section data-testid="optimization-proposal" className="mt-3 border-t-[3px] border-orange bg-background p-3"><div className="flex items-center justify-between"><strong className="text-sm">最適化方向</strong><span className="text-[10px] text-muted-foreground">PLは適用率で段階反映</span></div><div className="mt-2 max-h-32 overflow-y-auto">{proposal.changes.map((change) => <div key={`${change.seriesId}-${change.periodId}`} className="grid grid-cols-[1fr_48px] items-center border-t border-line py-1 text-[9px]"><span>{change.seriesId} / {change.periodId}</span><strong className={change.direction === 'up' ? 'text-teal' : 'text-orange'}>{change.direction === 'up' ? '↗' : '↘'} {Math.abs(change.delta).toFixed(1)}</strong></div>)}</div><label className="mt-3 block text-[10px] font-bold">最適化方向の適用率 <span className="float-right text-orange">{strength}%</span><Slider aria-label="最適化方向の適用率" data-testid="optimization-strength-control" className="mt-1 h-8 cursor-pointer [&_[data-slot=slider-thumb]]:size-5" min={0} max={100} step={1} value={[strength]} onPointerCancel={commit} onLostPointerCapture={commit} onValueChange={(values) => apply(values[0] ?? 0)} onValueCommit={commit} onBlur={commit} /></label></section>}</aside>;
}
