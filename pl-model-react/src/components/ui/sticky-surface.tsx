import type { ComponentPropsWithRef, CSSProperties } from 'react';
import { cn } from '../../lib/utils';

export const stickySurfaceBaseClassName = 'sticky isolate bg-surface';

export function stickySurfaceStyle(stickyTop: string, style?: CSSProperties): CSSProperties {
  return { ...style, top: stickyTop };
}

type StickySurfaceProps = ComponentPropsWithRef<'div'> & {
  stickyTop: string;
};

export function StickySurface({ stickyTop, className, style, ...props }: StickySurfaceProps) {
  return (
    <div
      className={cn(stickySurfaceBaseClassName, className)}
      style={stickySurfaceStyle(stickyTop, style)}
      {...props}
    />
  );
}
