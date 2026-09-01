import { useRef, useState, type ChangeEvent } from 'react';
import { Bot, Copy, FileJson2, Upload } from 'lucide-react';
import programTemplatePrompt from '../../assets/ai-program-template-prompt.md?raw';
import programTemplateSchema from '../../assets/program-template.schema.json?raw';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { parseProgramTemplateJson } from '../../domain/program-file';
import type { ProgramConfiguration } from '../../domain/types';
import { copyText } from '../../lib/text-resource-actions';
import { useModelStore } from '../../store/model-store-context';

export function ProgramTemplateAiDialog() {
  const replaceProgram = useModelStore((state) => state.replaceProgram);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ProgramConfiguration>();
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const [resourceMessage, setResourceMessage] = useState<string>();
  const completePrompt = `${programTemplatePrompt.trim()}\n\n## 準拠するJSON Schema\n\n以下のSchemaをこの依頼の一部として使用し、別ファイルの添付を要求しないでください。\n\n\u0060\u0060\u0060json\n${programTemplateSchema.trim()}\n\u0060\u0060\u0060\n`;

  const reset = () => { setPreview(undefined); setFileName(undefined); setError(undefined); setResourceMessage(undefined); };
  const read = async (file: File) => {
    try {
      setPreview(parseProgramTemplateJson(await file.text()));
      setFileName(file.name);
      setError(undefined);
    } catch (cause) {
      setPreview(undefined);
      setFileName(file.name);
      setError(`制度テンプレートJSONを読み込めません：${cause instanceof Error ? cause.message : '形式を確認してください'}`);
    }
  };

  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Bot />AIで制度テンプレートを作る</Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AIで制度テンプレートを作る</DialogTitle>
          <DialogDescription>公募要領・指標資料と、Schema・出力仕様を内包した1つのプロンプトをCopilot等へ渡し、生成されたJSONを検証してから制度テンプレートへ反映します。</DialogDescription>
        </DialogHeader>
        <input ref={inputRef} className="hidden" aria-label="AI生成制度テンプレートJSON" type="file" accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
          event.target.value = '';
        }} />
        <div className="grid gap-3 rounded-md border border-line bg-soft/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" aria-label="AI作成用プロンプトをコピー" onClick={async () => {
              try { await copyText(completePrompt); setResourceMessage('Schemaと出力仕様を含むプロンプトをコピーしました'); }
              catch { setResourceMessage('プロンプトをコピーできませんでした'); }
            }}><Copy />AI作成用プロンプトをコピー</Button>
          </div>
          {resourceMessage && <p role="status" className="m-0 text-[11px] font-bold text-teal">{resourceMessage}</p>}
          <p className="m-0 text-[11px] leading-relaxed text-muted-foreground">コピーは1回だけです。プロンプトにJSON Schema、ファイル名、UTF-8 JSON形式を含みます。画面側でも参照ID・数式依存・期間整合を検証し、生成コードは実行しません。</p>
          <Button className="w-fit" onClick={() => inputRef.current?.click()}><Upload />生成されたJSONを選択</Button>
        </div>
        {error && <div role="alert" className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-orange/40 bg-orange/5 p-3 text-xs text-orange">{error}</div>}
        {preview && <div className="grid gap-2 rounded-md border border-teal/35 bg-teal/5 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">制度テンプレートの確認</strong><span className="text-muted-foreground">{fileName}</span></div>
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">制度名</dt><dd className="m-0 font-bold">{preview.program.name}</dd>
            <dt className="text-muted-foreground">区間</dt><dd className="m-0 flex flex-wrap gap-1">{preview.definitions.periods.map((period) => <span key={period.id} className="rounded bg-surface px-1.5 py-0.5">{period.label}</span>)}</dd>
            <dt className="text-muted-foreground">特別年</dt><dd className="m-0">{preview.definitions.specialYears.length}件</dd>
            <dt className="text-muted-foreground">共通数値定義</dt><dd className="m-0">{preview.definitions.commonNumericDefinitions.length}件</dd>
            <dt className="text-muted-foreground">経営指標・目標</dt><dd className="m-0">{preview.definitions.managementMetrics.length}件</dd>
          </dl>
          <p className="m-0 border-t border-teal/20 pt-2 text-[10px] text-muted-foreground">反映後、内容を画面で確認し、「制度定義ファイル → 名前を付けて保存」で自動読込用のsubsidy-program.jsを保存できます。</p>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button disabled={!preview} onClick={() => { if (!preview) return; replaceProgram(preview); setOpen(false); reset(); }}><FileJson2 />制度テンプレートへ反映する</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
