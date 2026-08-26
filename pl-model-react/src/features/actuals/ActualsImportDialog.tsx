import { useRef, useState, type ChangeEvent } from 'react';
import { Bot, Copy, Download, FileJson2, Upload } from 'lucide-react';
import actualsImportPrompt from '../../assets/ai-actuals-import-prompt.md?raw';
import actualsImportSchema from '../../assets/actuals-import.schema.json?raw';
import actualsImportTemplate from '../../assets/actuals-import-template.json?raw';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { parseActualsImportFile, type ActualsImportResult } from '../../domain/actuals-import';
import { useModelStore } from '../../store/model-store-context';

const amountUnitLabels = { yen: '円', 'thousand-yen': '千円', 'million-yen': '百万円' } as const;

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  textarea.remove();
  if (!copied) throw new Error('clipboard unavailable');
}

function downloadTextFile(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function countValues(records: object[]) {
  return records.reduce((count, record) => count + Object.values(record).filter((value) => typeof value === 'number').length, 0);
}

export function ActualsImportDialog() {
  const importHistoricalActuals = useModelStore((state) => state.importHistoricalActuals);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ActualsImportResult>();
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const [resourceMessage, setResourceMessage] = useState<string>();

  const reset = () => { setPreview(undefined); setFileName(undefined); setError(undefined); setResourceMessage(undefined); };
  const read = async (file: File) => {
    try {
      setPreview(parseActualsImportFile(await file.text()));
      setFileName(file.name);
      setError(undefined);
    } catch (cause) {
      setPreview(undefined);
      setFileName(file.name);
      setError(`過去実績JSONを読み込めません：${cause instanceof Error ? cause.message : '形式を確認してください'}`);
    }
  };

  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Bot />AIで過去実績を取り込む</Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AIで過去実績を取り込む</DialogTitle>
          <DialogDescription>既存のB/S・P/Lと下記ファイルをCopilot等へ渡し、生成された過去実績JSONを検証してから反映します。</DialogDescription>
        </DialogHeader>
        <input ref={inputRef} className="hidden" aria-label="過去実績JSONファイル" type="file" accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
          event.target.value = '';
        }} />
        <div className="grid gap-3 rounded-md border border-line bg-soft/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" aria-label="AI変換用プロンプトをコピー" onClick={async () => {
              try {
                await copyText(actualsImportPrompt);
                setResourceMessage('プロンプトをコピーしました');
              } catch {
                setResourceMessage('プロンプトをコピーできませんでした');
              }
            }}><Copy />AI変換用プロンプトをコピー</Button>
            <Button variant="outline" size="sm" aria-label="JSON Schemaをダウンロード" onClick={() => {
              downloadTextFile('actuals-import.schema.json', actualsImportSchema, 'application/schema+json;charset=utf-8');
              setResourceMessage('JSON Schemaをダウンロードしました');
            }}><Download />JSON Schema</Button>
            <Button variant="outline" size="sm" aria-label="入力テンプレートをダウンロード" onClick={() => {
              downloadTextFile('actuals-import-template.json', actualsImportTemplate, 'application/json;charset=utf-8');
              setResourceMessage('入力テンプレートをダウンロードしました');
            }}><Download />入力テンプレート</Button>
          </div>
          {resourceMessage && <p role="status" className="m-0 text-[11px] font-bold text-teal">{resourceMessage}</p>}
          <p className="m-0 text-[11px] leading-relaxed text-muted-foreground">資料にない値は推測せずnull、自動計算項目は出力せず、対応できない科目はunmappedItemsへ残す仕様です。</p>
          <Button className="w-fit" onClick={() => inputRef.current?.click()}><Upload />生成されたJSONを選択</Button>
        </div>
        {error && <div role="alert" className="max-h-32 overflow-auto rounded-md border border-orange/40 bg-orange/5 p-3 text-xs text-orange">{error}</div>}
        {preview && <div className="grid gap-2 rounded-md border border-teal/35 bg-teal/5 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">取込内容の確認</strong><span className="text-muted-foreground">{fileName}</span></div>
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">対象期間</dt><dd className="m-0 font-bold">{preview.years[0]}年〜{preview.years.at(-1)}年（{preview.years.length}期）</dd>
            <dt className="text-muted-foreground">資料の金額単位</dt><dd className="m-0 font-bold">{amountUnitLabels[preview.amountUnit]}</dd>
            <dt className="text-muted-foreground">認識した入力値</dt><dd className="m-0">B/S {countValues(preview.actuals.balanceSheets)}件・ベースP/L {countValues(preview.actuals.basePl)}件・補助事業P/L {countValues(preview.actuals.subsidyPl)}件</dd>
          </dl>
          {preview.unmappedItems.length > 0 && <div><strong>未対応科目</strong><ul className="mt-1 mb-0 pl-5">{preview.unmappedItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
          {preview.notes.length > 0 && <div><strong>AIからの注記</strong><ul className="mt-1 mb-0 pl-5">{preview.notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}</ul></div>}
          <p className="m-0 border-t border-teal/20 pt-2 text-[10px] text-muted-foreground">反映すると現在の過去実績を置き換え、最新実績を基準に将来予測を初期化します。制度定義と個社目標は維持されます。</p>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button disabled={!preview} onClick={() => { if (!preview) return; importHistoricalActuals(preview); setOpen(false); reset(); }}><FileJson2 />過去実績へ反映する</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
