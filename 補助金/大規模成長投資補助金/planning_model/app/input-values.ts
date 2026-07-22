import type { Drivers, MetricKey } from "./model";

/**
 * Raw input layer.  A missing key means "not entered"; a present key may
 * legitimately contain 0.  Calculation models continue to use numbers only.
 */
export type InputValues = Record<string, number>;

export const inputKey = {
  companyActual: (year: number, code: string) => `actual:company:${year}:${code}`,
  projectActual: (year: number, code: string) => `actual:project:${year}:${code}`,
  balanceSheet: (year: number, field: string) => `balance-sheet:${year}:${field}`,
  futureCapex: (year: number) => `future-capex:${year}`,
  driver: (key: keyof Drivers) => `driver:${key}`,
  driverRange: (key: keyof Drivers, bound: 0 | 1) => `driver-range:${key}:${bound}`,
  target: (key: MetricKey, bound: "value" | "max") => `target:${key}:${bound}`,
};

export const hasInputValue = (values: InputValues, key: string) =>
  Object.prototype.hasOwnProperty.call(values, key);

export const getInputValue = (values: InputValues, key: string): number | "" =>
  hasInputValue(values, key) && Number.isFinite(values[key]) ? values[key] : "";

export function setInputValue(values: InputValues, key: string, value: number | null): InputValues {
  const next = { ...values };
  if (value === null || !Number.isFinite(value)) delete next[key];
  else next[key] = value;
  return next;
}
