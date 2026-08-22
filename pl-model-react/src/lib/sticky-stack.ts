import { useEffect, useRef, useState } from 'react';

const STICKY_SEAM_OVERLAP_PX = 1;

export function stickyStackOffset(top: number, measuredHeight: number) {
  if (measuredHeight <= 0) return Math.max(0, top);
  return Math.max(0, top + measuredHeight - STICKY_SEAM_OVERLAP_PX);
}

export function stickyStackOffsetCss(base: string, measuredHeight: number) {
  if (measuredHeight <= 0) return base;
  return `calc(${base} + ${Math.max(0, measuredHeight - STICKY_SEAM_OVERLAP_PX)}px)`;
}

export function useObservedHeight<T extends HTMLElement>(fallbackHeight = 0) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(fallbackHeight);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (measuredHeight: number) => {
      if (measuredHeight > 0) setHeight(Math.ceil(measuredHeight));
    };
    update(element.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const borderBox = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
      update(borderBox?.blockSize || element.getBoundingClientRect().height || entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, height };
}
