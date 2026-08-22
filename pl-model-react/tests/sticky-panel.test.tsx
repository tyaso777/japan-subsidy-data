import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StickyPanel } from '../src/components/ui/sticky-panel';

describe('StickyPanel', () => {
  it('固定ヘッダーと独立したスクロール本文を構造として分離する', () => {
    render(
      <StickyPanel
        testIdPrefix="sample"
        stickyTop="126px"
        header={<h2>固定見出し</h2>}
      >
        <p>スクロール本文</p>
      </StickyPanel>,
    );

    const panel = screen.getByTestId('sample-panel');
    const header = screen.getByTestId('sample-header');
    const body = screen.getByTestId('sample-body');

    expect(panel).toHaveClass('sticky', 'flex', 'flex-col', 'overflow-hidden');
    expect(panel).toHaveStyle({ top: '126px' });
    expect(panel.style.maxHeight).toBe('calc(100vh - (126px + 12px))');
    expect(header).toHaveClass('shrink-0', 'bg-surface');
    expect(header.parentElement).toBe(panel);
    expect(body).toHaveClass('min-h-0', 'overflow-x-hidden', 'overflow-y-auto');
    expect(body.parentElement).toBe(panel);
    expect(header.contains(body)).toBe(false);
  });

  it('常時スクロールバーと本文固有の余白を設定できる', () => {
    render(
      <StickyPanel
        testIdPrefix="sample-scroll"
        stickyTop="100px"
        scrollMode="always"
        bodyClassName="p-3"
        bodyStyle={{ scrollbarGutter: 'stable' }}
        header="見出し"
      >
        本文
      </StickyPanel>,
    );

    const body = screen.getByTestId('sample-scroll-body');
    expect(body).toHaveClass('overflow-y-scroll', 'p-3');
    expect(body).toHaveStyle({ scrollbarGutter: 'stable' });
  });
});
