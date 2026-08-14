export type ChartExtent = { min: number; max: number };

const preferred = [1, 1.5, 2, 2.5, 3, 4.5, 6, 7.5, 9, 10];

function niceBound(required: number): number {
  if (!Number.isFinite(required) || required <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(required));
  const normalized = required / exponent;
  return (preferred.find((candidate) => candidate >= normalized) ?? 10) * exponent;
}

export function nextChartExtent(previous: ChartExtent | undefined, values: number[]): ChartExtent {
  const finite = values.filter(Number.isFinite);
  const dataMin = Math.min(0, ...finite);
  const dataMax = Math.max(0, ...finite);
  const proposed = {
    min: dataMin < 0 ? -niceBound(Math.abs(dataMin) * 1.3) : 0,
    max: niceBound(Math.max(dataMax, 1) * 1.3),
  };
  if (!previous) return proposed;
  const exceeds = dataMax > previous.max || dataMin < previous.min;
  const muchSmaller = dataMax < previous.max / 2.5 && (previous.min === 0 ? dataMin === 0 : Math.abs(dataMin) < Math.abs(previous.min) / 2.5);
  return exceeds || muchSmaller ? proposed : previous;
}
