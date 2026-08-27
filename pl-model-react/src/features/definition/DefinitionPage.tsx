import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NumberInput } from '../../components/ui/number-input';
import { Textarea } from '../../components/ui/textarea';
import { StickySurface } from '../../components/ui/sticky-surface';
import { inferMetricPeriodKind, validateMetricDefinition } from '../../domain/metrics';
import { resolveTimeline } from '../../domain/timeline';
import type { CommonNumericDefinition, ManagementMetricDefinition, MetricTimeAnchor, ProgramConfiguration } from '../../domain/types';
import { valueKindMetadata, type ValueKind } from '../../domain/value-units';
import { useModelStore } from '../../store/model-store-context';
import { ProgramFileMenu } from './ProgramFileMenu';
import { ProgramTemplateAiDialog } from './ProgramTemplateAiDialog';
import { addPeriodDefinition, removePeriodDefinition, removeSpecialYearDefinition, renameNumericDefinition } from '../../domain/program-editor';
import { forecastPlRows } from '../../domain/rows';

const fieldClass = 'grid min-w-0 gap-1 text-[10px] font-bold text-muted-foreground';
const selectClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-surface px-2 text-sm text-ink';

function nextId(prefix: string, count: number) { return `${prefix}-${count + 1}-${Date.now().toString(36)}`; }
function nextPointId(points: ManagementMetricDefinition['timePoints']) {
  const used = new Set(points.map((point) => point.id));
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((id) => !used.has(id)) ?? `P${points.length + 1}`;
}
function encodeAnchor(anchor: MetricTimeAnchor) {
  if (anchor.type === 'historicalEnd') return 'historicalEnd';
  if (anchor.type === 'specialYear') return `specialYear:${anchor.specialYearId}`;
  return `${anchor.type}:${anchor.periodId}`;
}
function decodeAnchor(value: string): MetricTimeAnchor {
  const [type, id] = value.split(':');
  if (type === 'historicalEnd') return { type: 'historicalEnd' };
  if (type === 'specialYear') return { type, specialYearId: id };
  return { type: type as 'periodStart' | 'periodEnd', periodId: id };
}

function DefinitionSectionHeader({ id, title, description, addLabel, onAdd }: { id: string; title: string; description?: ReactNode; addLabel: string; onAdd: () => void }) {
  return <StickySurface data-testid={`definition-section-header-${id}`} stickyTop="var(--app-toolbar-sticky-bottom)" layer="content" className="flex min-h-14 items-center justify-between gap-4 border-t-[3px] border-t-navy border-b border-line px-4 py-3 shadow-sm"><div className="min-w-0"><h3 className="m-0 text-base font-bold leading-tight">{title}</h3>{description && <p className="mt-1 mb-0 text-xs leading-relaxed text-muted-foreground">{description}</p>}</div><Button className="shrink-0" variant="outline" size="sm" aria-label={addLabel} onClick={onAdd}><Plus />追加</Button></StickySurface>;
}

function DefinitionCard({ id, title, description, addLabel, onAdd, children }: { id: string; title: string; description?: ReactNode; addLabel: string; onAdd: () => void; children: ReactNode }) {
  return <section data-testid={`definition-section-${id}`} className="relative isolate min-w-0 overflow-clip border border-line bg-surface">
    <DefinitionSectionHeader id={id} title={title} description={description} addLabel={addLabel} onAdd={onAdd} />
    <div data-testid={`definition-section-body-${id}`} className="px-4 pt-3 pb-4">{children}</div>
  </section>;
}

const plValueKinds = Object.keys(valueKindMetadata) as ValueKind[];

type PlInsertionAnchor = { code: string; displayCode: string; label: string };

function NumericDefinitionCard({ definition, index, anchors, update, rename, remove }: { definition: CommonNumericDefinition; index: number; anchors: PlInsertionAnchor[]; update: (definition: CommonNumericDefinition) => void; rename: (label: string) => void; remove: () => void }) {
  const display = definition.plDisplay;
  const setDisplayEnabled = (enabled: boolean) => update({
    ...definition,
    plDisplay: { ...(display ?? { insertAfter: anchors.at(-1)?.code ?? '20', insertOrder: index + 1, valueKind: 'money' as const }), enabled },
  });
  return <article data-testid={`numeric-definition-${definition.id}`} className="grid gap-2 border-t-[3px] border-teal bg-background p-3">
    <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2"><Input aria-label={`数値定義${index + 1} 名称`} value={definition.label} onChange={(event) => rename(event.target.value)} /><Button variant="ghost" size="icon" aria-label={`${definition.label}を削除`} onClick={remove}><Trash2 /></Button></div>
    <Textarea aria-label={`${definition.label} 計算式`} value={definition.formula} onChange={(event) => update({ ...definition, formula: event.target.value })} />
    <div className="border-t border-dashed border-line pt-2">
      <label className="flex items-center gap-2 text-xs font-bold"><input aria-label={`${definition.label}をPL表に表示`} type="checkbox" checked={display?.enabled ?? false} onChange={(event) => setDisplayEnabled(event.target.checked)} />PL表の補足指標として表示</label>
      {display?.enabled && <div className="mt-2 grid min-w-0 grid-cols-2 gap-2">
        <label className={fieldClass}>挿入位置<select aria-label={`${definition.label} 挿入位置`} className={selectClass} value={display.insertAfter} onChange={(event) => update({ ...definition, plDisplay: { ...display, insertAfter: event.target.value } })}>{anchors.map((anchor) => <option key={anchor.code} value={anchor.code}>{anchor.displayCode} {anchor.label}の後</option>)}</select></label>
        <label className={fieldClass}>同位置での順番<NumberInput aria-label={`${definition.label} 同位置での順番`} value={display.insertOrder} min={1} step="1" onValueChange={(value) => update({ ...definition, plDisplay: { ...display, insertOrder: Math.max(1, Math.round(value)) } })} /></label>
        <label className={fieldClass}>表示単位<select aria-label={`${definition.label} PL表示単位`} className={selectClass} value={display.valueKind} onChange={(event) => update({ ...definition, plDisplay: { ...display, valueKind: event.target.value as ValueKind } })}>{plValueKinds.map((kind) => <option key={kind} value={kind}>{valueKindMetadata[kind].label}</option>)}</select></label>
        <label className={fieldClass}>字下げ<select aria-label={`${definition.label} PL字下げ`} className={selectClass} value={display.indent ?? 0} onChange={(event) => update({ ...definition, plDisplay: { ...display, indent: Number(event.target.value) as 0 | 1 | 2 } })}><option value={0}>なし</option><option value={1}>1段</option><option value={2}>2段</option></select></label>
      </div>}
      <p className="mt-1 mb-0 text-[9px] text-muted-foreground">選択した基準科目の直後へ挿入し、追加科目番号はPL全体の表示順でA-1、A-2…と自動採番します。</p>
    </div>
  </article>;
}

function MetricCard({ metric, program, update, remove }: { metric: ManagementMetricDefinition; program: ProgramConfiguration; update: (metric: ManagementMetricDefinition) => void; remove: () => void }) {
  let warning = '';
  try { validateMetricDefinition(metric); } catch (cause) { warning = cause instanceof Error ? cause.message : '指標定義が不正です'; }
  const addPoint = () => update({ ...metric, timePoints: [...metric.timePoints, { id: nextPointId(metric.timePoints), anchor: { type: 'periodEnd', periodId: program.definitions.periods.at(-1)?.id ?? 'historical' }, offset: 0 }] });
  return <article data-testid={`metric-${metric.id}`} className={`border-t-[3px] border-navy bg-background p-4 ${metric.enabled ? '' : 'opacity-45'}`}>
    <div className="mb-3 flex items-center justify-between gap-3"><div><span className="text-[10px] font-bold text-teal">{inferMetricPeriodKind(metric)}</span><h4 className="m-0 text-base font-bold">{metric.label}</h4></div><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={metric.enabled} onChange={(event) => update({ ...metric, enabled: event.target.checked })} />使用する</label><Button variant="ghost" size="icon" aria-label={`${metric.label}を削除`} onClick={remove}><Trash2 /></Button></div></div>
    <div className="grid grid-cols-[1.4fr_.8fr_.7fr_.7fr] gap-2">
      <label className={fieldClass}>指標名<Input value={metric.label} onChange={(event) => update({ ...metric, label: event.target.value })} /></label>
      <label className={fieldClass}>対象範囲<select className={selectClass} value={metric.scope} onChange={(event) => update({ ...metric, scope: event.target.value as ManagementMetricDefinition['scope'] })}><option value="company">全社</option><option value="base">ベース事業</option><option value="subsidy">補助事業</option></select></label>
      <label className={fieldClass}>目標値<NumberInput value={metric.target} onValueChange={(value) => update({ ...metric, target: value })} /></label>
      <label className={fieldClass}>判定<select className={selectClass} value={metric.direction} onChange={(event) => update({ ...metric, direction: event.target.value as 'min' | 'max' })}><option value="min">以上</option><option value="max">以下</option></select></label>
    </div>
    <div className="mt-3 grid gap-2"><div className="flex items-center justify-between"><strong className="text-xs">使用時点</strong><Button variant="outline" size="sm" aria-label={`${metric.label}の時点を追加`} onClick={addPoint}><Plus />時点を追加</Button></div>{metric.timePoints.map((point, index) => <div key={`${point.id}-${index}`} className="grid grid-cols-[42px_1fr_130px_36px] items-end gap-2 rounded-md border border-line bg-surface p-2"><strong className="self-center text-lg text-teal">{point.id}</strong><label className={fieldClass}>基準時点<select className={selectClass} value={encodeAnchor(point.anchor)} onChange={(event) => update({ ...metric, timePoints: metric.timePoints.map((candidate) => candidate === point ? { ...candidate, anchor: decodeAnchor(event.target.value) } : candidate) })}><option value="historicalEnd">過去実績・終了年</option>{program.definitions.specialYears.map((year) => <option key={year.id} value={`specialYear:${year.id}`}>{year.label}</option>)}{program.definitions.periods.flatMap((period) => [<option key={`${period.id}-start`} value={`periodStart:${period.id}`}>{period.label}・開始年</option>, <option key={`${period.id}-end`} value={`periodEnd:${period.id}`}>{period.label}・終了年</option>])}</select></label><label className={fieldClass}>調整年数<NumberInput value={point.offset} onValueChange={(value) => update({ ...metric, timePoints: metric.timePoints.map((candidate) => candidate === point ? { ...candidate, offset: value } : candidate) })} /></label><Button variant="ghost" size="icon" disabled={metric.timePoints.length <= 1} aria-label={`${metric.label}の時点${point.id}を削除`} onClick={() => update({ ...metric, timePoints: metric.timePoints.filter((candidate) => candidate !== point) })}><Trash2 /></Button></div>)}</div>
    <label className={`${fieldClass} mt-3`}>計算式<Textarea value={metric.formula} onChange={(event) => update({ ...metric, formula: event.target.value })} /></label>
    {warning && <p role="alert" className="mt-1 text-[10px] font-bold text-orange">{warning}</p>}
    <div className="mt-2 grid grid-cols-3 gap-2"><label className={fieldClass}>出力単位<Input value={metric.outputUnit} onChange={(event) => update({ ...metric, outputUnit: event.target.value })} /></label><label className={fieldClass}>個社目標の扱い<select aria-label={`${metric.label} 個社目標の扱い`} className={selectClass} value={metric.targetPolicy ?? 'reference'} onChange={(event) => update({ ...metric, targetPolicy: event.target.value as NonNullable<ManagementMetricDefinition['targetPolicy']> })}><option value="reference">個社目標を優先</option><option value="minimum">制度目標以上</option><option value="maximum">制度目標以下</option></select></label><label className={fieldClass}>最適化<select className={selectClass} value={metric.optimization} onChange={(event) => update({ ...metric, optimization: event.target.value as 'adjustable' | 'fixed' })}><option value="adjustable">最適化で変化</option><option value="fixed">目標最適化で変化しない</option></select></label></div>
  </article>;
}

export function DefinitionPage() {
  const program = useModelStore((state) => state.program);
  const replaceProgram = useModelStore((state) => state.replaceProgram);
  const timeline = resolveTimeline(program);
  const configuredLabels = new Set(program.definitions.commonNumericDefinitions.filter((definition) => definition.plDisplay).map((definition) => definition.label));
  const plInsertionAnchors = forecastPlRows.filter((row) => !row.supplementary && !configuredLabels.has(row.label)).map((row) => ({ code: row.code, displayCode: row.displayCode ?? row.code, label: row.label }));
  const change = (mutate: (draft: ProgramConfiguration) => void) => { const draft = structuredClone(program); mutate(draft); replaceProgram(draft); };
  const addPeriod = () => replaceProgram(addPeriodDefinition(program));
  const addSpecialYear = () => change((draft) => draft.definitions.specialYears.push({ id: nextId('special', draft.definitions.specialYears.length), label: `特別年${draft.definitions.specialYears.length + 1}`, anchor: { type: 'historicalEnd' }, offset: 0 }));
  return <main className="mt-3 grid gap-3">
    <section className="flex items-start justify-between gap-5 border border-line border-t-[3px] border-t-orange bg-surface px-5 py-4">
      <div className="min-w-0 flex-1"><span className="text-[10px] font-extrabold tracking-[.08em] text-orange">制度・プロジェクト共通</span><Input aria-label="制度名" className="mt-2 max-w-xl text-lg font-bold" value={program.program.name} onChange={(event) => change((draft) => { draft.program.name = event.target.value; })} /><p className="mb-0 text-sm text-muted-foreground">区間・特別年・数値・経営指標を制度定義ファイルとして定義します。個社ごとに変わる実年は次画面で設定します。</p></div><div className="flex max-w-md shrink-0 flex-col items-end gap-1.5"><div className="flex flex-wrap justify-end gap-2"><ProgramTemplateAiDialog /><ProgramFileMenu /></div><p className="m-0 max-w-sm text-right text-[10px] leading-relaxed text-muted-foreground"><code className="font-bold text-ink">subsidy-program.js</code> としてHTMLと同じ階層へ置くと、次回起動時から自動で読み込みます。</p></div>
    </section>

    <div className="grid grid-cols-2 items-start gap-3 max-[1100px]:grid-cols-1">
      <DefinitionCard id="periods" title="区間名の定義" description="制度で使用する期間名と、基準年前後の役割を定義します。" addLabel="区間を追加" onAdd={addPeriod}>
        <div className="grid gap-2">
          <article className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 rounded-md border border-line bg-background p-3"><Input aria-label="過去実績区間 名称" value={program.definitions.historical.label} onChange={(event) => change((draft) => { draft.definitions.historical.label = event.target.value; })} /><small className="text-muted-foreground">固定・削除不可</small></article>
          {program.definitions.periods.map((period, index) => <article key={period.id} className="grid grid-cols-[minmax(0,1fr)_130px_36px] items-center gap-2 rounded-md border border-line bg-background p-3"><Input aria-label={`区間${index + 1} 名称`} value={period.label} onChange={(event) => change((draft) => { draft.definitions.periods[index].label = event.target.value; })} /><select className={selectClass} value={period.modelPhase} onChange={(event) => change((draft) => { draft.definitions.periods[index].modelPhase = event.target.value as 'toBase' | 'postBase'; })}><option value="toBase">基準年まで</option><option value="postBase">基準年後</option></select><Button variant="ghost" size="icon" disabled={program.definitions.periods.length <= 1} aria-label={`${period.label}を削除`} onClick={() => replaceProgram(removePeriodDefinition(program, period.id))}><Trash2 /></Button></article>)}
        </div>
      </DefinitionCard>

      <DefinitionCard id="special-years" title="特別年の呼称" description="制度固有の年名を、区間の開始・終了年から相対指定します。" addLabel="特別年を追加" onAdd={addSpecialYear}>
        <div className="grid gap-2">{program.definitions.specialYears.map((year, index) => <article key={year.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_36px] items-end gap-2 rounded-md border border-line bg-background p-3"><label className={fieldClass}>呼称<Input aria-label={`特別年${index + 1} 呼称`} value={year.label} onChange={(event) => change((draft) => { draft.definitions.specialYears[index].label = event.target.value; })} /></label><label className={fieldClass}>基準期間<select className={selectClass} disabled={year.id === 'base'} value={year.anchor.type === 'historicalEnd' ? 'historicalEnd' : `${year.anchor.type}:${year.anchor.periodId}`} onChange={(event) => change((draft) => { const [type, periodId] = event.target.value.split(':'); draft.definitions.specialYears[index].anchor = type === 'historicalEnd' ? { type: 'historicalEnd' } : { type: type as 'periodStart' | 'periodEnd', periodId }; })}><option value="historicalEnd">過去実績・終了年</option>{program.definitions.periods.flatMap((period) => [<option key={`${period.id}-s`} value={`periodStart:${period.id}`}>{period.label}・開始年</option>, <option key={`${period.id}-e`} value={`periodEnd:${period.id}`}>{period.label}・終了年</option>])}</select></label><label className={fieldClass}>調整年数<NumberInput aria-label={`特別年${index + 1} 調整年数`} disabled={year.id === 'base'} value={year.offset} onValueChange={(value) => change((draft) => { draft.definitions.specialYears[index].offset = value; })} /></label><Button variant="ghost" size="icon" disabled={year.id === 'base'} aria-label={`${year.label}を削除`} onClick={() => replaceProgram(removeSpecialYearDefinition(program, year.id))}><Trash2 /></Button></article>)}</div>
        <p className="mt-3 mb-0 rounded-md bg-soft px-3 py-2 text-[10px] text-muted-foreground">現在の解決年：{timeline.specialYears.map((year) => `${year.label} ${year.year}`).join(' / ')}</p>
      </DefinitionCard>
    </div>

    <DefinitionCard id="numeric-definitions" title="共通数値定義" description="複数の経営指標から再利用する値を先に定義します。t・t-1等も式に直接記述でき、必要な定義はP/L補足指標として同じ計算結果を表示できます。" addLabel="共通数値定義を追加" onAdd={() => change((draft) => draft.definitions.commonNumericDefinitions.push({ id: nextId('value', draft.definitions.commonNumericDefinitions.length), label: '新しい数値', formula: '0', outputPoint: 't' }))}>
      <div className="grid grid-cols-2 gap-3 max-[1100px]:grid-cols-1">{program.definitions.commonNumericDefinitions.map((definition, index) => <NumericDefinitionCard key={definition.id} definition={definition} index={index} anchors={plInsertionAnchors} rename={(label) => replaceProgram(renameNumericDefinition(program, definition.id, label))} update={(next) => change((draft) => { draft.definitions.commonNumericDefinitions[index] = next; })} remove={() => change((draft) => { draft.definitions.commonNumericDefinitions.splice(index, 1); })} />)}</div>
    </DefinitionCard>

    <DefinitionCard id="management-metrics" title="経営指標・目標" description="制度目標と、個社目標を優先・下限・上限のどれとして扱うかを定義します。個社値そのものは案件JSONへ保存します。" addLabel="経営指標を追加" onAdd={() => change((draft) => draft.definitions.managementMetrics.push({ id: nextId('metric', draft.definitions.managementMetrics.length), label: '新しい経営指標', enabled: true, scope: 'company', timePoints: [{ id: 'A', anchor: { type: 'historicalEnd' }, offset: 0 }], formula: '0', outputUnit: '', target: 0, targetPolicy: 'reference', direction: 'min', optimization: 'fixed' }))}>
      <div className="grid grid-cols-2 gap-3 max-[1200px]:grid-cols-1">{program.definitions.managementMetrics.map((metric, index) => <MetricCard key={metric.id} metric={metric} program={program} update={(next) => change((draft) => { draft.definitions.managementMetrics[index] = next; })} remove={() => change((draft) => { draft.definitions.managementMetrics.splice(index, 1); })} />)}</div>
    </DefinitionCard>
  </main>;
}
