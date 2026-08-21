import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('将来予測・PL画面', () => {
  it('最終年度の事業別配分率だけを設定し、売上高は最適化対象に保つ', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const allocation = screen.getByTestId('final-year-sales-allocation');
    const operationBar = screen.getByTestId('forecast-operation-bar');
    expect(operationBar).toContainElement(allocation);
    expect(within(operationBar).getByTestId('forecast-scope-shortcuts')).toHaveClass('flex-col');
    expect(within(operationBar).getByTestId('forecast-scope-shortcuts')).toHaveTextContent('Ctrl+1 / 2 / 3');
    expect(within(operationBar).getByTestId('forecast-view-shortcuts')).toHaveClass('flex-col');
    expect(within(operationBar).getByTestId('forecast-view-shortcuts')).toHaveTextContent('Ctrl+4 / 5');
    expect(within(allocation).getByTestId('final-year-allocation-title')).toHaveClass('flex-col');
    const optimizationToolbar = within(operationBar).getByTestId('forecast-optimization-toolbar');
    expect(optimizationToolbar).toHaveAttribute('data-layout', 'compact');
    expect(optimizationToolbar).toHaveClass('flex', 'shrink-0');
    expect(within(optimizationToolbar).getByRole('combobox', { name: '最適化方法' })).toBeVisible();
    expect(within(optimizationToolbar).getByRole('combobox', { name: '探索範囲' })).toBeVisible();
    expect(within(optimizationToolbar).getByRole('button', { name: '目標を満たす水準案を作成' })).toHaveClass('min-w-0', 'whitespace-nowrap');
    expect(within(screen.getByTestId('forecast-metrics-panel')).queryByRole('combobox', { name: '最適化方法' })).not.toBeInTheDocument();
    expect(within(allocation).getByText('2031年')).toBeVisible();
    expect(within(allocation).getByText(`（現在 ${88.94.toFixed(2)}%）`)).toBeVisible();
    expect(allocation).toHaveClass('w-[236px]');
    expect(within(allocation).getByTestId('current-base-share')).toHaveClass('w-[86px]', 'tabular-nums');
    expect(within(allocation).queryByText(/^B /)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'PL表' }));
    const finalSales = screen.getByLabelText('ベース事業 P/L 2031年 売上高');
    const salesBeforeAllocation = (finalSales as HTMLInputElement).value;
    const baseShare = within(allocation).getByLabelText('ベース事業 配分率');
    expect(baseShare).toHaveValue(null);
    expect(baseShare).toHaveAttribute('placeholder', '任意');
    expect(within(allocation).queryByLabelText('最終年度 全社売上高目標')).not.toBeInTheDocument();
    await user.clear(baseShare);
    await user.tab();
    expect(baseShare).toHaveValue(null);
    await user.type(baseShare, '65');
    expect(baseShare).toHaveValue(65);
    expect(finalSales).toHaveValue(Number(salesBeforeAllocation));
    expect(within(allocation).queryByRole('button', { name: /配分率を(設定|更新)/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('補助事業期間 売上高 水準')).toBeEnabled();

    await user.clear(baseShare);
    await user.tab();
    expect(baseShare).toHaveValue(null);
    expect(finalSales).toHaveValue(Number(salesBeforeAllocation));

    await user.type(baseShare, '70');
    expect(within(allocation).getByText(`（現在 ${88.94.toFixed(2)}%）`)).toBeVisible();

    await user.clear(baseShare);
    await user.tab();
    expect(baseShare).toHaveValue(null);
    expect(screen.getByLabelText('補助事業期間 売上高 水準')).toBeEnabled();
  }, 10_000);
  it('全水準とチャート・PL表を同じ画面で切り替え、事業比較はチャート内に表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    expect(screen.getByRole('heading', { name: '将来予測・調整水準' })).toBeVisible();
    expect(screen.getByText('金額単位：百万円')).toBeVisible();
    expect(screen.queryByText('内部：円')).not.toBeInTheDocument();
    expect(screen.getAllByText('原価率').length).toBeGreaterThan(0);
    expect(screen.getAllByText('研究開発費の売上高比率').length).toBeGreaterThan(0);
    expect(screen.getAllByText('実効税率').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: /推移チャート/ })).toHaveLength(36);
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
    expect(screen.queryByRole('tab', { name: '事業比較' })).not.toBeInTheDocument();
  });

  it('全社・ベース・補助・事業比較を個別に表示し、1区分だけなら一覧表示にする', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const display = screen.getByTestId('forecast-chart-sections');
    expect(screen.getByTestId('forecast-layout')).toHaveClass(
      '[&>aside]:top-[var(--forecast-content-sticky-top)]',
      '[&>aside]:max-h-[calc(100vh-var(--forecast-content-sticky-top)-12px)]',
    );
    expect(screen.getByTestId('forecast-chart-display-controls')).toHaveClass(
      'sticky',
      'top-[var(--forecast-content-sticky-top)]',
      'z-30',
      'bg-surface',
      'before:h-3',
      'before:bg-canvas',
    );
    expect(display).toHaveAttribute('data-layout', 'comparison-with-businesses');
    expect(screen.getAllByTestId('forecast-chart-section')).toHaveLength(4);
    expect(screen.getByTestId('forecast-comparison-section')).toHaveAttribute('data-placement', 'full-width');
    expect(screen.getByTestId('forecast-comparison-chart-list')).toHaveClass('grid-cols-3');
    expect(screen.getByTestId('forecast-business-columns')).toHaveStyle({ gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))' });
    for (const list of screen.getAllByTestId('forecast-business-chart-list')) {
      expect(list).toHaveAttribute('data-layout', 'column');
      expect(list).toHaveClass('grid-cols-1');
    }
    for (const label of ['全社合算', 'ベース事業', '補助事業', '事業比較']) {
      expect(screen.getByRole('button', { name: `${label}を非表示` })).toHaveAttribute('aria-pressed', 'true');
    }

    await user.click(screen.getByRole('button', { name: '全社合算を非表示' }));
    await user.click(screen.getByRole('button', { name: '補助事業を非表示' }));
    await user.click(screen.getByRole('button', { name: '事業比較を非表示' }));

    expect(display).toHaveAttribute('data-layout', 'single');
    expect(screen.getAllByTestId('forecast-chart-section')).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: /推移チャート/ })).toHaveLength(10);
    expect(screen.getByTestId('forecast-business-chart-list')).toHaveAttribute('data-layout', 'overview');
    expect(screen.getByTestId('forecast-business-chart-list')).toHaveClass('grid-cols-3');
    expect(screen.getByRole('button', { name: 'ベース事業を非表示' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '事業比較を表示' }));
    expect(display).toHaveAttribute('data-layout', 'comparison-with-businesses');
    expect(screen.getByTestId('forecast-comparison-section')).toHaveAttribute('data-placement', 'full-width');
    expect(screen.getByTestId('forecast-business-columns')).toHaveStyle({ gridTemplateColumns: 'minmax(0, 1fr)' });
    expect(screen.getAllByTestId('forecast-chart-section')).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: /推移チャート/ })).toHaveLength(16);
  });

  it('横並びチャートがあふれる場合だけ画面下部へスクロールバーを常時表示し、チャート領域と同期する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const scrollbar = screen.getByTestId('forecast-chart-horizontal-scrollbar');
    const content = screen.getByTestId('forecast-chart-scroll-content');
    let scrollWidth = 1200;
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 600 });
    Object.defineProperty(content, 'scrollWidth', { configurable: true, get: () => scrollWidth });
    content.getBoundingClientRect = () => ({ left: 100, right: 700, width: 600, top: 100, bottom: 900, height: 800, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
    fireEvent(window, new Event('resize'));
    expect(scrollbar).toHaveClass('fixed', 'bottom-0', 'overflow-x-scroll');
    expect(scrollbar).toBeVisible();
    expect(scrollbar).toHaveAttribute('aria-hidden', 'false');

    content.scrollLeft = 140;
    fireEvent.scroll(content);
    expect(scrollbar.scrollLeft).toBe(140);

    scrollbar.scrollLeft = 260;
    fireEvent.scroll(scrollbar);
    expect(content.scrollLeft).toBe(260);

    scrollWidth = 600;
    fireEvent(window, new Event('resize'));
    expect(scrollbar).toHaveClass('invisible');
    expect(scrollbar).toHaveAttribute('aria-hidden', 'true');
  });

  it('チャート本体の高さを維持しながら見出しと余白を圧縮し、軸文字を読みやすくする', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const chart = screen.getByRole('img', { name: '売上高・利益額 推移チャート' });
    const card = chart.closest('article');
    expect(card).toHaveClass('p-2', 'self-start');
    expect(chart).toHaveClass('h-38');
    expect(chart.querySelector('text')).toHaveAttribute('font-size', '11');
    expect(card?.querySelector('[data-testid="forecast-chart-heading"]')).toHaveClass('flex');
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

  it('水準設定を対応するPL科目が上から現れる順に表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const firstPeriod = screen.getAllByTestId('forecast-period-column')[0];
    const labels = within(firstPeriod).getAllByTestId('forecast-setting-row-header').map((header) => header.querySelector('strong')?.textContent);
    expect(labels).toEqual([
      '売上高',
      '原価率',
      '原価内減価償却費率',
      '役員人件費',
      '役員給与のうち報酬割合',
      '従業員給与のうち給与割合',
      '販管費内減価償却費率',
      '研究開発費の売上高比率',
      'その他販管費率',
      '営業外損益の売上高比率',
      '特別損益の売上高比率',
      '実効税率',
      '従業員数（就業時間換算）',
      '役員数',
      '1人当たり給与',
    ]);
  });

  it('水準設定の数値入力は空欄と負号を入力途中として保持できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const rate = screen.getByLabelText('補助事業期間 売上高 年間変化');

    await user.clear(rate);
    expect(rate).toHaveValue(null);
    await user.type(rate, '-3');
    expect(rate).toHaveValue(-3);
    await user.tab();
    expect(rate).toHaveValue(-3);
  });

  it('開始時増減を空欄のまま離れた場合は以前の値へ戻さず0として保存する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const adjustment = screen.getByLabelText('補助事業期間 売上高 開始時増減');

    await user.clear(adjustment);
    await user.type(adjustment, '100');
    await user.tab();
    expect(adjustment).toHaveValue(100);

    await user.clear(adjustment);
    expect(adjustment).toHaveValue(null);
    await user.tab();
    expect(adjustment).toHaveValue(0);
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

  it('Ctrl+4・5でチャート・PL表を切り替え、Ctrl+6は割り当てない', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const chartTab = screen.getByRole('tab', { name: 'チャート' });
    const tableTab = screen.getByRole('tab', { name: 'PL表' });
    expect(chartTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Ctrl+4 / 5')).toBeVisible();
    expect(screen.queryByRole('tab', { name: '事業比較' })).not.toBeInTheDocument();

    await user.keyboard('{Control>}5{/Control}');
    expect(tableTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('forecast-pl-table')).toBeVisible();

    await user.keyboard('{Control>}6{/Control}');
    expect(tableTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('forecast-pl-table')).toBeVisible();

    await user.keyboard('{Control>}4{/Control}');
    expect(chartTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('img', { name: /推移チャート/ })).toHaveLength(36);
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
    const salesMetric = screen.getByTestId('metric-bullet-company-sales-growth');
    expect(within(within(salesMetric).getByTestId('metric-title-row')).queryByTestId('metric-scope-badge')).not.toBeInTheDocument();
    expect(within(within(salesMetric).getByTestId('metric-meta-row')).getByTestId('metric-scope-badge')).toHaveTextContent('全社');
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
    expect(screen.queryByLabelText('全社売上高成長率 個社目標')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'すべて編集' }));
    const companyTarget = screen.getByLabelText('全社売上高成長率 個社目標');
    expect(companyTarget).toHaveValue(null);
    await user.type(companyTarget, '35');
    await user.tab();
    expect(screen.getByTestId('metric-bullet-company-sales-growth')).toHaveTextContent('制度 30.5');
    expect(screen.getByTestId('metric-bullet-company-sales-growth')).toHaveTextContent('個社 35');
    expect(screen.getByTestId('metric-program-target-company-sales-growth')).toBeVisible();
    expect(screen.getByTestId('metric-company-target-company-sales-growth')).toBeVisible();
    await user.clear(companyTarget);
    await user.tab();
    expect(screen.queryByTestId('metric-company-target-company-sales-growth')).not.toBeInTheDocument();
    expect(screen.getByTestId('metric-bullet-company-sales-growth')).toHaveTextContent('制度≥ 30.5');
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
    expect(await screen.findByTestId('optimization-proposal', {}, { timeout: 30_000 })).toBeVisible();
    expect(rate).toHaveValue(before);
    const strengthSlider = screen.getByRole('slider', { name: '最適化方向の適用率' });
    strengthSlider.focus();
    await user.keyboard('{End}');
    expect(rate).not.toHaveValue(before);
  }, 35_000);

  it('最適化方法を最小変更・バランス・最少項目・優先順位から選択し、提案へ使用方式を表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const method = screen.getByRole('combobox', { name: '最適化方法' });
    expect(method).toHaveValue('minimum-change');
    expect(within(method).getByRole('option', { name: 'バランス' })).toBeVisible();
    expect(within(method).getByRole('option', { name: '最少項目' })).toBeVisible();
    expect(within(method).getByRole('option', { name: '優先順位' })).toBeVisible();
    expect(screen.getByRole('link', { name: '最適化方法の詳しい説明' })).toHaveAttribute('href', './docs/optimization-methods.html');
    await user.selectOptions(method, 'sparse');
    await user.click(screen.getByRole('button', { name: '目標を満たす水準案を作成' }));

    expect(await screen.findByTestId('optimization-proposal')).toHaveTextContent('最少項目');
  }, 15_000);

  it('水準案の計算中を表示し、適用率を変更一覧より先に操作できる', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const createButton = screen.getByRole('button', { name: '目標を満たす水準案を作成' });

    fireEvent.click(createButton);
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('水準案を計算中');
    expect(screen.getByTestId('optimization-spinner')).toHaveClass('animate-spin', 'will-change-transform');

    const proposal = await screen.findByTestId('optimization-proposal', {}, { timeout: 15_000 });
    const strength = within(screen.getByTestId('forecast-optimization-toolbar')).getByRole('slider', { name: '最適化方向の適用率' });
    const direction = within(proposal).getByText(/最適化方向・/);
    expect(strength.compareDocumentPosition(direction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, 20_000);

  it('水準外最適化は一度の実行で必要なMin・Maxを更新し、適用率で最適値へ動かせる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('button', { name: 'すべて編集' }));
    const target = screen.getByRole('spinbutton', { name: '全社売上高成長率 個社目標' });
    await user.clear(target);
    await user.type(target, '100');
    await user.selectOptions(screen.getByRole('combobox', { name: '探索範囲' }), 'outside-levels');
    const rates = screen.getAllByLabelText(/年間変化$/) as HTMLInputElement[];
    const bounds = screen.getAllByLabelText(/(最小値|最大値)$/) as HTMLInputElement[];
    const ratesBeforeOptimization = rates.map((input) => input.value);
    const boundsBeforeOptimization = bounds.map((input) => input.value);
    await user.click(screen.getByRole('button', { name: '目標を満たす水準案を作成' }));

    const report = await screen.findByTestId('optimization-feasibility-report', {}, { timeout: 30_000 });
    expect(report).toHaveTextContent('現在のMin・Max内では目標未達');
    expect(report).toHaveTextContent('全社売上高成長率');
    expect(report).toHaveTextContent('目標との差');
    expect(report).toHaveTextContent('水準外最適化を追加探索中');
    expect(within(report).getByTestId('expansion-search-spinner')).toHaveClass('animate-spin', 'will-change-transform');

    const proposal = screen.getByTestId('optimization-proposal');
    const summary = within(proposal).getByTestId('optimization-status-summary');
    const strength = within(screen.getByTestId('forecast-optimization-toolbar')).getByTestId('optimization-strength-control');
    expect(strength.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const expansionPlan = await screen.findByTestId('optimization-expansion-plan', {}, { timeout: 30_000 });
    expect(within(expansionPlan).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(expansionPlan).getByText('推奨水準範囲')).toBeInTheDocument();
    expect(within(expansionPlan).queryByRole('button', { name: /適用|再計算/ })).not.toBeInTheDocument();
    expect(rates.map((input) => input.value)).not.toEqual(ratesBeforeOptimization);
    expect(bounds.map((input) => input.value)).not.toEqual(boundsBeforeOptimization);
    expect(screen.getByTestId('optimization-application-result')).toHaveTextContent(/上限・下限と最適水準を100%適用/);
    const strengthSlider = screen.getByRole('slider', { name: '最適化方向の適用率' });
    const applicationResult = screen.getByTestId('optimization-application-result');
    expect(strengthSlider.compareDocumentPosition(applicationResult) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strengthSlider).toHaveAttribute('aria-valuenow', '100');
    await user.click(strengthSlider);
    await user.keyboard('{Home}');
    expect(rates.map((input) => input.value)).toEqual(ratesBeforeOptimization);
  }, 60_000);

  it('最適化方向の適用率は、スクロール領域内でも掴める明示的なつまみを持つ', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('button', { name: '目標を満たす水準案を作成' }));

    await screen.findByTestId('optimization-proposal', {}, { timeout: 30_000 });
    const control = screen.getByTestId('optimization-strength-control');
    const thumb = screen.getByRole('slider', { name: '最適化方向の適用率' });
    expect(control).toHaveClass('h-7');
    expect(thumb).toHaveAttribute('data-slot', 'slider-thumb');
  }, 35_000);

  it('探索範囲を水準内最適化と水準外最適化から選択できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const rangeMode = screen.getByRole('combobox', { name: '探索範囲' });
    expect(rangeMode).toHaveValue('within-levels');
    expect(within(rangeMode).getByRole('option', { name: '水準内最適化' })).toBeInTheDocument();
    expect(within(rangeMode).getByRole('option', { name: '水準外最適化' })).toBeInTheDocument();
    await user.selectOptions(rangeMode, 'outside-levels');
    expect(rangeMode).toHaveValue('outside-levels');
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

  it('実効税率は固定値として水準変更できない', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    expect(screen.getByLabelText('補助事業期間 実効税率 年間変化')).toBeDisabled();
    expect(screen.getByLabelText('補助事業期間 実効税率 水準')).toBeDisabled();
  });

  it('期間水準ごとに固定額・単年・加速度の効果レイヤーを編集する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    await user.click(screen.getByRole('button', { name: '補助事業期間 売上高 詳細な変動設定' }));
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

  it('将来チャートは閲覧専用で、点をドラッグまたはキー操作できない', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));
    const chart = screen.getByRole('img', { name: '売上高・利益額 推移チャート' });
    expect(chart.closest('[data-testid="forecast-chart-card"]')).toHaveClass('bg-white');
    expect(within(chart).queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: '売上高・利益額 2026年 売上高' })).not.toBeInTheDocument();
    const actualPoints = chart.querySelectorAll('[data-point-phase="actual"]');
    const forecastPoints = chart.querySelectorAll('[data-point-phase="forecast"]');
    expect(actualPoints.length).toBeGreaterThan(0);
    expect(forecastPoints.length).toBeGreaterThan(0);
    expect(actualPoints[0]).toHaveAttribute('fill', '#183b56');
    expect(forecastPoints[0]).toHaveAttribute('fill', '#fff');
    expect(forecastPoints[0]).toHaveAttribute('stroke', '#183b56');
    expect(within(chart).getByTestId('forecast-area')).toHaveAttribute('fill', '#eef6ef');
    expect(within(chart).getByTestId('forecast-start-boundary')).toHaveAttribute('stroke-dasharray', '3 3');
    expect(within(chart).getByText("'28")).toBeInTheDocument();
    expect(within(chart).getByText('基準年')).toBeInTheDocument();
    expect(within(chart).getByText('最新決算期')).toBeInTheDocument();
    const year2028X = Number(within(chart).getByText("'28").getAttribute('x'));
    const year2029X = Number(within(chart).getByText("'29").getAttribute('x'));
    const periodBoundaryX = Number(within(chart).getByTestId('forecast-boundary-2029').getAttribute('x1'));
    expect(periodBoundaryX).toBe((year2028X + year2029X) / 2);
  });

  it('縦軸を4区間で表示し、年度ホバーで全系列の値を確認・クリック固定できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const chart = screen.getByRole('img', { name: '売上高・利益額 推移チャート' });
    expect(chart.querySelectorAll('[data-axis-tick="y"]')).toHaveLength(5);
    expect(chart.querySelector('[data-axis-tick="y"]')).toHaveAttribute('font-size', '11');
    expect(within(chart).getByText("'23")).toHaveAttribute('font-size', '11');

    const yearTarget = within(chart).getByTestId('chart-year-target-2028');
    await user.hover(yearTarget);
    const tooltip = within(chart).getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('2028年');
    expect(tooltip).toHaveTextContent('売上高');
    expect(tooltip).toHaveTextContent('売上総利益');
    expect(tooltip).toHaveTextContent('営業利益');

    await user.click(yearTarget);
    await user.unhover(yearTarget);
    expect(within(chart).getByTestId('chart-tooltip')).toHaveTextContent('2028年');
    await user.click(yearTarget);
    await user.unhover(yearTarget);
    expect(within(chart).queryByTestId('chart-tooltip')).not.toBeInTheDocument();
  });
});
