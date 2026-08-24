import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import { ChartNoAxesCombined, ClipboardList, Redo2, Settings2, Undo2, Workflow } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { StickySurface } from '../components/ui/sticky-surface';
import { ActualsPage } from '../features/actuals/ActualsPage';
import { cn } from '../lib/utils';
import { ModelStoreProvider, useModelStore } from '../store/model-store-context';
import { moneyDisplayUnits } from '../domain/value-units';
import { ModelFileMenu } from '../features/model-file/ModelFileMenu';
import { ForecastPage } from '../features/forecast/ForecastPage';
import { LogicMapPage } from '../features/logic/LogicMapPage';
import { DefinitionPage as ProgramDefinitionPage } from '../features/definition/DefinitionPage';
import type { InitialActualsMode } from '../store/model-store';
import { stickyStackOffset, useObservedHeight } from '../lib/sticky-stack';

type Page = 'definition' | 'actuals' | 'forecast' | 'logic';
type PageLink = { id: Page; label: string; icon: ComponentType<{ className?: string }> };

function AppContent() {
  const [page, setPage] = useState<Page>('actuals');
  const [selectedLogicCode, setSelectedLogicCode] = useState('16');
  const appToolbar = useObservedHeight<HTMLDivElement>(57);
  const program = useModelStore((state) => state.program);
  const undo = useModelStore((state) => state.undo);
  const redo = useModelStore((state) => state.redo);
  const canUndo = useModelStore((state) => state.canUndo);
  const canRedo = useModelStore((state) => state.canRedo);
  const moneyUnit = useModelStore((state) => state.preferences.moneyUnit);
  const setMoneyUnit = useModelStore((state) => state.setMoneyUnit);
  const pages = useMemo<PageLink[]>(() => [
    { id: 'definition', label: '01 制度定義', icon: Settings2 },
    { id: 'actuals', label: '02 期間・過去実績', icon: ClipboardList },
    { id: 'forecast', label: '03 将来予測・PL', icon: ChartNoAxesCombined },
    { id: 'logic', label: '04 ロジックマップ', icon: Workflow },
  ], []);
  const navigateToPage = (nextPage: Page) => {
    setPage(nextPage);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const openLogicMap = (code: string) => {
    setSelectedLogicCode(code);
    navigateToPage('logic');
  };
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey && canUndo) { event.preventDefault(); undo(); }
      if ((event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) && canRedo) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [canRedo, canUndo, redo, undo]);
  return <TooltipProvider><div data-testid="app-shell" className="mx-auto mt-3.5 mb-10 w-[calc(100%-28px)] max-w-[1900px]" style={{ '--app-toolbar-sticky-bottom': `${stickyStackOffset(0, appToolbar.height)}px` } as CSSProperties}>
    <header className="border border-line bg-surface px-5.5 pt-4.5 pb-3.5">
      <div><p className="mb-1 text-[10px] font-extrabold tracking-[.12em] text-orange">PL MODEL / REACT MIGRATION</p><h1 className="m-0 text-2xl leading-tight font-bold">成長投資計画シミュレーター</h1><Badge variant="outline" className="mt-1 border-line text-[10px] text-muted-foreground">{program.program.name}</Badge></div>
    </header>
    <StickySurface ref={appToolbar.ref} data-testid="app-toolbar" stickyTop="0px" layer="navigation" className="flex items-center justify-end gap-2 border-x border-b border-line px-3 py-2 shadow-sm max-[1100px]:overflow-x-auto"><nav aria-label="主要画面" className="flex gap-0.5 rounded-lg bg-[#e8e6df] p-1">{pages.map((item) => {
        const Icon = item.icon;
        const active = page === item.id;
        return <Button key={item.id} variant="ghost" size="sm" aria-current={active ? 'page' : undefined} className={cn('max-[1100px]:flex-1', active && 'bg-navy text-white hover:bg-navy/90 hover:text-white')} onClick={() => navigateToPage(item.id)}><Icon aria-hidden="true" />{item.label}</Button>;
      })}</nav><Select value={moneyUnit} onValueChange={setMoneyUnit}><SelectTrigger aria-label="金額表示単位" size="sm" className="w-28 bg-surface"><SelectValue /></SelectTrigger><SelectContent>{moneyDisplayUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.label}</SelectItem>)}</SelectContent></Select><ModelFileMenu /><div className="flex gap-1"><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="元に戻す Ctrl+Z" disabled={!canUndo} onClick={undo}><Undo2 /></Button></TooltipTrigger><TooltipContent>元に戻す Ctrl+Z</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="やり直す Ctrl+Y" disabled={!canRedo} onClick={redo}><Redo2 /></Button></TooltipTrigger><TooltipContent>やり直す Ctrl+Y</TooltipContent></Tooltip></div></StickySurface>
    {page === 'definition' && <ProgramDefinitionPage />}
    {page === 'actuals' && <ActualsPage onNext={() => navigateToPage('forecast')} />}
    {page === 'forecast' && <ForecastPage onOpenLogicMap={openLogicMap} />}
    {page === 'logic' && <LogicMapPage initialSelectedCode={selectedLogicCode} />}
  </div></TooltipProvider>;
}

export function App({ initialActuals = import.meta.env.MODE === 'test' ? 'sample' : 'empty' }: { initialActuals?: InitialActualsMode }) {
  return <ModelStoreProvider initialActuals={initialActuals}><AppContent /></ModelStoreProvider>;
}
