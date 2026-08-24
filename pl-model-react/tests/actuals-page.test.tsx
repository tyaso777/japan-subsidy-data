import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';

describe('期間・過去実績', () => {
  it('広い画面でも入力領域を引き伸ばしすぎず中央配置する', () => {
    render(<App />);

    expect(screen.getByTestId('actuals-page')).toHaveClass('mx-auto', 'w-full', 'max-w-[1360px]');
    for (const testId of ['historical-bs', 'historical-pl-base', 'historical-pl-subsidy']) {
      expect(screen.getByTestId(testId)).toHaveAttribute('data-density', 'compact');
      expect(screen.getByTestId(testId)).toHaveClass('mx-auto', 'w-full');
      expect(screen.getByTestId(testId)).toHaveStyle({ maxWidth: '604px' });
      expect(within(screen.getByTestId(testId)).getByTestId(`${testId}-subject-column`)).toHaveStyle({ width: '32%' });
      expect(within(screen.getByTestId(testId)).getByTestId(`${testId}-start-gutter`)).toHaveClass('w-3');
      expect(within(screen.getByTestId(testId)).getByTestId(`${testId}-end-gutter`)).toHaveClass('w-3');
    }
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 資産総額')).toHaveClass('h-5', 'w-[min(72px,100%)]');
  });

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

  it('各財務表の見出しを表の表示中だけ上部ツールバー直下へ固定する', () => {
    render(<App />);

    for (const testId of ['historical-bs', 'historical-pl-base', 'historical-pl-subsidy']) {
      const section = screen.getByTestId(testId);
      const stickyHeader = within(section).getByTestId(`${testId}-sticky-header`);
      expect(section).toHaveClass('relative', 'isolate');
      expect(stickyHeader).toHaveClass('sticky', 'isolate', 'z-40');
      expect(stickyHeader).toHaveStyle({ top: 'var(--app-toolbar-sticky-bottom)' });
      expect(within(stickyHeader).getByText('科目番号')).toBeVisible();
      expect(within(stickyHeader).getByText('科目名')).toBeVisible();
      expect(within(stickyHeader).getByText('最新決算期')).toBeVisible();
    }
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

  it('過去実績の開始・終了年を独立して変更し、任意の期数へ拡張して既存値を暦年で保持する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const historicalEnd = screen.getByLabelText('過去実績 終了年');
    await user.clear(historicalEnd); await user.type(historicalEnd, '2026');
    expect(screen.getByLabelText('過去実績 開始年')).toHaveValue(2023);
    expect(screen.getByLabelText('補助事業期間 開始年')).toHaveValue(2027);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 資産総額')).toHaveValue(1050);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2026年 資産総額')).toHaveValue(null);

    const historicalStart = screen.getByLabelText('過去実績 開始年');
    await user.clear(historicalStart); await user.type(historicalStart, '2021');
    expect(screen.getByLabelText('過去実績 終了年')).toHaveValue(2026);
    expect(screen.getByLabelText('補助事業期間 開始年')).toHaveValue(2027);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2021年 資産総額')).toHaveValue(null);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 資産総額')).toHaveValue(1050);
    expect(screen.getByTestId('historical-bs')).toHaveStyle({ maxWidth: '874px' });
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

  it('Excelの複数セルを一括貼り付けし、一度のUndoで全件を戻す', async () => {
    const user = userEvent.setup();
    render(<App />);
    const cash2023 = screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 資産総額');

    await user.click(cash2023);
    fireEvent.paste(cash2023, { clipboardData: { getData: () => '111\t222\n333\t444' } });

    expect(cash2023).toHaveValue(111);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2024年 資産総額')).toHaveValue(222);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 うち流動資産')).toHaveValue(333);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2024年 うち流動資産')).toHaveValue(444);
    expect(within(screen.getByTestId('historical-bs')).getByText('4件を貼り付けました')).toBeInTheDocument();

    await user.keyboard('{Control>}z{/Control}');
    expect(cash2023).toHaveValue(1050);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2024年 資産総額')).toHaveValue(1115);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 うち流動資産')).toHaveValue(555);
    expect(screen.getByLabelText('全社 B/S（1-1～1-25） 2024年 うち流動資産')).toHaveValue(599);
  });

  it('Shiftで選択した範囲をExcel向けTSVとしてコピーする', () => {
    render(<App />);
    const cash2023 = screen.getByLabelText('全社 B/S（1-1～1-25） 2023年 資産総額');
    const receivable2024 = screen.getByLabelText('全社 B/S（1-1～1-25） 2024年 うち流動資産');
    fireEvent.click(cash2023);
    fireEvent.click(receivable2024, { shiftKey: true });
    let copied = '';

    fireEvent.copy(receivable2024, { clipboardData: { setData: (_type: string, value: string) => { copied = value; } } });

    expect(copied).toBe('1050\t1115\n555\t599');
  });

  it('科目番号から3期目までドラッグするだけで5列をExcel向けTSVとしてコピーする', () => {
    render(<App />);
    const table = screen.getByTestId('historical-bs');
    const codeCell = within(table).getByText('1-1').closest<HTMLElement>('[data-grid-cell="true"]');
    const label = within(table).getByText('資産総額');
    const finalValue = screen.getByLabelText('全社 B/S（1-1～1-25） 2025年 資産総額');
    const finalCell = finalValue.closest<HTMLElement>('[data-grid-cell="true"]');
    expect(codeCell).not.toBeNull();
    expect(finalCell).not.toBeNull();

    const nativeSelection = window.getSelection();
    const nativeRange = document.createRange();
    nativeRange.selectNodeContents(label);
    nativeSelection?.addRange(nativeRange);
    expect(nativeSelection?.toString()).toBe('資産総額');

    const mouseDown = createEvent.mouseDown(codeCell!, { button: 0, buttons: 1 });
    fireEvent(codeCell!, mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(nativeSelection?.toString()).toBe('');
    fireEvent.mouseEnter(finalCell!, { buttons: 1 });
    fireEvent.mouseUp(window);
    let copied = '';
    expect(document.activeElement).toBe(codeCell);
    fireEvent.copy(document.activeElement!, { clipboardData: { setData: (_type: string, value: string) => { copied = value; } } });

    expect(copied).toBe('1-1\t資産総額\t1050\t1115\t1208');
  });

  it('過去P/Lでは空欄を維持し、自動計算行を飛ばして入力行だけ更新する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sales2023 = screen.getByLabelText('ベース事業 P/L 2023年 売上高');

    await user.click(sales2023);
    fireEvent.paste(sales2023, { clipboardData: { getData: () => '1,100\t\n5%\t5\n660\t690' } });

    expect(sales2023).toHaveValue(1100);
    expect(screen.getByLabelText('ベース事業 P/L 2024年 売上高')).toHaveValue(950);
    expect(screen.getByLabelText('ベース事業 P/L 2023年 売上原価')).toHaveValue(660);
    expect(screen.getByLabelText('ベース事業 P/L 2024年 売上原価')).toHaveValue(690);
    expect(within(screen.getByTestId('historical-pl-base')).getByText('3件を貼り付けました（2件は入力対象外）')).toBeInTheDocument();
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

  it('最下部の次へボタンから将来予測・PLへ移動する', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<App />);

    await user.click(screen.getByRole('button', { name: '次へ：03 将来予測・PL' }));

    expect(screen.getByRole('button', { name: '03 将来予測・PL' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('将来予測・調整水準')).toBeVisible();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' }));
    scrollTo.mockRestore();
  });
});
