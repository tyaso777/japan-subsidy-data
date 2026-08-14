import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('将来予測・PL画面', () => {
  it('全水準とチャート・PL表・事業比較を同じ画面で切り替える', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    expect(screen.getByRole('heading', { name: '将来予測・調整水準' })).toBeVisible();
    expect(screen.getByText('金額単位：百万円')).toBeVisible();
    expect(screen.queryByText('内部：円')).not.toBeInTheDocument();
    expect(screen.getAllByText('原価率').length).toBeGreaterThan(0);
    expect(screen.getAllByText('研究開発費の売上高比率').length).toBeGreaterThan(0);
    expect(screen.getAllByText('実効税率').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: /推移チャート/ })).toHaveLength(10);
    expect(screen.getByRole('img', { name: '売上原価の内訳 推移チャート' })).toBeVisible();
    expect(screen.getByRole('img', { name: '人件費の内訳 推移チャート' })).toBeVisible();
    expect(screen.getByRole('img', { name: '従業員数（就業時間換算） 推移チャート' })).toBeVisible();
    expect(screen.getByRole('img', { name: '1人当たり給与 推移チャート' })).toBeVisible();
    expect(screen.getByRole('img', { name: '労働生産性 推移チャート' })).toBeVisible();
    expect(screen.getByRole('img', { name: '前年比増加率 推移チャート' }).closest('article')).toHaveTextContent('従業員数（就業時間換算）増加率');
    expect(screen.getByRole('img', { name: '前年比増加率 推移チャート' }).closest('article')).toHaveTextContent('1人当たり給与増加率');
    expect(screen.getByRole('img', { name: '前年比増加率 推移チャート' }).closest('article')).toHaveTextContent('従業員人件費増加率');
    expect(screen.getByRole('img', { name: '収益性 推移チャート' }).closest('article')).toHaveTextContent('売上原価率');
    expect(screen.getByRole('img', { name: '収益性 推移チャート' }).closest('article')).toHaveTextContent('その他販管費率');
    expect(screen.getByRole('img', { name: '営業利益以下 推移チャート' }).closest('article')).toHaveTextContent('営業外損益');
    expect(screen.getByRole('img', { name: '営業利益以下 推移チャート' }).closest('article')).toHaveTextContent('特別損益');
    const profitChart = screen.getByRole('img', { name: '売上高・利益額 推移チャート' });
    expect(profitChart.querySelector('[data-line-phase="actual"]')).toBeInTheDocument();
    expect(profitChart.querySelector('[data-line-phase="forecast"]')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'PL表' }));
    expect(screen.getByTestId('forecast-pl-table')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '事業比較' }));
    expect(screen.getAllByRole('img', { name: /推移チャート/ })).toHaveLength(6);
  });

  it('成長率を編集すると同じカードの予測値へ即時反映しUndoできる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const rate = screen.getByLabelText('補助事業期間 売上高 年間変化');
    const chart = screen.getByRole('img', { name: '売上高・利益額 推移チャート' });
    const before = chart.querySelector('[data-line-phase="forecast"]')?.getAttribute('points');

    await user.clear(rate);
    await user.type(rate, '18');
    await user.tab();
    expect(chart.querySelector('[data-line-phase="forecast"]')?.getAttribute('points')).not.toBe(before);

    await user.keyboard('{Control>}z{/Control}');
    expect(rate).toHaveValue(8);
    expect(chart.querySelector('[data-line-phase="forecast"]')?.getAttribute('points')).toBe(before);
  });

  it('水準設定の率と範囲は内部精度を保ったまま小数点以下2桁で表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const rate = screen.getByLabelText('補助事業期間 売上高 年間変化');
    const min = screen.getByLabelText('補助事業期間 売上高 最小値');
    const max = screen.getByLabelText('補助事業期間 売上高 最大値');
    const slider = screen.getByRole('slider', { name: '補助事業期間 売上高 水準' });
    fireEvent.change(rate, { target: { value: '5.4093567' } });
    fireEvent.change(min, { target: { value: '5.11695' } });
    fireEvent.change(max, { target: { value: '5.70175' } });

    expect(rate).toHaveValue(5.41);
    expect(min).toHaveValue(5.12);
    expect(max).toHaveValue(5.7);
    expect(slider).toHaveAttribute('min', '5.12');
    expect(slider).toHaveAttribute('max', '5.7');
    expect((Number(slider.getAttribute('max')) - Number(slider.getAttribute('min'))) / Number(slider.getAttribute('step'))).toBeCloseTo(58);
  });

  it('Ctrl+1・2・3で全社・ベース・補助事業を切り替える', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.keyboard('{Control>}3{/Control}');
    expect(screen.getByText('補助事業・右端は開始時増減')).toBeVisible();
    await user.keyboard('{Control>}1{/Control}');
    expect(screen.getByText('全社合算ではベース事業の水準を表示・右端は開始時増減')).toBeVisible();
    expect(screen.getByLabelText('補助事業期間 売上高 年間変化')).toBeDisabled();
    expect(screen.queryByRole('slider', { name: '売上高・利益額 2026年 売上高' })).not.toBeInTheDocument();
  });

  it('チャート上の操作で期間を分割・解除し、左の設定列と境界線を同期する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    expect(screen.getAllByTestId('forecast-period-column')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '2027年から期間を分割' }));
    expect(screen.getAllByTestId('forecast-period-column')).toHaveLength(3);
    expect(screen.getAllByTestId('forecast-boundary-2027').length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: '2027年の期間分割を解除' }).at(-1)!);
    expect(screen.getAllByTestId('forecast-period-column')).toHaveLength(2);
  });

  it('全体像を保ったまま経営指標をバレット表示し、一括編集へ切り替える', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    expect(screen.getByRole('heading', { name: '経営指標・目標' })).toBeVisible();
    expect(screen.getByTestId('metric-bullet-company-sales-growth')).toHaveTextContent('全社売上高成長率');
    expect(screen.getByTestId('metric-bullet-latest-ebitda-margin')).toHaveAttribute('data-reference', 'fixed');
    const variableBar = screen.getByTestId('metric-bullet-bar-company-sales-growth');
    const fixedBar = screen.getByTestId('metric-bullet-bar-latest-ebitda-margin');
    expect(variableBar).not.toHaveClass('bg-gradient-to-r');
    expect(variableBar.style.backgroundColor).toMatch(/^rgb\(/);
    expect(fixedBar.style.backgroundColor).toBe('transparent');
    expect(fixedBar.style.borderColor).toMatch(/^rgb\(/);
    expect(screen.queryByTestId('metric-bullet-bar-latest-sales-investment-ratio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metric-bullet-bar-latest-equity-ratio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metric-bullet-bar-latest-roa')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('全社売上高成長率 目標値')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'すべて編集' }));
    expect(screen.getByLabelText('全社売上高成長率 目標値')).toHaveValue(30.5);
    expect((screen.getByLabelText('全社売上高成長率 計算式') as HTMLTextAreaElement).value).toContain('YEARS');
    expect(screen.getByLabelText('全社売上高成長率 対象範囲')).toHaveValue('company');
  });

  it('BLUEPRINT同様に選択したPLロジックを将来予測画面内で確認する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    expect(screen.getByRole('heading', { name: '選択したロジック' })).toBeVisible();
    expect(screen.getByTestId('forecast-logic-detail')).toHaveTextContent('営業利益');
  });

  it('最適化案の作成だけでは水準を変えず、適用率で段階反映する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const rate = screen.getByLabelText('補助事業期間 売上高 年間変化');
    const before = Number((rate as HTMLInputElement).value);
    await user.click(screen.getByRole('button', { name: '目標を満たす水準案を作成' }));
    expect(screen.getByTestId('optimization-proposal')).toBeVisible();
    expect(rate).toHaveValue(before);
    const strengthSlider = screen.getByRole('slider', { name: '最適化方向の適用率' });
    strengthSlider.focus();
    await user.keyboard('{End}');
    expect(rate).not.toHaveValue(before);
  });

  it('最適化方向の適用率は、スクロール領域内でも掴める明示的なつまみを持つ', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('button', { name: '目標を満たす水準案を作成' }));

    const control = screen.getByTestId('optimization-strength-control');
    const thumb = screen.getByRole('slider', { name: '最適化方向の適用率' });
    expect(control).toHaveClass('h-8');
    expect(thumb).toHaveAttribute('data-slot', 'slider-thumb');
  });

  it('水準と最小・最大を同じ行で変更し、同値も許容する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const min = screen.getByLabelText('補助事業期間 売上高 最小値');
    const max = screen.getByLabelText('補助事業期間 売上高 最大値');
    await user.clear(min); await user.type(min, '10');
    await user.clear(max); await user.type(max, '10');
    expect(min).toHaveValue(10);
    expect(max).toHaveValue(10);
  });

  it('期間水準ごとに固定額・単年・加速度の効果レイヤーを編集する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('button', { name: '補助事業期間 売上高 変動設定' }));
    const fixed = screen.getByLabelText('補助事業期間 売上高 毎年固定増減');
    await user.clear(fixed); await user.type(fixed, '10');
    expect(fixed).toHaveValue(10);
    expect(screen.getByLabelText('補助事業期間 売上高 成長加速度')).toBeVisible();
    expect(screen.getByLabelText('補助事業期間 売上高 単年増減')).toBeVisible();
  });

  it('将来PLの入力行・計算行を直接編集すると対応水準へ即時逆算する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const rate = screen.getByLabelText('補助事業期間 売上高 年間変化');
    const before = Number((rate as HTMLInputElement).value);
    await user.click(screen.getByRole('tab', { name: 'PL表' }));
    const sales = screen.getByLabelText('ベース事業 P/L 2026年 売上高');
    await user.clear(sales); await user.type(sales, '1400'); await user.tab();
    expect(rate).not.toHaveValue(before);
    expect(sales).toHaveValue(1400);

    const profit = screen.getByLabelText('ベース事業 P/L 2027年 営業利益');
    await user.clear(profit); await user.type(profit, '300'); await user.tab();
    expect(profit).toHaveValue(300);
  });

  it('科目列を抑えて決算数値列へ表示幅を配分する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('tab', { name: 'PL表' }));

    const table = screen.getByTestId('forecast-pl-table');
    expect(within(table).getByTestId('forecast-pl-table-subject-column')).toHaveStyle({ width: '26%' });
    expect(screen.getByLabelText('ベース事業 P/L 2026年 売上高')).toHaveClass('px-0.5');
  });

  it('将来PLは内部計算値を表示時だけ単位別の桁数へ丸める', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('tab', { name: 'PL表' }));

    expect(screen.getByLabelText('ベース事業 P/L 2028年 売上高')).toHaveValue(1259.7);
  });

  it('将来チャート点を操作するとドラッグ途中から水準と線を更新し、Undoは1回にまとめる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const rate = screen.getByLabelText('補助事業期間 売上高 年間変化');
    const before = Number((rate as HTMLInputElement).value);
    const point = screen.getByRole('slider', { name: '売上高・利益額 2026年 売上高' });
    point.focus();
    await user.keyboard('{ArrowUp}');
    expect(rate).not.toHaveValue(before);
    await user.keyboard('{Control>}z{/Control}');
    expect(rate).toHaveValue(before);
  });
});
