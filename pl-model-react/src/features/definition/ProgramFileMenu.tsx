import { useRef, useState, type ChangeEvent } from 'react';
import { FileCode2, FolderOpen, Save, SaveAll } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { parseProgramScript, serializeProgramScript } from '../../domain/program-file';
import { useModelStore } from '../../store/model-store-context';

type WritableFile = { write: (data: string) => Promise<void>; close: () => Promise<void> };
type ProgramFileHandle = { name: string; getFile: () => Promise<File>; createWritable: () => Promise<WritableFile> };
type PickerWindow = Window & { showOpenFilePicker?: (options: object) => Promise<ProgramFileHandle[]>; showSaveFilePicker?: (options: object) => Promise<ProgramFileHandle> };
const options = { types: [{ description: '補助金制度定義JS', accept: { 'text/javascript': ['.js'] } }] };

function download(source: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'subsidy-program.js'; anchor.click(); URL.revokeObjectURL(url);
}

export function ProgramFileMenu() {
  const program = useModelStore((state) => state.program);
  const replaceProgram = useModelStore((state) => state.replaceProgram);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<ProgramFileHandle | null>(null);
  const [fileName, setFileName] = useState('制度JS');
  const [error, setError] = useState<string>();
  const load = async (file: File, handle?: ProgramFileHandle) => { try { replaceProgram(parseProgramScript(await file.text())); handleRef.current = handle ?? null; setFileName(file.name); } catch (cause) { setError(cause instanceof Error ? cause.message : '制度JSを読み込めませんでした'); } };
  const open = async () => { const picker = window as PickerWindow; if (!picker.showOpenFilePicker) { inputRef.current?.click(); return; } try { const [handle] = await picker.showOpenFilePicker(options); if (handle) await load(await handle.getFile(), handle); } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('制度JSを開けませんでした'); } };
  const write = async (handle: ProgramFileHandle) => { const writable = await handle.createWritable(); await writable.write(serializeProgramScript(program)); await writable.close(); handleRef.current = handle; setFileName(handle.name); };
  const saveAs = async () => { const picker = window as PickerWindow; if (!picker.showSaveFilePicker) { download(serializeProgramScript(program)); return; } try { await write(await picker.showSaveFilePicker({ ...options, suggestedName: 'subsidy-program.js' })); } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('制度JSを保存できませんでした'); } };
  return <><input ref={inputRef} className="hidden" aria-label="制度JSファイル" type="file" accept=".js,text/javascript" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void load(file); event.target.value = ''; }} /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><FileCode2 />{fileName}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void open()}><FolderOpen />読み込み</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={!handleRef.current} onSelect={() => { if (handleRef.current) void write(handleRef.current); }}><Save />上書き保存</DropdownMenuItem><DropdownMenuItem onSelect={() => void saveAs()}><SaveAll />名前を付けて保存</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Dialog open={Boolean(error)} onOpenChange={(open) => { if (!open) setError(undefined); }}><DialogContent><DialogHeader><DialogTitle>制度JSのエラー</DialogTitle><DialogDescription>{error}</DialogDescription></DialogHeader></DialogContent></Dialog></>;
}
