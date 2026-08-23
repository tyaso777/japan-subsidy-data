import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/App';
import { settingsPeriodMinWidth, shouldAutoCollapseSettings } from '../src/features/forecast/forecast-layout';
import { stickyStackOffset, stickyStackOffsetCss } from '../src/lib/sticky-stack';

const nativeResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = nativeResizeObserver;
});

describe('将来予測画面のワイドレイアウト', () => {
  it('広い画面を活用し、左右パネルと期間見出しを横方向に揃える', async () => {
    const user = userEvent.setup();
    render(<App />);
    const forecastButton = screen.getAllByRole('button').find((button) => button.textContent?.startsWith('03 '));
    expect(forecastButton).toBeDefined();
    await user.click(forecastButton!);

    expect(screen.getByTestId('app-shell')).toHaveClass('max-w-[1900px]');
    expect(screen.getByTestId('forecast-layout')).toHaveClass(
      'grid-cols-[clamp(320px,20vw,380px)_minmax(0,1fr)_clamp(250px,15vw,290px)]',
    );
    expect(screen.getByTestId('forecast-settings-panel')).toHaveClass(
      'sticky',
      'flex',
      'flex-col',
      'overflow-visible',
      'row-span-2',
    );
    expect(screen.getByTestId('forecast-settings-panel')).toHaveStyle({ top: 'var(--forecast-content-sticky-top)' });
    expect(screen.getByTestId('forecast-settings-panel')).not.toHaveClass('top-3');
    expect(screen.getByTestId('forecast-settings-header')).toHaveClass('sticky', 'shrink-0', 'bg-surface');
    expect(screen.getByTestId('forecast-settings-body')).toHaveClass(
      'min-h-0',
      'overflow-x-hidden',
      'overflow-y-auto',
      'p-2.5',
    );
    expect(screen.getByTestId('forecast-period-grid')).toHaveClass('min-w-0');
    expect(screen.getByTestId('forecast-period-grid')).not.toHaveClass('overflow-x-auto');
    const metricsPanel = screen.getByTestId('forecast-metrics-panel');
    expect(metricsPanel).toHaveClass(
      'sticky',
      'min-w-0',
      'flex',
      'flex-col',
      'overflow-visible',
      'row-span-2',
    );
    expect(metricsPanel).toHaveStyle({ top: 'var(--forecast-content-sticky-top)' });
    expect(metricsPanel).not.toHaveClass('top-3', 'max-h-[calc(100vh-24px)]');
    expect(screen.getByTestId('forecast-metrics-header')).toHaveClass('sticky', 'shrink-0', 'bg-surface');
    const metricsBody = screen.getByTestId('forecast-metrics-body');
    expect(metricsBody).toHaveClass('min-h-0', 'overflow-x-hidden', 'overflow-y-scroll', 'p-2');
    expect(metricsBody).toHaveStyle({ scrollbarGutter: 'stable' });
    expect(within(screen.getByTestId('metric-bullet-company-sales-growth')).getByTestId('metric-bullet-layout')).toHaveClass(
      'grid-cols-[minmax(92px,0.88fr)_minmax(84px,0.72fr)]',
    );
    const salesGrowthMetric = screen.getByTestId('metric-bullet-company-sales-growth');
    expect(within(salesGrowthMetric).getByText('2028→2031 · %/年')).toBeVisible();
    expect(within(salesGrowthMetric).queryByText(/A:2028|B:2031/)).not.toBeInTheDocument();
    expect(within(salesGrowthMetric).queryByText(/目標まで/)).not.toBeInTheDocument();
    expect(screen.getByTestId('forecast-layout').className).not.toMatch(/\[&>aside\]/);

    const stickyLayer = screen.getByTestId('forecast-operation-sticky-layer');
    expect(stickyLayer).toHaveClass('sticky', 'isolate', 'z-40', 'bg-surface');
    expect(stickyLayer).toHaveStyle({ top: 'var(--app-toolbar-sticky-bottom)' });
    expect(stickyLayer.className).not.toMatch(/(?:before|after):/);
    expect(screen.getByTestId('app-shell')).toHaveStyle({ '--app-toolbar-sticky-bottom': '56px' });
    expect(screen.getByTestId('forecast-workspace-tabs')).toHaveClass('gap-0');
    expect(screen.getByTestId('forecast-sticky-spacer')).toHaveClass('h-3', 'bg-canvas');
    const operationBar = screen.getByTestId('forecast-operation-bar');
    expect(operationBar).not.toHaveClass('sticky');
    expect(within(operationBar).getByRole('button', { name: 'ベース事業' })).toBeVisible();
    expect(within(operationBar).getByRole('tab', { name: 'チャート' })).toBeVisible();
    expect(within(operationBar).queryByLabelText('期間分割操作')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('forecast-chart-display-controls')).getByLabelText('期間分割操作')).toBeVisible();
    expect(within(screen.getByTestId('forecast-heading')).queryByRole('button', { name: 'ベース事業' })).not.toBeInTheDocument();

    const headers = screen.getAllByTestId('forecast-period-header');
    expect(headers).toHaveLength(2);
    headers.forEach((header) => expect(header).toHaveClass('min-h-10', 'items-center'));
    screen.getAllByTestId('forecast-period-years').forEach((years) => {
      expect(years).toHaveClass('whitespace-nowrap');
    });
  });

  it('期間列の実幅が狭い場合だけ変動設定を自動的に折り畳む', () => {
    expect(shouldAutoCollapseSettings(500, 2)).toBe(false);
    expect(shouldAutoCollapseSettings(420, 2)).toBe(true);
    expect(shouldAutoCollapseSettings(0, 2)).toBe(false);
    expect(settingsPeriodMinWidth(3, true)).toBe('150px');
    expect(settingsPeriodMinWidth(3, false)).toBe('150px');
  });

  it('固定面の境界は計測値を1px重ねて小数ピクセルの隙間を防ぐ', () => {
    expect(stickyStackOffset(56, 71)).toBe(126);
    expect(stickyStackOffset(0, 0)).toBe(0);
    expect(stickyStackOffsetCss('var(--toolbar-bottom)', 71)).toBe('calc(var(--toolbar-bottom) + 70px)');
    expect(stickyStackOffsetCss('var(--toolbar-bottom)', 0)).toBe('var(--toolbar-bottom)');
  });

  it('共通ツールバーの実測高さが変わると03画面の固定起点も追従する', async () => {
    class MeasuredResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const testId = target.getAttribute('data-testid');
        const height = testId === 'app-toolbar' ? 83 : testId === 'forecast-operation-sticky-layer' ? 71 : 45;
        this.callback([{ target, contentRect: { width: 900, height: 40 }, borderBoxSize: [{ blockSize: height, inlineSize: 900 }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MeasuredResizeObserver as unknown as typeof ResizeObserver;
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    expect(screen.getByTestId('app-shell')).toHaveStyle({ '--app-toolbar-sticky-bottom': '82px' });
    expect(screen.getByTestId('forecast-workspace-tabs')).toHaveStyle({ '--forecast-content-sticky-top': 'calc(var(--app-toolbar-sticky-bottom) + 70px)' });
  });

  it('期間分割と解除を年度の時系列順に同じ位置へ表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const controls = within(screen.getByTestId('forecast-chart-display-controls')).getByLabelText('期間分割操作');
    await user.click(within(controls).getByRole('button', { name: '2028年から期間を分割' }));

    expect(within(controls).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      '2027年から期間を分割',
      '2028年の期間分割を解除',
      '2030年から期間を分割',
      '2031年から期間を分割',
    ]);
  });

  it('狭い水準設定でも変動設定をデフォルト表示し、手動で収納できる', async () => {
    class NarrowResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback([{ target, contentRect: { width: 420 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = NarrowResizeObserver as unknown as typeof ResizeObserver;
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '03 将来予測・PL' }));

    const panel = screen.getByTestId('forecast-settings-panel');
    const layout = screen.getByTestId('forecast-layout');
    const row = screen.getByTestId('forecast-setting-row-base-sales-subsidy');
    const toggle = within(panel).getByRole('button', { name: '変動設定を隠す' });
    expect(layout).toHaveClass('grid-cols-[clamp(320px,20vw,380px)_minmax(0,1fr)_clamp(250px,15vw,290px)]');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(layout).toHaveClass('grid-cols-[clamp(320px,20vw,380px)_minmax(0,1fr)_clamp(250px,15vw,290px)]');
    expect(within(row).getByTestId('forecast-start-adjustment-group')).toBeVisible();

    await user.click(within(row).getByRole('button', { name: '補助事業期間 売上高 詳細な変動設定' }));
    expect(within(row).getByLabelText('補助事業期間 売上高 毎年固定増減')).toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('変動設定を表示');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(row).queryByLabelText('補助事業期間 売上高 毎年固定増減')).not.toBeInTheDocument();
  });

  it('水準値を項目名の横へ置き、開始時増減を点線で分離する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const forecastButton = screen.getAllByRole('button').find((button) => button.textContent?.startsWith('03 '));
    await user.click(forecastButton!);

    const row = screen.getByTestId('forecast-setting-row-base-sales-subsidy');
    expect(row).toBeVisible();
    const rowHeader = within(row).getByTestId('forecast-setting-row-header');
    const annualChange = within(rowHeader).getByLabelText('補助事業期間 売上高 年間変化');
    expect(annualChange).toHaveAttribute('data-position', 'item-name');
    expect(annualChange).toHaveClass('h-5', 'w-11');
    expect(row).toHaveClass('py-1');
    expect(row).toHaveClass('[container-type:inline-size]');
    expect(within(row).getByTestId('forecast-setting-controls')).toHaveClass('forecast-setting-controls');
    expect(within(row).getByTestId('forecast-level-slider-group')).toHaveClass('grid-cols-[38px_minmax(44px,1fr)_38px]');
    within(row).getAllByLabelText(/補助事業期間 売上高 (最小値|最大値)/).forEach((input) => expect(input).toHaveClass('h-5'));
    expect(within(row).getByTestId('forecast-start-adjustment-group')).toHaveClass('grid-cols-2', 'border-dashed');
    expect(screen.getByRole('button', { name: '変動設定を隠す' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(row).queryByRole('button', { name: '補助事業期間 売上高 変動設定' })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '補助事業期間 売上高 詳細な変動設定' })).toHaveAttribute('title', '固定増減などの詳細設定');
    expect(within(row).queryByText('効果')).not.toBeInTheDocument();
  });
});
