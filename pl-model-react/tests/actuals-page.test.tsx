import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('期間・過去実績', () => {
  it('ベース事業と補助事業をタブなしで同時表示する', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ベース事業 P/L' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '補助事業 P/L' })).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('各表の自動計算項目を独立して省略する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const baseSection = screen.getByTestId('historical-pl-base');
    const subsidySection = screen.getByTestId('historical-pl-subsidy');

    expect(within(baseSection).getByText('営業利益')).toBeVisible();
    expect(within(subsidySection).getByText('営業利益')).toBeVisible();
    await user.click(within(baseSection).getByRole('button', { name: '自動計算項目を省略' }));
    expect(within(baseSection).queryByText('営業利益')).not.toBeInTheDocument();
    expect(within(subsidySection).getByText('営業利益')).toBeVisible();
  });

  it('終了年を変えると次期間の開始年を連動させる', async () => {
    const user = userEvent.setup();
    render(<App />);
    const subsidyEnd = screen.getByLabelText('補助事業期間 終了年');
    await user.clear(subsidyEnd);
    await user.type(subsidyEnd, '2029');
    expect(screen.getByLabelText('事業化報告期間 開始年')).toHaveValue(2030);
  });

  it('制度で定義した特別年の呼称・解決年・基準を個社期間に表示し、期間変更へ追随する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const summary = screen.getByTestId('special-year-summary');
    expect(within(summary).getByText('最新決算期')).toBeVisible();
    expect(within(summary).getByText('2025年')).toBeVisible();
    expect(within(summary).getByText('基準年')).toBeVisible();
    expect(within(summary).getByText('2028年')).toBeVisible();
    expect(within(summary).getByText('補助事業期間・終了年 ±0年')).toBeVisible();

    const subsidyEnd = screen.getByLabelText('補助事業期間 終了年');
    await user.clear(subsidyEnd);
    await user.type(subsidyEnd, '2029');
    expect(within(summary).getByText('2029年')).toBeVisible();
  });

  it('旧BLUEPRINTと同じB/S 1-25 EBITDA有利子負債倍率を自動計算する', () => {
    render(<App />);
    const balanceSheet = screen.getByTestId('historical-bs');
    expect(within(balanceSheet).getByText('EBITDA有利子負債倍率')).toBeVisible();
    expect(within(balanceSheet).getAllByText(/倍$/)).toHaveLength(3);
  });

  it('特別年の呼称をP/L年見出しへ注入する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('tab', { name: 'PL表' }));
    const table = screen.getByTestId('forecast-pl-table');
    expect(within(table).getByText('最新決算期')).toBeVisible();
    expect(within(table).getByText('基準年')).toBeVisible();
    expect(within(table).getByText('事業化報告期間3年目')).toBeVisible();
  });

  it('削除不可の過去実績区間も開始・終了年を入力でき、3期幅と次期間を連動する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const historicalEnd = screen.getByLabelText('過去実績 終了年');
    await user.clear(historicalEnd); await user.type(historicalEnd, '2026');
    expect(screen.getByLabelText('過去実績 開始年')).toHaveValue(2024);
    expect(screen.getByLabelText('補助事業期間 開始年')).toHaveValue(2027);
    expect(within(screen.getByTestId('historical-bs')).getByText('2026年')).toBeVisible();
    expect(within(screen.getByTestId('historical-pl-base')).getByText('2026年')).toBeVisible();
    expect(within(screen.getByTestId('historical-pl-subsidy')).getByText('2026年')).toBeVisible();
  });

  it('モデル変更をCtrl+ZとCtrl+Yで戻して進める', async () => {
    const user = userEvent.setup();
    render(<App />);
    const subsidyEnd = screen.getByLabelText('補助事業期間 終了年');
    await user.clear(subsidyEnd);
    await user.type(subsidyEnd, '2029');
    expect(screen.getByLabelText('事業化報告期間 開始年')).toHaveValue(2030);

    await user.keyboard('{Control>}z{/Control}');
    expect(screen.getByLabelText('事業化報告期間 開始年')).toHaveValue(2029);
    await user.keyboard('{Control>}y{/Control}');
    expect(screen.getByLabelText('事業化報告期間 開始年')).toHaveValue(2030);
  });

  it('編集中の入力からUndoボタンを押しても一度で変更前へ戻る', async () => {
    const user = userEvent.setup();
    render(<App />);
    const subsidyEnd = screen.getByLabelText('補助事業期間 終了年');
    await user.clear(subsidyEnd);
    await user.type(subsidyEnd, '2029');
    await user.click(screen.getByRole('button', { name: '元に戻す Ctrl+Z' }));
    expect(screen.getByLabelText('事業化報告期間 開始年')).toHaveValue(2029);
  });

  it('金額表示単位を切り替えても内部値を変えず表示だけ変える', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sales = screen.getByLabelText('ベース事業 P/L 2025年 売上高');
    expect(sales).toHaveValue(1000);
    await user.click(screen.getByRole('combobox', { name: '金額表示単位' }));
    await user.click(screen.getByRole('option', { name: '億円' }));
    expect(sales).toHaveValue(10);
    expect(screen.getByTestId('historical-pl-base')).toHaveTextContent('金額表示：億円');
  });

  it('金額の複数桁入力を一度のUndoで入力前へ戻す', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sales = screen.getByLabelText('ベース事業 P/L 2023年 売上高');
    await user.clear(sales);
    await user.type(sales, '1234');
    await user.tab();
    expect(sales).toHaveValue(1234);
    await user.keyboard('{Control>}z{/Control}');
    expect(sales).toHaveValue(900);
  });

  it('過去B/S・P/L入力後に水準範囲を適正化し、将来予測へ反映する', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '過去実績から水準範囲を適正化' }));
    expect(screen.getByText(/水準範囲を更新しました/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    expect(screen.getByLabelText('補助事業期間 売上高 最小値')).not.toHaveValue(-10);
    expect(screen.getByLabelText('補助事業期間 売上高 最大値')).not.toHaveValue(50);
  });
});
