import type { CSSProperties, ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { StickySurface, stickyLayerClassNames, stickySurfaceBaseClassName, stickySurfaceStyle, type StickyLayer } from './sticky-surface';

type StickyPanelProps = Omit<ComponentPropsWithRef<'aside'>, 'children'> & {
  testIdPrefix: string;
  stickyTop: string;
  bottomGap?: number;
  header: ReactNode;
  children: ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  scrollMode?: 'auto' | 'always';
  layer?: StickyLayer;
};

export function StickyPanel({
  testIdPrefix,
  stickyTop,
  bottomGap = 12,
  header,
  children,
  headerClassName,
  bodyClassName,
  bodyStyle,
  scrollMode = 'auto',
  layer = 'panel',
  className,
  style,
  ...props
}: StickyPanelProps) {
  return (
    <aside
      data-testid={`${testIdPrefix}-panel`}
      className={cn(className, 'flex min-w-0 flex-col overflow-visible border border-line', stickySurfaceBaseClassName, stickyLayerClassNames[layer])}
      style={{ ...stickySurfaceStyle(stickyTop, style), maxHeight: `calc(100vh - (${stickyTop} + ${bottomGap}px))` }}
      {...props}
    >
      <StickySurface
        data-testid={`${testIdPrefix}-header`}
        stickyTop={stickyTop}
        layer={layer}
        className={cn('shrink-0 border-b border-line bg-surface shadow-sm', headerClassName)}
      >
        {header}
      </StickySurface>
      <div
        data-testid={`${testIdPrefix}-body`}
        className={cn(
          'min-h-0 overflow-x-hidden',
          scrollMode === 'always' ? 'overflow-y-scroll' : 'overflow-y-auto',
          bodyClassName,
        )}
        style={bodyStyle}
      >
        {children}
      </div>
    </aside>
  );
}
