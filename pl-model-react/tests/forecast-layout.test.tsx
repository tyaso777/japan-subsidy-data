import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('将来予測画面のワイドレイアウト', () => {
  it('広い画面を活用し、左右パネルと期間見出しを横方向に揃える', async () => {
    const user = userEvent.setup();
    render(<App />);
    const forecastButton = screen.getAllByRole('button').find((button) => button.textContent?.startsWith('03 '));
    expect(forecastButton).toBeDefined();
    await user.click(forecastButton!);

    expect(screen.getByTestId('app-shell')).toHaveClass('max-w-[1900px]');
    expect(screen.getByTestId('forecast-layout')).toHaveClass(
      'grid-cols-[clamp(360px,26vw,500px)_minmax(0,1fr)_clamp(320px,22vw,420px)]',
    );
    expect(screen.getByTestId('forecast-settings-panel')).toHaveClass('p-2.5');
    expect(screen.getByTestId('forecast-metrics-panel')).toHaveClass('p-2.5');
    expect(screen.getByTestId('forecast-layout')).toHaveClass(
      '[&>aside]:top-16',
      '[&>aside]:max-h-[calc(100vh-76px)]',
    );

    const headers = screen.getAllByTestId('forecast-period-header');
    expect(headers).toHaveLength(2);
    headers.forEach((header) => expect(header).toHaveClass('min-h-10', 'items-center'));
    screen.getAllByTestId('forecast-period-years').forEach((years) => {
      expect(years).toHaveClass('whitespace-nowrap');
    });
  });

  it('水準値をスライダー中央上に置き、開始時増減を点線で分離する', async () => {
    const user = userEvent.setup();
    render(<App />);
    const forecastButton = screen.getAllByRole('button').find((button) => button.textContent?.startsWith('03 '));
    await user.click(forecastButton!);

    const row = screen.getByTestId('forecast-setting-row-base-sales-subsidy');
    expect(row).toBeVisible();
    expect(screen.getByLabelText('補助事業期間 売上高 年間変化')).toHaveAttribute('data-position', 'slider-top');
    expect(within(row).getByTestId('forecast-level-slider-group')).toHaveClass('grid-cols-[38px_minmax(44px,1fr)_38px]');
    expect(within(row).getByTestId('forecast-start-adjustment-group')).toHaveClass('border-l', 'border-dashed');
    expect(within(row).getByRole('button', { name: '補助事業期間 売上高 変動設定' })).toHaveTextContent('変動設定');
    expect(within(row).queryByText('効果')).not.toBeInTheDocument();
  });
});
