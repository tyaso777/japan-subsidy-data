import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

const importJson = JSON.stringify({
  format: 'pl-model-actuals',
  version: '1',
  amountUnit: 'million-yen',
  years: [2023, 2024, 2025],
  balanceSheets: [{ year: 2023, values: { assets: 1_050, cash: 180 } }],
  profitAndLoss: {
    base: [{ year: 2023, values: { sales: 900, cogs: 570, headcount: 110 } }],
    subsidy: [],
  },
  unmappedItems: ['支払利息'],
  notes: ['補助事業は資料に区分なし'],
});

describe('AIで過去実績を取り込む', () => {
  it('プロンプトとSchemaを提供し、検証結果を確認してからB/S・P/Lへ反映する', async () => {
    const user = userEvent.setup();
    render(<App initialActuals="empty" />);

    await user.click(screen.getByRole('button', { name: 'AIで過去実績を取り込む' }));
    expect(screen.getByRole('link', { name: 'AI変換用プロンプト' })).toHaveAttribute('href', './ai-actuals-import-prompt.md');
    expect(screen.getByRole('link', { name: 'JSON Schema' })).toHaveAttribute('href', './actuals-import.schema.json');

    const file = new File([importJson], 'actuals.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => importJson });
    await user.upload(screen.getByLabelText('過去実績JSONファイル'), file);

    const dialog = screen.getByRole('dialog', { name: 'AIで過去実績を取り込む' });
    expect(await within(dialog).findByText('2023年〜2025年（3期）')).toBeVisible();
    expect(within(dialog).getByText('百万円')).toBeVisible();
    expect(within(dialog).getByText('支払利息')).toBeVisible();
    expect(within(dialog).getByText('補助事業は資料に区分なし')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '過去実績へ反映する' }));

    await waitFor(() => expect(screen.getByLabelText('全社 B/S 2023年 資産総額')).toHaveValue(1050));
    expect(screen.getByLabelText('ベース事業 P/L 2023年 売上高')).toHaveValue(900);
    expect(screen.queryByRole('dialog', { name: 'AIで過去実績を取り込む' })).not.toBeInTheDocument();
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
