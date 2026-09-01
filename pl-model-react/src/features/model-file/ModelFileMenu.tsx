import { useRef, useState, type ChangeEvent } from 'react';
import { ChevronDown, FileJson, FileSpreadsheet, FileText, FolderOpen, Save, SaveAll } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { buildCaseResultReport, createCaseResultHtml, createCaseResultXlsx } from '../../domain/case-results-export';
import { parseModelFile, serializeModelFile } from '../../domain/model-file';
import { createInitialModelSnapshot, type InitialActualsMode } from '../../store/model-store';
import { useModelStore } from '../../store/model-store-context';

type WritableFile = {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
};
type ModelFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableFile>;
};
type PickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<ModelFileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<ModelFileHandle>;
};

const pickerOptions = {
  id: 'pl-model-case-files',
  types: [{ description: 'PLモデル案件JSON', accept: { 'application/json': ['.json'] } }],
};

function fallbackDownload(json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pl-model-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadResult(fileName: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ModelFileMenu() {
  const program = useModelStore((state) => state.program);
  const actuals = useModelStore((state) => state.actuals);
  const forecast = useModelStore((state) => state.forecast);
  const caseSettings = useModelStore((state) => state.caseSettings);
  const moneyUnit = useModelStore((state) => state.preferences.moneyUnit);
  const replaceSnapshot = useModelStore((state) => state.replaceSnapshot);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<ModelFileHandle | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const json = () => serializeModelFile({ program, actuals, forecast, caseSettings });
  const snapshot = () => ({ program, actuals, forecast, caseSettings });
  const lastPersistedJsonRef = useRef(json());

  const loadFile = async (file: File, handle?: ModelFileHandle) => {
    try {
      const snapshot = parseModelFile(await file.text());
      replaceSnapshot(snapshot);
      lastPersistedJsonRef.current = serializeModelFile(snapshot);
      handleRef.current = handle ?? null;
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '案件ファイルを読み込めませんでした');
    }
  };

  const open = async () => {
    const picker = window as PickerWindow;
    if (!picker.showOpenFilePicker) { inputRef.current?.click(); return; }
    try {
      const [handle] = await picker.showOpenFilePicker(pickerOptions);
      if (handle) await loadFile(await handle.getFile(), handle);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('案件ファイルを開けませんでした');
    }
  };

  const writeTo = async (handle: ModelFileHandle) => {
    const content = json();
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    lastPersistedJsonRef.current = content;
    handleRef.current = handle;
    setFileName(handle.name);
  };

  const saveAs = async () => {
    const picker = window as PickerWindow;
    if (!picker.showSaveFilePicker) {
      const content = json();
      fallbackDownload(content);
      lastPersistedJsonRef.current = content;
      return;
    }
    try {
      await writeTo(await picker.showSaveFilePicker({ ...pickerOptions, suggestedName: fileName ?? 'pl-model.json' }));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('案件ファイルを保存できませんでした');
    }
  };

  const overwrite = async () => {
    if (!handleRef.current) return;
    try { await writeTo(handleRef.current); } catch { setError('案件ファイルを上書きできませんでした'); }
  };

  const loadSample = (mode: Extract<InitialActualsMode, 'sample' | 'sample-no-subsidy-history'>) => {
    if (json() !== lastPersistedJsonRef.current && !window.confirm('既存のデータが消えますが、よろしいでしょうか。')) return;
    const snapshot = createInitialModelSnapshot(window.PL_SUBSIDY_PROGRAM, mode);
    replaceSnapshot(snapshot);
    lastPersistedJsonRef.current = serializeModelFile(snapshot);
    handleRef.current = null;
    setFileName(mode === 'sample' ? 'sample-case.json' : 'sample-case-no-subsidy-history.json');
  };

  const exportExcel = () => {
    try {
      const bytes = createCaseResultXlsx(buildCaseResultReport(snapshot(), moneyUnit));
      downloadResult(`pl-model-results-${new Date().toISOString().slice(0, 10)}.xlsx`, bytes.buffer as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Excelファイルを出力できませんでした');
    }
  };

  const exportHtml = () => {
    try {
      downloadResult(`pl-model-results-${new Date().toISOString().slice(0, 10)}.html`, createCaseResultHtml(buildCaseResultReport(snapshot(), moneyUnit)), 'text/html;charset=utf-8');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'HTMLファイルを出力できませんでした');
    }
  };

  return <>
    <input ref={inputRef} aria-label="案件JSONファイル" className="hidden" type="file" accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void loadFile(file);
      event.target.value = '';
    }} />
    <div className="flex items-stretch"><div aria-label="現在の案件ファイル" className="flex h-8 max-w-38 items-center gap-1.5 rounded-l-md border border-line bg-surface px-3 text-[11px] font-bold text-ink"><FileJson aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{fileName ?? '案件JSON'}</span></div><DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-8 w-7 rounded-l-none border-l-0" aria-label="案件JSONメニュー"><ChevronDown /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>案件データ</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void open()}><FolderOpen />ファイルを読み込む</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!handleRef.current} onSelect={() => void overwrite()}><Save />上書き保存</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void saveAs()}><SaveAll />名前を付けて保存</DropdownMenuItem>
        <DropdownMenuLabel>サンプルデータ</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => loadSample('sample')}><FileJson />サンプルデータを読み込み（補助事業実績あり）</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => loadSample('sample-no-subsidy-history')}><FileJson />サンプルデータを読み込み（補助事業実績なし）</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>結果出力</DropdownMenuLabel>
        <DropdownMenuItem onSelect={exportExcel}><FileSpreadsheet />Excelで出力</DropdownMenuItem>
        <DropdownMenuItem onSelect={exportHtml}><FileText />HTMLで出力</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu></div>
    <Dialog open={Boolean(error)} onOpenChange={(openState) => { if (!openState) setError(undefined); }}>
      <DialogContent><DialogHeader><DialogTitle>案件JSONのエラー</DialogTitle><DialogDescription className="break-all">{error}</DialogDescription></DialogHeader></DialogContent>
    </Dialog>
  </>;
}
