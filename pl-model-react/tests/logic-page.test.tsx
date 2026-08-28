import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('ロジックマップ画面', () => {
  it('内部の計算順を見せずに共通数値定義と参照関係を表示する', async () => {
    render(<App initialPage="logic" />);
    expect(screen.getByText(/制度テンプレートで定義され、すべての個別案件に共通して使用/)).toBeVisible();

    const map = screen.getByTestId('definition-logic-map');
    expect(within(map).getByRole('heading', { name: '人件費' })).toBeVisible();
    expect(within(map).getByRole('heading', { name: '付加価値額' })).toBeVisible();
    expect(within(map).getByRole('heading', { name: '労働生産性' })).toBeVisible();
    expect(within(map).getByText('[付加価値額][t] / [従業員数（就業時間換算）][t]')).toBeVisible();
    expect(within(map).queryByText(/計算順/)).not.toBeInTheDocument();
    expect(within(map).getAllByText('参照する共通数値定義')).toHaveLength(2);
    expect(map.querySelector('.lucide-arrow-right')).not.toBeInTheDocument();
  });

  it('PL項目を並べ、参照項目・設定値・影響先を選択して確認できる', async () => {
    const user = userEvent.setup();
    render(<App initialPage="logic" />);

    const plMap = screen.getByTestId('pl-logic-map');
    expect(within(plMap).getByRole('button', { name: /^1売上高$/ })).toBeVisible();
    expect(within(plMap).getByRole('button', { name: /^17営業利益$/ })).toBeVisible();
    await user.click(within(plMap).getByRole('button', { name: /^17営業利益$/ }));
    const detail = screen.getByTestId('logic-detail');
    expect(screen.getByTestId('pl-logic-section')).not.toHaveClass('[&>aside]:top-16');
    expect(detail).toHaveClass('sticky', 'isolate', 'overflow-hidden', 'bg-surface');
    expect(detail).toHaveStyle({ top: 'calc(var(--app-toolbar-sticky-bottom) + 12px)' });
    expect(screen.getByTestId('logic-detail-header')).toHaveClass('relative', 'shrink-0', 'bg-surface');
    expect(screen.getByTestId('logic-detail-header')).not.toHaveClass('sticky');
    expect(screen.getByTestId('logic-detail-body')).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(detail).toHaveTextContent('参照するPL項目');
    expect(detail).toHaveTextContent('販売費及び一般管理費');
    expect(detail).toHaveTextContent('この項目が影響する先');
  });

  it('編集中の不完全な共通式でも画面を壊さず検証エラーを表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    const formula = screen.getByLabelText('人件費 計算式');
    await user.clear(formula);
    fireEvent.change(formula, { target: { value: '[未定義][t]' } });
    await user.click(screen.getByRole('button', { name: '04 ロジックマップ' }));
    expect(screen.getByRole('alert')).toHaveTextContent('未定義');
    expect(screen.getByRole('heading', { name: '制度テンプレートの共通数値定義' })).toBeVisible();
  });
});
