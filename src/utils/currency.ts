import type { Language } from "./translations";

export type CurrencyCode = "EUR" | "USD" | "GBP" | "CZK" | "PLN";

export const CURRENCY_OPTIONS: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
  { code: "CZK", symbol: "Kč", label: "Czech Koruna (Kč)" },
  { code: "PLN", symbol: "zł", label: "Polish Złoty (zł)" },
];

const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  CURRENCY_OPTIONS.map((o) => [o.code, o.symbol])
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
