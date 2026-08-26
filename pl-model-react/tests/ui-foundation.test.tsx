import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';
import { Button } from '../src/components/ui/button';

describe('共通UI基盤', () => {
  it('Buttonがvariantを共有クラスへ変換し、属性を引き継ぐ', () => {
    render(<Button variant="outline" aria-label="確認">確認</Button>);
    const button = screen.getByRole('button', { name: '確認' });
    expect(button).toHaveAttribute('data-slot', 'button');
    expect(button.className).toContain('border');
  });

  it('主要画面ナビゲーションをアイコン付きで表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const definition = screen.getByRole('button', { name: '01 制度定義' });
    expect(definition.querySelector('svg')).toBeInTheDocument();
    await user.click(definition);
    expect(definition).toHaveAttribute('aria-current', 'page');
  });

  it('制度共通・個社案件・参考の導線を別グループとして表示する', () => {
    render(<App />);

    const toolbar = screen.getByTestId('app-toolbar');
    const programNavigation = within(toolbar).getByRole('navigation', { name: '制度設定' });
    const caseNavigation = within(toolbar).getByRole('navigation', { name: '個社案件' });
    const referenceNavigation = within(toolbar).getByRole('navigation', { name: '参考' });

    expect(within(programNavigation).getByText('制度テンプレート')).toBeVisible();
    expect(within(programNavigation).queryByText('制度共通')).not.toBeInTheDocument();
    expect(within(caseNavigation).getByText('01 期間・過去実績')).toBeVisible();
    expect(within(caseNavigation).getByText('02 将来予測・PL')).toBeVisible();
    expect(within(referenceNavigation).getByText('計算ロジック')).toBeVisible();
    expect(within(referenceNavigation).queryByText('参考')).not.toBeInTheDocument();
  });

  it('画面タブと共通操作をスクロール中も上端に固定する', () => {
    render(<App />);

    const toolbar = screen.getByTestId('app-toolbar');
    expect(toolbar).toHaveClass('sticky', 'isolate', 'z-50');
    expect(toolbar).toHaveStyle({ top: '0px' });
    expect(toolbar).toHaveClass('bg-surface');
    expect(toolbar).not.toHaveClass('bg-surface/95', 'backdrop-blur');
    expect(within(toolbar).getByRole('navigation', { name: '制度設定' })).toBeVisible();
    expect(within(toolbar).getByRole('navigation', { name: '個社案件' })).toBeVisible();
    expect(within(toolbar).getByRole('navigation', { name: '参考' })).toBeVisible();
    expect(within(toolbar).getByLabelText('金額表示単位')).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: '案件JSON' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: '元に戻す Ctrl+Z' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'やり直す Ctrl+Y' })).toBeVisible();
  });
});
