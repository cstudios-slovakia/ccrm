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
