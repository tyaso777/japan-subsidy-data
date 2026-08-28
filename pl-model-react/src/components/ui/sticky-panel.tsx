import type { CSSProperties, ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { stickyLayerClassNames, stickySurfaceBaseClassName, stickySurfaceStyle, type StickyLayer } from './sticky-surface';

type StickyPanelProps = Omit<ComponentPropsWithRef<'aside'>, 'children'> & {
  testIdPrefix: string;
  stickyTop: string;
  bottomGap?: number;
  header: ReactNode;
  children: ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  bodyRef?: ComponentPropsWithRef<'div'>['ref'];
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
  bodyRef,
  scrollMode = 'auto',
  layer = 'panel',
  className,
  style,
  ...props
}: StickyPanelProps) {
  return (
    <aside
      data-testid={`${testIdPrefix}-panel`}
      className={cn(className, 'flex min-w-0 flex-col overflow-hidden border border-line', stickySurfaceBaseClassName, stickyLayerClassNames[layer])}
      style={{ ...stickySurfaceStyle(stickyTop, style), maxHeight: `calc(100vh - (${stickyTop} + ${bottomGap}px))` }}
      {...props}
    >
      <div
        data-testid={`${testIdPrefix}-header`}
        className={cn('relative isolate shrink-0 border-b border-line bg-surface shadow-sm', stickyLayerClassNames[layer], headerClassName)}
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        {header}
      </div>
      <div
        ref={bodyRef}
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
