import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('App test entry point', () => {
  it('can start directly on the forecast table without changing the normal navigation contract', () => {
    render(<App initialPage="forecast" initialForecastView="table" />);

    expect(screen.getByRole('heading', { name: '将来予測・調整水準' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'PL表' })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByRole('heading', { name: '個社の期間' })).not.toBeInTheDocument();
  });

  it('can omit the central forecast workspace while retaining the side panels for focused tests', () => {
    render(<App initialPage="forecast" renderForecastWorkspace={false} />);

    expect(screen.getByTestId('forecast-settings-panel')).toBeVisible();
    expect(screen.getByTestId('forecast-metrics-panel')).toBeVisible();
    expect(screen.queryByTestId('forecast-chart-sections')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forecast-pl-table')).not.toBeInTheDocument();
  });
});
