import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { createDefaultProgram } from '../src/domain/timeline';

describe('AIで制度テンプレートを作成する', () => {
  it('プロンプトと検証資料を提供し、生成JSONを確認して制度へ反映する', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:program-template');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    expect(screen.getByText((_text, element) => element?.tagName === 'P' && element.textContent?.includes('subsidy-program.js') === true)).toHaveTextContent('HTMLと同じ階層');
    await user.click(screen.getByRole('button', { name: 'AIで制度テンプレートを作る' }));
    await user.click(screen.getByRole('button', { name: 'AI作成用プロンプトをコピー' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('# 制度テンプレートJSON作成プロンプト'));
    expect(await screen.findByText('プロンプトをコピーしました')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '制度テンプレートSchemaをダウンロード' }));
    await user.click(screen.getByRole('button', { name: '現在のテンプレート例をダウンロード' }));
    expect(createObjectURL).toHaveBeenCalledTimes(2);

    const generated = createDefaultProgram();
    generated.program.name = 'AI生成テスト制度';
    generated.definitions.periods[0].label = '設備導入期間';
    const source = JSON.stringify(generated);
    const file = new File([source], 'generated-program.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => source });
    await user.upload(screen.getByLabelText('AI生成制度テンプレートJSON'), file);

    const dialog = screen.getByRole('dialog', { name: 'AIで制度テンプレートを作る' });
    expect(await within(dialog).findByText('AI生成テスト制度')).toBeVisible();
    expect(within(dialog).getByText('設備導入期間')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: '制度テンプレートへ反映する' }));

    await waitFor(() => expect(screen.getByLabelText('制度名')).toHaveValue('AI生成テスト制度'));
    expect(screen.getByLabelText('区間1 名称')).toHaveValue('設備導入期間');
  });

  it('不正な生成JSONは反映しない', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    await user.click(screen.getByRole('button', { name: 'AIで制度テンプレートを作る' }));
    const invalid = new File(['{}'], 'invalid.json', { type: 'application/json' });
    Object.defineProperty(invalid, 'text', { value: async () => '{}' });
    await user.upload(screen.getByLabelText('AI生成制度テンプレートJSON'), invalid);

    expect(await screen.findByText(/制度テンプレートJSONを読み込めません/)).toBeVisible();
    expect(screen.getByRole('button', { name: '制度テンプレートへ反映する' })).toBeDisabled();
  });
});
