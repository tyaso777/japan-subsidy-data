export type TabularClipboardValue = string | number | null;

function parseClipboardNumber(source: string): number | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[,%¥￥$\s]/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

export function parseTabularClipboard(source: string): (number | null)[][] {
  const normalized = source.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  return normalized.split('\n').map((row) => row.split('\t').map(parseClipboardNumber));
}

export function serializeTabularClipboard(values: TabularClipboardValue[][]): string {
  return values.map((row) => row.map((value) => {
    if (value === null) return '';
    if (typeof value === 'number' && !Number.isFinite(value)) return '';
    return String(value);
  }).join('\t')).join('\n');
}
