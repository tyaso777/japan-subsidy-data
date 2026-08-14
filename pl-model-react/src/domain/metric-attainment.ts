export function metricAttainmentScore(direction: 'min' | 'max', current: number, target: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return null;
  const achieved = direction === 'max' ? current <= target : current >= target;
  if (achieved) return 1;
  const gap = direction === 'max' ? current - target : target - current;
  const reference = Math.max(Math.abs(target), 1);
  return Math.max(0, Math.min(1, 1 - gap / reference));
}

export function metricAttainmentColor(score: number | null): string {
  if (!Number.isFinite(score)) return '#667085';
  const stops = [
    { at: 0, rgb: [199, 91, 36] },
    { at: .65, rgb: [178, 138, 46] },
    { at: 1, rgb: [22, 125, 120] },
  ];
  const bounded = Math.max(0, Math.min(1, score!));
  const found = stops.findIndex((stop) => stop.at >= bounded);
  const upperIndex = found < 0 ? stops.length - 1 : Math.max(1, found);
  const upper = stops[upperIndex];
  const lower = stops[upperIndex - 1];
  const ratio = upper.at === lower.at ? 0 : (bounded - lower.at) / (upper.at - lower.at);
  const rgb = lower.rgb.map((value, index) => Math.round(value + (upper.rgb[index] - value) * ratio));
  return `rgb(${rgb.join(', ')})`;
}
