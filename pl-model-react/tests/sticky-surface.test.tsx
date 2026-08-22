import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StickySurface } from '../src/components/ui/sticky-surface';

describe('StickySurface', () => {
  it('固定位置と不透明背景を共通契約として提供する', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <StickySurface ref={ref} data-testid="surface" stickyTop="72px" className="z-30 px-2">
        操作欄
      </StickySurface>,
    );

    const surface = screen.getByTestId('surface');
    expect(ref.current).toBe(surface);
    expect(surface).toHaveClass('sticky', 'isolate', 'bg-surface', 'z-30', 'px-2');
    expect(surface).toHaveStyle({ top: '72px' });
  });
});
