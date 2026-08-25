import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('制度定義画面', () => {
  it('共通数値定義を経営指標より前に表示し、区間と特別年を同じ追加UIで編集する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    const numeric = screen.getByRole('heading', { name: '共通数値定義' });
    const metrics = screen.getByRole('heading', { name: '経営指標・目標' });
    expect(numeric.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: '区間を追加' })).toBeVisible();
    expect(screen.getByRole('button', { name: '特別年を追加' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '特別年を追加' }));
    expect(screen.getByLabelText('特別年3 呼称')).toBeVisible();
    expect(screen.getByLabelText('特別年3 調整年数')).toHaveValue(0);
  });

  it('各定義ブロックのタイトルと追加操作を表示中は上部へ固定する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));

    const sections = [
      ['periods', '区間名の定義', '区間を追加'],
      ['special-years', '特別年の呼称', '特別年を追加'],
      ['numeric-definitions', '共通数値定義', '共通数値定義を追加'],
      ['management-metrics', '経営指標・目標', '経営指標を追加'],
    ];
    for (const [id, title, action] of sections) {
      const header = screen.getByTestId(`definition-section-header-${id}`);
      expect(header).toHaveClass('sticky', 'isolate', 'z-30');
      expect(header).toHaveStyle({ top: 'var(--app-toolbar-sticky-bottom)' });
      expect(header).toHaveClass('bg-surface');
      expect(header).not.toHaveClass('bg-surface/95', 'backdrop-blur');
      expect(within(header).getByRole('heading', { name: title })).toBeVisible();
      expect(within(header).getByRole('button', { name: action })).toBeVisible();
    }
  });

  it('各定義ブロックを共通カードとして表示し、見出しと本文に十分な内側余白を持たせる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));

    for (const id of ['periods', 'special-years', 'numeric-definitions', 'management-metrics']) {
      const card = screen.getByTestId(`definition-section-${id}`);
      const header = screen.getByTestId(`definition-section-header-${id}`);
      const body = screen.getByTestId(`definition-section-body-${id}`);
      expect(card).toHaveClass('border', 'bg-surface');
      expect(header).toHaveClass('px-4', 'py-3');
      expect(body).toHaveClass('px-4', 'pb-4');
    }

    const periods = screen.getByTestId('definition-section-periods');
    const specialYears = screen.getByTestId('definition-section-special-years');
    expect(periods.parentElement).toHaveClass('grid-cols-2');
    expect(periods).not.toContainElement(specialYears);
  });

  it('削除不可の過去実績も制度上の区間名として編集できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    const historicalName = screen.getByLabelText('過去実績区間 名称');
    await user.clear(historicalName);
    await user.type(historicalName, '直近実績期間');
    await user.click(screen.getByRole('button', { name: '02 期間・過去実績' }));
    expect(screen.getByText('直近実績期間')).toBeVisible();
  });

  it('指標の時点追加・削除から期間種別を自動表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    const card = screen.getByTestId('metric-company-value-added-growth');
    expect(card).toHaveTextContent('2時点指標');
    await user.click(screen.getByRole('button', { name: '全社付加価値増加率の時点を追加' }));
    expect(card).toHaveTextContent('3時点指標');
    await user.click(screen.getByRole('button', { name: '全社付加価値増加率の時点Bを削除' }));
    expect(card).toHaveTextContent('2時点指標');
    expect(card).not.toHaveTextContent('使用時点 B');
  });

  it('制度JSONの直接編集を見せず制度定義ファイルへ一本化する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    expect(screen.queryByRole('button', { name: '制度JSONを編集' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('制度JSONソース')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '制度定義ファイル' })).toBeVisible();
    expect(screen.getByText(/制度定義ファイルとして定義します/)).toBeVisible();
  });

  it('制度で不要になった経営指標を削除できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    expect(screen.getByTestId('metric-latest-roa')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '最新決算期のROAを削除' }));
    expect(screen.queryByTestId('metric-latest-roa')).not.toBeInTheDocument();
  });

  it('共通数値の名称を確定時に変更し、利用中の式を壊さず追従させる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    const name = screen.getByLabelText('数値定義2 名称');
    await user.clear(name);
    await user.type(name, '粗付加価値');
    await user.tab();
    expect((screen.getByLabelText('労働生産性 計算式') as HTMLTextAreaElement).value).toContain('[粗付加価値]');
  });
});
