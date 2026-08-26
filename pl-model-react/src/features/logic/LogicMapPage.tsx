import { useState } from 'react';
import { Braces, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { StickyPanel } from '../../components/ui/sticky-panel';
import { commonPlFormulaInputs, extractFormulaReferences, sortNumericDefinitions } from '../../domain/definition-graph';
import { useModelStore } from '../../store/model-store-context';
import { buildPlLogicNodes, downstreamCodes } from '../../domain/pl-logic';

export function LogicMapPage({ initialSelectedCode = '16' }: { initialSelectedCode?: string }) {
  const [selectedCode, setSelectedCode] = useState(initialSelectedCode);
  const definitions = useModelStore((state) => state.program.definitions.commonNumericDefinitions);
  let graphError = '';
  try { sortNumericDefinitions(definitions, commonPlFormulaInputs); } catch (cause) { graphError = cause instanceof Error ? cause.message : '数値定義を検証できません'; }
  const definitionNames = new Set(definitions.map((definition) => definition.label));
  const plLogicNodes = buildPlLogicNodes(definitions);
  const selected = plLogicNodes.find((node) => node.code === selectedCode) ?? plLogicNodes[0];
  const labels = new Map(plLogicNodes.map((node) => [node.code, node.label]));
  const downstream = downstreamCodes(plLogicNodes, selected.code);

  return <main className="mt-3 grid gap-3">
    <section className="flex items-center justify-between border border-line bg-surface px-5 py-4">
      <div><p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold tracking-[.08em] text-orange"><Braces className="size-3" />REFERENCE / FORMULA DEPENDENCY GRAPH</p><h2 className="m-0 text-xl font-bold">共通数値定義・計算ロジック</h2><p className="mt-1 mb-0 text-xs text-muted-foreground">参考画面として、制度定義ファイルで定義した数式と参照関係を一覧表示します。循環参照と未定義参照は読み込み時に検出します。</p></div>
      {graphError ? <Badge role="alert" variant="outline" className="border-orange/50 text-orange">{graphError}</Badge> : <Badge variant="outline" className="gap-1 border-teal/40 text-teal"><CheckCircle2 className="size-3" />依存関係に問題なし</Badge>}
    </section>
    <section data-testid="definition-logic-map" className="grid grid-cols-4 gap-3 border border-line bg-surface p-4">
      {definitions.map((definition) => {
        const dependencies = [...new Set(extractFormulaReferences(definition.formula))];
        const calculated = dependencies.filter((dependency) => definitionNames.has(dependency));
        const inputs = dependencies.filter((dependency) => !definitionNames.has(dependency));
        return <article key={definition.id} className="flex min-h-52 flex-col border border-line bg-background p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2"><h3 className="m-0 text-base font-bold">{definition.label}</h3><code className="text-[10px] text-muted-foreground">[{definition.outputPoint}]</code></div>
          <code className="min-h-14 rounded bg-soft p-2 text-[11px] leading-relaxed break-words text-navy">{definition.formula}</code>
          <div className="mt-auto grid gap-1 pt-3 text-[10px]">
            <p className="m-0 text-muted-foreground">入力値</p><div className="flex flex-wrap gap-1">{inputs.map((input) => <span key={input} className="rounded bg-surface px-1.5 py-0.5 ring-1 ring-line">{input}</span>)}</div>
            {calculated.length > 0 && <><p className="mt-1 mb-0 text-muted-foreground">参照する共通数値定義</p><div className="flex flex-wrap gap-1">{calculated.map((dependency) => <span key={dependency} className="rounded bg-teal/10 px-1.5 py-0.5 text-teal ring-1 ring-teal/20">{dependency}</span>)}</div></>}
          </div>
        </article>;
      })}
    </section>
    <section data-testid="pl-logic-section" className="grid grid-cols-[minmax(0,1fr)_310px] items-start gap-3 border border-line bg-surface p-4">
      <div><div className="mb-3"><h3 className="m-0 text-base font-bold">P/L項目と水準設定のつながり</h3><p className="mt-1 mb-0 text-[11px] text-muted-foreground">P/Lの並びを保ったまま項目を選ぶと、参照元・設定値・影響先を確認できます。</p></div><div data-testid="pl-logic-map" className="grid grid-cols-3 gap-2">{plLogicNodes.map((node) => <button type="button" key={node.code} aria-pressed={node.code === selected.code} onClick={() => setSelectedCode(node.code)} className={`grid min-h-16 grid-cols-[38px_1fr] items-center border px-2 py-2 text-left ${node.code === selected.code ? 'border-teal bg-teal/10' : 'border-line bg-background hover:bg-soft'}`}><small className="text-muted-foreground">{node.displayCode}</small><span className="text-xs font-bold">{node.label}</span></button>)}</div></div>
      <StickyPanel data-testid="logic-detail" testIdPrefix="logic-detail" stickyTop="calc(var(--app-toolbar-sticky-bottom) + 12px)" className="self-start border-t-[3px] border-orange" headerClassName="px-4 pt-3 pb-2" bodyClassName="p-4 pt-2" header={<div><p className="m-0 text-[10px] font-bold text-orange">PL {selected.code}</p><h3 className="mt-1 mb-0 text-lg font-bold">{selected.label}</h3></div>}><code className="block rounded bg-soft p-2 text-[11px] leading-relaxed">{selected.formula}</code><h4 className="mt-4 mb-1 text-xs">参照するPL項目</h4><div className="flex flex-wrap gap-1">{selected.dependsOn.length ? selected.dependsOn.map((code) => <span key={code} className="rounded border border-line bg-surface px-2 py-1 text-[10px]">{labels.get(code)}</span>) : <small className="text-muted-foreground">前年値・外部入力</small>}</div><h4 className="mt-4 mb-1 text-xs">使う設定値</h4><div className="flex flex-wrap gap-1">{selected.settings.length ? selected.settings.map((setting) => <span key={setting} className="rounded bg-orange/10 px-2 py-1 text-[10px] text-orange">{setting}</span>) : <small className="text-muted-foreground">直接の設定なし</small>}</div><h4 className="mt-4 mb-1 text-xs">この項目が影響する先</h4><div className="flex flex-wrap gap-1">{downstream.length ? downstream.map((code) => <span key={code} className="rounded bg-teal/10 px-2 py-1 text-[10px] text-teal">{labels.get(code)}</span>) : <small className="text-muted-foreground">最終出力</small>}</div></StickyPanel>
    </section>
  </main>;
}
