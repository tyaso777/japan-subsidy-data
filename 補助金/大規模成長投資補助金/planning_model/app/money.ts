export const INTERNAL_MONEY_UNIT = "千円" as const;
export type MoneyDisplayUnit = "千円" | "百万円" | "億円";

const THOUSAND_YEN_PER_UNIT: Record<MoneyDisplayUnit, number> = {
  千円: 1,
  百万円: 1_000,
  億円: 100_000,
};

/** Canonicalize a monetary amount at the model boundary. */
export const normalizeInternalMoney = (value: number) =>
  Number.isFinite(value) ? Math.round(value) : 0;

/** Convert an entered/displayed amount to the canonical integer 千円 value. */
export const fromDisplayMoney = (value: number, unit: MoneyDisplayUnit) =>
  normalizeInternalMoney(value * THOUSAND_YEN_PER_UNIT[unit]);

/** Convert a canonical integer 千円 value for display only. */
export const toDisplayMoney = (value: number, unit: MoneyDisplayUnit) =>
  normalizeInternalMoney(value) / THOUSAND_YEN_PER_UNIT[unit];

/** One-time migration helper for proposal/sample data created by the old 億円 model. */
export const legacyOkuToInternalMoney = (value: number) =>
  fromDisplayMoney(value, "億円");

export const moneyUnitLabel = (unit: MoneyDisplayUnit) =>
  unit === "千円" ? "千円（第6次様式）" : unit;
