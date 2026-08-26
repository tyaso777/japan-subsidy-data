import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { App } from '../src/app/App';
import { parseModelFile, serializeModelFile } from '../src/domain/model-file';
import { createModelStore } from '../src/store/model-store';

describe('案件JSONを読み込む前後の過去実績', () => {
  it('配布用サンプル案件JSONは標準サンプルモデルと一致する', () => {
    const sample = createModelStore().getState();
    const expected = { program: sample.program, actuals: sample.actuals, forecast: sample.forecast, caseSettings: sample.caseSettings };
    const json = readFileSync(resolve(process.cwd(), 'public/sample-case.json'), 'utf8');
    expect(parseModelFile(json)).toEqual(expected);
  });

  it('補助事業実績なしのサンプル案件JSONも同梱する', () => {
    const json = readFileSync(resolve(process.cwd(), 'public/sample-case-no-subsidy-history.json'), 'utf8');
    const snapshot = parseModelFile(json);
    expect(snapshot.actuals.basePl.at(-1)?.sales).toBe(1_000_000_000);
    expect(snapshot.actuals.subsidyPl.every((row) => row.sales === 0)).toBe(true);
  });

  it('初期表示は過去実績を空欄とし、案件JSON読込後に数値を表示する', async () => {
    const user = userEvent.setup();
    render(<App initialActuals="empty" />);
    const assets = screen.getByLabelText('全社 B/S 2023年 資産総額');
    const sales = screen.getByLabelText('ベース事業 P/L 2023年 売上高');
    expect(assets).toHaveValue(null);
    expect(sales).toHaveValue(null);
    const baseTable = screen.getByTestId('historical-pl-base');
    expect(within(baseTable).getByRole('row', { name: /売上高成長率/ })).toHaveTextContent('—');

    const sample = createModelStore().getState();
    const sampleJson = serializeModelFile({ program: sample.program, actuals: sample.actuals, forecast: sample.forecast, caseSettings: sample.caseSettings });
    const file = new File([sampleJson], 'sample-case.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => sampleJson });
    await user.upload(screen.getByLabelText('案件JSONファイル'), file);

    await waitFor(() => expect(assets).toHaveValue(1050));
    expect(sales).toHaveValue(900);
  });

  it('案件JSON本体ボタンから直接ファイル選択を開く', async () => {
    const user = userEvent.setup();
    render(<App initialActuals="empty" />);
    const fileInput = screen.getByLabelText('案件JSONファイル');
    const click = vi.spyOn(fileInput as HTMLInputElement, 'click');

    await user.click(screen.getByRole('button', { name: '案件JSON' }));

    expect(click).toHaveBeenCalledOnce();
    fireEvent.change(fileInput, { target: { files: [] } });
  });

  it('ファイルを選択せず同梱サンプルデータを読み込める', async () => {
    const user = userEvent.setup();
    render(<App initialActuals="empty" />);
    const assets = screen.getByLabelText('全社 B/S 2023年 資産総額');
    const sales = screen.getByLabelText('ベース事業 P/L 2023年 売上高');
    expect(assets).toHaveValue(null);
    expect(sales).toHaveValue(null);

    await user.click(screen.getByRole('button', { name: '案件JSONメニュー' }));
    await user.click(screen.getByRole('menuitem', { name: 'サンプルデータを読み込み（補助事業実績あり）' }));

    expect(assets).toHaveValue(1050);
    expect(sales).toHaveValue(900);
    expect(screen.getByRole('button', { name: 'sample-case.json' })).toBeVisible();
  });

  it('編集中にサンプルデータを読み込む前に確認し、キャンセル時は既存値を維持する', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<App initialActuals="empty" />);
    const assets = screen.getByLabelText('全社 B/S 2023年 資産総額');
    await user.type(assets, '123');
    await user.tab();

    await user.click(screen.getByRole('button', { name: '案件JSONメニュー' }));
    expect(screen.getByRole('menuitem', { name: '上書き保存' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '名前を付けて保存' })).toBeVisible();
    expect(screen.getByText('案件データ')).toBeVisible();
    expect(screen.getByText('結果出力')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Excelで出力' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'HTMLで出力' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'サンプルデータを読み込み（補助事業実績あり）' }));

    expect(confirm).toHaveBeenLastCalledWith('既存のデータが消えますが、よろしいでしょうか。');
    expect(assets).toHaveValue(123);

    await user.click(screen.getByRole('button', { name: '案件JSONメニュー' }));
    await user.click(screen.getByRole('menuitem', { name: 'サンプルデータを読み込み（補助事業実績あり）' }));

    expect(assets).toHaveValue(1050);
  });

  it('補助事業の過去実績がないサンプルを読み込める', async () => {
    const user = userEvent.setup();
    render(<App initialActuals="empty" />);

    await user.click(screen.getByRole('button', { name: '案件JSONメニュー' }));
    await user.click(screen.getByRole('menuitem', { name: 'サンプルデータを読み込み（補助事業実績なし）' }));

    expect(screen.getByLabelText('ベース事業 P/L 2025年 売上高')).toHaveValue(1000);
    expect(screen.getByLabelText('補助事業 P/L 2025年 売上高')).toHaveValue(0);
    expect(screen.getByRole('button', { name: 'sample-case-no-subsidy-history.json' })).toBeVisible();
  });

  it('案件メニューから計算済みP/LをExcelとHTMLで出力する', async () => {
    const user = userEvent.setup();
    const downloads: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:case-result') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '案件JSONメニュー' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excelで出力' }));
    await user.click(screen.getByRole('button', { name: '案件JSONメニュー' }));
    await user.click(screen.getByRole('menuitem', { name: 'HTMLで出力' }));

    expect(downloads).toEqual([
      expect.stringMatching(/^pl-model-results-\d{4}-\d{2}-\d{2}\.xlsx$/),
      expect.stringMatching(/^pl-model-results-\d{4}-\d{2}-\d{2}\.html$/),
    ]);
  });
});
