import { fireEvent, render, screen } from '@testing-library/react';
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

  it('制度JSONを画面上で検証してから適用する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    await user.click(screen.getByRole('button', { name: '制度JSONを編集' }));
    const source = screen.getByLabelText('制度JSONソース');
    const parsed = JSON.parse((source as HTMLTextAreaElement).value);
    parsed.program.name = 'JSON編集制度';
    fireEvent.change(source, { target: { value: JSON.stringify(parsed) } });
    await user.click(screen.getByRole('button', { name: '制度JSONを検証' }));
    expect(screen.getByRole('status')).toHaveTextContent('検証OK');
    await user.click(screen.getByRole('button', { name: '制度JSONを適用' }));
    expect(screen.getByLabelText('制度名')).toHaveValue('JSON編集制度');
  });

  it('制度で不要になった経営指標を削除できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '01 制度定義' }));
    expect(screen.getByTestId('metric-latest-roa')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '最新決算期 ROAを削除' }));
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
