export const INTERNAL_MONEY_UNIT = "円" as const;
export type MoneyDisplayUnit = "千円" | "百万円" | "億円";

const YEN_PER_UNIT: Record<MoneyDisplayUnit, number> = {
  千円: 1_000,
  百万円: 1_000_000,
  億円: 100_000_000,
};

/** Canonicalize a monetary amount at the model boundary. */
export const normalizeInternalMoney = (value: number) =>
  Number.isFinite(value) ? Math.round(value) : 0;

/** Convert an entered/displayed amount to the canonical integer 円 value. */
export const fromDisplayMoney = (value: number, unit: MoneyDisplayUnit) =>
  normalizeInternalMoney(value * YEN_PER_UNIT[unit]);

/** Convert a canonical integer 円 value for display only. */
export const toDisplayMoney = (value: number, unit: MoneyDisplayUnit) =>
  normalizeInternalMoney(value) / YEN_PER_UNIT[unit];

export const moneyDisplayFractionDigits = (unit: MoneyDisplayUnit) =>
  unit === "千円" ? 0 : 2;

export const moneyEditableFractionDigits = (unit: MoneyDisplayUnit) =>
  unit === "千円" ? 3 : unit === "百万円" ? 6 : 8;

/** Format canonical money for reading without exposing unnecessary conversion decimals. */
export const formatDisplayMoney = (value: number, unit: MoneyDisplayUnit) =>
  toDisplayMoney(value, unit).toLocaleString("ja-JP", {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: moneyDisplayFractionDigits(unit),
  });

/** Format canonical money for editing without losing any yen precision. */
export const formatEditableMoney = (value: number, unit: MoneyDisplayUnit) =>
  toDisplayMoney(value, unit).toLocaleString("ja-JP", {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: moneyEditableFractionDigits(unit),
  });

/** Format a numeric input with grouped thousands while preserving an editable decimal suffix. */
export const formatNumericInput = (value: number | string, maximumFractionDigits?: number) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return value.toLocaleString("ja-JP", {
      useGrouping: true,
      maximumFractionDigits: maximumFractionDigits ?? 20,
    });
  }

  const normalized = value.replaceAll(",", "").trim();
  if (normalized === "") return "";
  if (!/^-?(?:\d+|\d*\.\d*)$/.test(normalized)) return value;

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const hasDecimalPoint = unsigned.includes(".");
  const [integerPart = "", fractionPart = ""] = unsigned.split(".");
  const groupedInteger = (integerPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const limitedFraction = maximumFractionDigits === undefined
    ? fractionPart
    : fractionPart.slice(0, maximumFractionDigits);
  return `${negative ? "-" : ""}${groupedInteger}${hasDecimalPoint ? `.${limitedFraction}` : ""}`;
};

/** Parse a grouped numeric input without treating blank or partial signs as zero. */
export const parseNumericInput = (value: string) => {
  const normalized = value.replaceAll(",", "").trim();
  if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Convert concise 億円 constants into canonical integer 円 values. */
export const okuToInternalMoney = (value: number) =>
  fromDisplayMoney(value, "億円");

export const moneyUnitLabel = (unit: MoneyDisplayUnit) =>
  unit === "千円" ? "千円（第6次様式）" : unit;
