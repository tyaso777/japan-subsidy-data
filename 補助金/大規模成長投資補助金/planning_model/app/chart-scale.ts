export type NiceChartScale = {
  min: number;
  max: number;
  step: number;
  ticks: number[];
  decimals: number;
};

export type ChartScaleOptions = {
  zeroBaseline?: boolean;
  desiredIntervals?: number;
};

const clean = (value: number) => Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));

function niceStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1
    : normalized <= 2 ? 2
      : normalized <= 2.5 ? 2.5
        : normalized <= 5 ? 5
          : 10;
  return factor * magnitude;
}

export function niceChartScale(values: number[], options: ChartScaleOptions = {}): NiceChartScale {
  const { zeroBaseline = true, desiredIntervals = 6 } = options;
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return { min: 0, max: 1, step: 0.2, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], decimals: 1 };

  const rawMin = Math.min(...finiteValues);
  const rawMax = Math.max(...finiteValues);
  let dataRange = rawMax - rawMin;
  if (dataRange < 1e-12) dataRange = Math.max(Math.abs(rawMax) * 0.2, 1);

  const padding = dataRange * 0.1;
  let paddedMin = rawMin - padding;
  let paddedMax = rawMax + padding;

  if (zeroBaseline && rawMin >= 0) {
    paddedMin = 0;
    paddedMax = rawMax + Math.max(rawMax * 0.08, dataRange * 0.1);
  } else if (zeroBaseline && rawMax <= 0) {
    paddedMax = 0;
    paddedMin = rawMin - Math.max(Math.abs(rawMin) * 0.08, dataRange * 0.1);
  } else if (!zeroBaseline) {
    // 拡大表示でも0に極めて近い系列は、基準として0を含める。
    if (rawMin >= 0 && rawMin <= rawMax * 0.05) paddedMin = 0;
    if (rawMax <= 0 && rawMax >= rawMin * 0.05) paddedMax = 0;
  }

  let step = niceStep((paddedMax - paddedMin) / Math.max(3, desiredIntervals));
  let min = Math.floor(paddedMin / step) * step;
  let max = Math.ceil(paddedMax / step) * step;
  let intervalCount = Math.round((max - min) / step);

  if (intervalCount > 7) {
    step = niceStep(step * 1.5);
    min = Math.floor(paddedMin / step) * step;
    max = Math.ceil(paddedMax / step) * step;
    intervalCount = Math.round((max - min) / step);
  }
  if (intervalCount < 3) {
    const smallerStep = niceStep(step / 2.1);
    if (smallerStep < step) {
      step = smallerStep;
      min = Math.floor(paddedMin / step) * step;
      max = Math.ceil(paddedMax / step) * step;
    }
  }

  intervalCount = Math.max(1, Math.round((max - min) / step));
  const ticks = Array.from({ length: intervalCount + 1 }, (_, index) => clean(min + step * index));
  let decimals = 0;
  while (decimals < 4 && Math.abs(step * 10 ** decimals - Math.round(step * 10 ** decimals)) > 1e-9) decimals += 1;
  return { min: clean(min), max: clean(max), step: clean(step), ticks, decimals };
}
