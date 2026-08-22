import type { ComponentPropsWithRef, CSSProperties } from 'react';
import { cn } from '../../lib/utils';

export const stickySurfaceBaseClassName = 'sticky isolate bg-surface';

export const stickyLayerClassNames = {
  panel: 'z-10',
  section: 'z-20',
  content: 'z-30',
  operation: 'z-40',
  navigation: 'z-50',
} as const;

export type StickyLayer = keyof typeof stickyLayerClassNames;

export function stickySurfaceStyle(stickyTop: string, style?: CSSProperties): CSSProperties {
  return { ...style, top: stickyTop, backgroundColor: 'var(--color-surface)' };
}

type StickySurfaceProps = ComponentPropsWithRef<'div'> & {
  stickyTop: string;
  layer: StickyLayer;
};

export function StickySurface({ stickyTop, layer, className, style, ...props }: StickySurfaceProps) {
  return (
    <div
      className={cn(className, stickySurfaceBaseClassName, stickyLayerClassNames[layer])}
      style={stickySurfaceStyle(stickyTop, style)}
      {...props}
    />
  );
}
