export type MoneyDisplayUnit = 'yen' | 'thousandYen' | 'millionYen' | 'hundredMillionYen';
export type ValueKind = 'money' | 'percent' | 'point' | 'fte' | 'count' | 'moneyPerPerson' | 'multiple' | 'index';

const moneyUnits: Record<MoneyDisplayUnit, { label: string; divisor: number }> = {
  yen: { label: '円', divisor: 1 },
  thousandYen: { label: '千円', divisor: 1_000 },
  millionYen: { label: '百万円', divisor: 1_000_000 },
  hundredMillionYen: { label: '億円', divisor: 100_000_000 },
};

export const valueKindMetadata: Record<ValueKind, { label: string; monetary: boolean; defaultFractionDigits: number }> = {
  money: { label: '金額', monetary: true, defaultFractionDigits: 2 },
  percent: { label: '比率', monetary: false, defaultFractionDigits: 2 },
  point: { label: 'ポイント', monetary: false, defaultFractionDigits: 2 },
  fte: { label: '就業時間換算人数', monetary: false, defaultFractionDigits: 2 },
  count: { label: '人数', monetary: false, defaultFractionDigits: 2 },
  moneyPerPerson: { label: '1人当たり金額', monetary: true, defaultFractionDigits: 2 },
  multiple: { label: '倍率', monetary: false, defaultFractionDigits: 2 },
  index: { label: '指数', monetary: false, defaultFractionDigits: 2 },
};

export const moneyDisplayUnits = (Object.keys(moneyUnits) as MoneyDisplayUnit[]).map((id) => ({ id, label: moneyUnits[id].label }));

export function moneyUnitLabel(unit: MoneyDisplayUnit): string {
  return moneyUnits[unit].label;
}

export function toDisplayMoney(yen: number, unit: MoneyDisplayUnit): number {
  return yen / moneyUnits[unit].divisor;
}

export function fromDisplayMoney(value: number, unit: MoneyDisplayUnit): number {
  return value * moneyUnits[unit].divisor;
}

export function toDisplayFinancialValue(value: number, kind: ValueKind, unit: MoneyDisplayUnit): number {
  return valueKindMetadata[kind].monetary ? toDisplayMoney(value, unit) : value;
}

export function fromDisplayFinancialValue(value: number, kind: ValueKind, unit: MoneyDisplayUnit): number {
  return valueKindMetadata[kind].monetary ? fromDisplayMoney(value, unit) : value;
}

export function formatFinancialValue(value: number, kind: ValueKind, unit: MoneyDisplayUnit, maximumFractionDigits = valueKindMetadata[kind].defaultFractionDigits): string {
  const displayed = toDisplayFinancialValue(value, kind, unit);
  const formatted = new Intl.NumberFormat('ja-JP', { maximumFractionDigits }).format(displayed);
  if (kind === 'percent') return `${formatted}%`;
  if (kind === 'point') return `${formatted}pt`;
  if (kind === 'fte' || kind === 'count') return `${formatted}人`;
  if (kind === 'moneyPerPerson') return `${formatted} ${moneyUnitLabel(unit)}/人`;
  if (kind === 'multiple') return `${formatted}倍`;
  return formatted;
}

export function financialInputStep(kind: ValueKind, unit: MoneyDisplayUnit): number {
  if (kind === 'fte' || kind === 'count') return 0.01;
  if (valueKindMetadata[kind].monetary) return unit === 'yen' ? 1 : 0.01;
  return 0.01;
}

export function financialInputFractionDigits(kind: ValueKind, unit: MoneyDisplayUnit): number {
  if (!valueKindMetadata[kind].monetary) return 2;
  if (unit === 'yen') return 0;
  if (unit === 'hundredMillionYen') return 2;
  return 1;
}

export function roundFinancialInputValue(value: number, kind: ValueKind, unit: MoneyDisplayUnit): number {
  return Number(value.toFixed(financialInputFractionDigits(kind, unit)));
}
