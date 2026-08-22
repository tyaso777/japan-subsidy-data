import type { CSSProperties, ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { stickySurfaceBaseClassName, stickySurfaceStyle } from './sticky-surface';

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
  className,
  style,
  ...props
}: StickyPanelProps) {
  return (
    <aside
      data-testid={`${testIdPrefix}-panel`}
      className={cn(stickySurfaceBaseClassName, 'flex min-w-0 flex-col overflow-hidden border border-line', className)}
      style={{ ...stickySurfaceStyle(stickyTop, style), maxHeight: `calc(100vh - (${stickyTop} + ${bottomGap}px))` }}
      {...props}
    >
      <div
        data-testid={`${testIdPrefix}-header`}
        className={cn('shrink-0 border-b border-line bg-surface shadow-sm', headerClassName)}
      >
        {header}
      </div>
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
