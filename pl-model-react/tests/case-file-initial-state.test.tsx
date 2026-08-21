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

  it('初期表示は過去実績を空欄とし、案件JSON読込後に数値を表示する', async () => {
    const user = userEvent.setup();
    render(<App initialActuals="empty" />);
    const assets = screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 資産総額');
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
});
