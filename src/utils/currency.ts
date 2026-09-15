import type { Language } from "./translations";

export type CurrencyCode = "EUR" | "USD" | "GBP" | "CZK" | "PLN";
export type CurrencyPosition = "prefix" | "suffix";

export const CURRENCY_OPTIONS: { code: CurrencyCode; symbol: string; label: string; position: CurrencyPosition }[] = [
  { code: "EUR", symbol: "€", label: "Euro (€)", position: "suffix" },
  { code: "USD", symbol: "$", label: "US Dollar ($)", position: "prefix" },
  { code: "GBP", symbol: "£", label: "British Pound (£)", position: "prefix" },
  { code: "CZK", symbol: "Kč", label: "Czech Koruna (Kč)", position: "suffix" },
  { code: "PLN", symbol: "zł", label: "Polish Złoty (zł)", position: "suffix" },
];

const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  CURRENCY_OPTIONS.map((o) => [o.code, o.symbol])
);

const CURRENCY_POSITIONS: Record<string, CurrencyPosition> = Object.fromEntries(
  CURRENCY_OPTIONS.map((o) => [o.code, o.position])
);

// Region (system/user language) implies a sensible currency default until
// an admin explicitly overrides it in Settings.
export function currencyForRegion(language: Language): CurrencyCode {
  return language === "en" ? "USD" : "EUR";
}

export function resolveCurrencySymbol(currency: string | null | undefined, language: Language): string {
  const code = currency || currencyForRegion(language);
  return CURRENCY_SYMBOLS[code] ?? code;
}

// Where the symbol sits relative to the amount — e.g. "45 000 €" (suffix, EUR)
// vs "$45,000" (prefix, USD). Follows the currency's own convention, not the
// display language.
export function resolveCurrencyPosition(currency: string | null | undefined, language: Language): CurrencyPosition {
  const code = currency || currencyForRegion(language);
  return CURRENCY_POSITIONS[code] ?? "prefix";
}

// Formats an amount with the symbol on the correct side for the resolved
// currency (region default unless overridden in Settings). Number formatting
// itself (thousand/decimal separators) is left to toLocaleOpts / the caller —
// this only decides symbol placement and spacing.
export function formatMoney(
  value: number,
  currency: string | null | undefined,
  language: Language,
  toLocaleOpts?: Intl.NumberFormatOptions
): string {
  const symbol = resolveCurrencySymbol(currency, language);
  const position = resolveCurrencyPosition(currency, language);
  const numStr = value.toLocaleString(undefined, toLocaleOpts);
  return position === "suffix" ? `${numStr} ${symbol}` : `${symbol}${numStr}`;
}

/* -------------------------------------------------------------------------- */
/* Money held in a free-form attribute value                                   */
/* -------------------------------------------------------------------------- */

/**
 * A money attribute stores both halves of the figure, because the currency is
 * picked per record rather than per project type: two projects of the same type
 * can be priced in different currencies, and the amount alone would not say
 * which.
 */
export interface MoneyValue {
  /** null while the box is empty — an unfilled amount is not a zero. */
  amount: number | null;
  currency: string;
}

/**
 * Reads a money attribute back out of `project.data` / `timelineEvent.data`.
 *
 * Those are `Record<string, any>` columns: sync.php JSON-encodes anything that
 * is not a scalar on the way in, and hands the project-data table's values back
 * as they were stored. So the same value arrives as an object from local state
 * and as its JSON text after a round trip — both are accepted here, along with
 * a bare number from an attribute that used to be a plain `number` field.
 */
export function parseMoneyValue(raw: unknown, fallbackCurrency: string): MoneyValue {
  const empty: MoneyValue = { amount: null, currency: fallbackCurrency };
  if (raw === undefined || raw === null || raw === "") return empty;

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { amount: raw, currency: fallbackCurrency } : empty;
  }

  let value: any = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return empty;
    if (trimmed.startsWith("{")) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        return empty;
      }
    } else {
      const parsed = Number(trimmed.replace(",", "."));
      return Number.isFinite(parsed) ? { amount: parsed, currency: fallbackCurrency } : empty;
    }
  }

  if (typeof value !== "object" || value === null) return empty;
  const amount = value.amount;
  const parsed = typeof amount === "number" ? amount : Number(String(amount ?? "").replace(",", "."));
  return {
    amount: amount === null || amount === undefined || amount === "" || !Number.isFinite(parsed) ? null : parsed,
    currency: typeof value.currency === "string" && value.currency ? value.currency : fallbackCurrency,
  };
}

/** True when a money attribute holds no amount — what "required" has to test. */
export function isMoneyValueEmpty(raw: unknown, fallbackCurrency: string): boolean {
  return parseMoneyValue(raw, fallbackCurrency).amount === null;
}
