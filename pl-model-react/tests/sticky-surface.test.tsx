import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stickyLayerClassNames, StickySurface } from '../src/components/ui/sticky-surface';

describe('StickySurface', () => {
  it('固定位置と不透明背景を共通契約として提供する', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <StickySurface ref={ref} data-testid="surface" stickyTop="72px" layer="content" className="z-50 bg-transparent px-2" style={{ top: '999px', backgroundColor: 'transparent' }}>
        操作欄
      </StickySurface>,
    );

    const surface = screen.getByTestId('surface');
    expect(ref.current).toBe(surface);
    expect(surface).toHaveClass('sticky', 'isolate', 'bg-surface', 'z-30', 'px-2');
    expect(surface).not.toHaveClass('bg-transparent', 'z-50');
    expect(surface).toHaveStyle({ top: '72px', backgroundColor: 'var(--color-surface)' });
    expect(stickyLayerClassNames).toEqual({ panel: 'z-10', section: 'z-20', content: 'z-30', operation: 'z-40', navigation: 'z-50' });
  });
});
