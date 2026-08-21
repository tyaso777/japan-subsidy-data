export type ChartExtent = { min: number; max: number };

export function chartAxisTicks(extent: ChartExtent): number[] {
  const interval = (extent.max - extent.min) / 4;
  return Array.from({ length: 5 }, (_, index) => {
    const value = extent.min + interval * index;
    return Math.abs(value) < Number.EPSILON ? 0 : value;
  });
}

const preferredSteps = [1, 1.25, 1.5, 2, 2.5, 5, 7.5, 10];

function niceStep(required: number): number {
  if (!Number.isFinite(required) || required <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(required));
  const normalized = required / exponent;
  return (preferredSteps.find((candidate) => candidate >= normalized) ?? 10) * exponent;
}

function proposedExtent(dataMin: number, dataMax: number): ChartExtent {
  const paddedMin = Math.abs(Math.min(0, dataMin)) * 1.3;
  const paddedMax = Math.max(1, dataMax) * 1.3;
  if (dataMin >= 0) {
    const step = niceStep(paddedMax / 4);
    return { min: 0, max: step * 4 };
  }
  if (dataMax <= 0) {
    const step = niceStep(paddedMin / 4);
    return { min: -step * 4, max: 0 };
  }

  let step = niceStep((paddedMin + paddedMax) / 4);
  let lowerIntervals = Math.ceil(paddedMin / step);
  let upperIntervals = Math.ceil(paddedMax / step);
  while (lowerIntervals + upperIntervals > 4) {
    step = niceStep(step * 1.001);
    lowerIntervals = Math.ceil(paddedMin / step);
    upperIntervals = Math.ceil(paddedMax / step);
  }
  const spareIntervals = 4 - lowerIntervals - upperIntervals;
  if (spareIntervals > 0) {
    if (paddedMin > paddedMax) lowerIntervals += spareIntervals;
    else upperIntervals += spareIntervals;
  }
  return { min: -lowerIntervals * step, max: upperIntervals * step };
}

export function nextChartExtent(previous: ChartExtent | undefined, values: number[]): ChartExtent {
  const finite = values.filter(Number.isFinite);
  const dataMin = Math.min(0, ...finite);
  const dataMax = Math.max(0, ...finite);
  const proposed = proposedExtent(dataMin, dataMax);
  if (!previous) return proposed;
  const exceeds = dataMax > previous.max || dataMin < previous.min;
  const muchSmaller = dataMax < previous.max / 2.5 && (previous.min === 0 ? dataMin === 0 : Math.abs(dataMin) < Math.abs(previous.min) / 2.5);
  return exceeds || muchSmaller ? proposed : previous;
}
