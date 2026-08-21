import { useRef, useState, type ChangeEvent } from 'react';
import { FileJson, FolderOpen, Save, SaveAll } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { parseModelFile, serializeModelFile } from '../../domain/model-file';
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

export function ModelFileMenu() {
  const program = useModelStore((state) => state.program);
  const actuals = useModelStore((state) => state.actuals);
  const forecast = useModelStore((state) => state.forecast);
  const caseSettings = useModelStore((state) => state.caseSettings);
  const replaceSnapshot = useModelStore((state) => state.replaceSnapshot);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<ModelFileHandle | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const json = () => serializeModelFile({ program, actuals, forecast, caseSettings });

  const loadFile = async (file: File, handle?: ModelFileHandle) => {
    try {
      replaceSnapshot(parseModelFile(await file.text()));
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
    const writable = await handle.createWritable();
    await writable.write(json());
    await writable.close();
    handleRef.current = handle;
    setFileName(handle.name);
  };

  const saveAs = async () => {
    const picker = window as PickerWindow;
    if (!picker.showSaveFilePicker) { fallbackDownload(json()); return; }
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

  return <>
    <input ref={inputRef} aria-label="案件JSONファイル" className="hidden" type="file" accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void loadFile(file);
      event.target.value = '';
    }} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="max-w-38"><FileJson /><span className="truncate">{fileName ?? '案件JSON'}</span></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void open()}><FolderOpen />読み込み</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!handleRef.current} onSelect={() => void overwrite()}><Save />上書き保存</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void saveAs()}><SaveAll />名前を付けて保存</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={Boolean(error)} onOpenChange={(openState) => { if (!openState) setError(undefined); }}>
      <DialogContent><DialogHeader><DialogTitle>案件JSONのエラー</DialogTitle><DialogDescription className="break-all">{error}</DialogDescription></DialogHeader></DialogContent>
    </Dialog>
  </>;
}
