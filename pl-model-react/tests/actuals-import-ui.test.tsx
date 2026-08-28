import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import actualsImportPrompt from '../src/assets/ai-actuals-import-prompt.md?raw';

const importJson = JSON.stringify({
  format: 'pl-model-actuals',
  version: '1',
  amountUnit: 'million-yen',
  years: [2022, 2023, 2024, 2025],
  balanceSheets: [{ year: 2022, values: { assets: 9_999 } }, { year: 2023, values: { assets: 1_050, cash: 180 } }],
  profitAndLoss: {
    inputMode: 'base',
    base: [{ year: 2023, values: { sales: 900, cogs: 570, headcount: 110 } }],
    subsidy: [],
  },
  unmappedItems: ['支払利息'],
  notes: ['補助事業は資料に区分なし'],
});

describe('AIで過去実績を取り込む', () => {
  it('プロンプトとSchemaを提供し、検証結果を確認してからB/S・P/Lへ反映する', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:actuals-import');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<App initialActuals="empty" />);

    await user.click(screen.getByRole('button', { name: 'AIで過去実績を取り込む' }));
    await user.click(screen.getByRole('button', { name: 'AI変換用プロンプトをコピー' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('# 過去実績JSON変換プロンプト'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## 具体例'));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('actuals-import-template.json'));
    expect(await screen.findByText('プロンプトをコピーしました')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'JSON Schemaをダウンロード' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:actuals-import');
    expect(screen.queryByRole('link', { name: /JSON Schema/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力テンプレートをダウンロード' })).not.toBeInTheDocument();

    const file = new File([importJson], 'actuals.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => importJson });
    await user.upload(screen.getByLabelText('過去実績JSONファイル'), file);

    const dialog = screen.getByRole('dialog', { name: 'AIで過去実績を取り込む' });
    expect(await within(dialog).findByText('今回の取込対象')).toBeVisible();
    expect(within(dialog).getByText('2022年〜2025年（4期）')).toBeVisible();
    expect(within(dialog).getByText('2023年〜2025年（3期）')).toBeVisible();
    expect(within(dialog).getByText('百万円')).toBeVisible();
    expect(within(dialog).getByText('ベース事業P/L＋補助事業P/L')).toBeVisible();
    expect(within(dialog).getByText('支払利息')).toBeVisible();
    expect(within(dialog).getByText('補助事業は資料に区分なし')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '過去実績へ反映する' }));

    await waitFor(() => expect(screen.getByLabelText('全社 B/S 2023年 資産総額')).toHaveValue(1050));
    expect(screen.getByLabelText('ベース事業 P/L 2023年 売上高')).toHaveValue(900);
    expect(screen.queryByRole('dialog', { name: 'AIで過去実績を取り込む' })).not.toBeInTheDocument();
  });

  it('プロンプト内の具体例は読み込み可能な過去実績JSONである', async () => {
    const example = actualsImportPrompt.match(/```json\s*([\s\S]*?)\s*```/)?.[1];
    expect(example).toBeDefined();
    const { parseActualsImportFile } = await import('../src/domain/actuals-import');
    expect(() => parseActualsImportFile(example!)).not.toThrow();
  });

  it('不正なJSONは反映せずエラーを表示する', async () => {
    const user = userEvent.setup();
    render(<App initialActuals="empty" />);
    await user.click(screen.getByRole('button', { name: 'AIで過去実績を取り込む' }));
    const invalid = new File(['{}'], 'invalid.json', { type: 'application/json' });
    Object.defineProperty(invalid, 'text', { value: async () => '{}' });

    await user.upload(screen.getByLabelText('過去実績JSONファイル'), invalid);

    expect(await screen.findByText(/過去実績JSONを読み込めません/)).toBeVisible();
    expect(screen.getByLabelText('全社 B/S 2023年 資産総額')).toHaveValue(null);
  });
});
