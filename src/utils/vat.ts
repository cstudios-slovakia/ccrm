import type { CompanyBillingSettings } from "../types";

/**
 * Standard default VAT rates (Slovakia & general EU standard defaults).
 * Ordered from highest to lowest: 23%, 19%, 10%, 5%, 0%.
 */
export const DEFAULT_VAT_RATES: readonly number[] = [23, 19, 10, 5, 0];

/**
 * Standard default standard VAT rate prefilled on new line items (23%).
 */
export const DEFAULT_STANDARD_VAT_RATE: number = 23;

/**
 * Normalizes an array of VAT rates:
 * - ensures valid numbers between 0 and 100
 * - deduplicates
 * - sorts descending (e.g. 23, 19, 10, 5, 0)
 * Falls back to DEFAULT_VAT_RATES if empty or invalid.
 */
export function sanitizeVatRates(rates?: (number | string)[] | null): number[] {
  if (!Array.isArray(rates) || rates.length === 0) {
    return [...DEFAULT_VAT_RATES];
  }

  const cleaned = Array.from(
    new Set(
      rates
        .map(r => (typeof r === "number" ? r : parseFloat(String(r).trim())))
        .filter(r => !isNaN(r) && r >= 0 && r <= 100)
        .map(r => Math.round(r * 100) / 100) // normalize precision up to 2 decimal places
    )
  ).sort((a, b) => b - a);

  return cleaned.length > 0 ? cleaned : [...DEFAULT_VAT_RATES];
}

/**
 * Returns available VAT rates from company billing settings,
 * falling back to DEFAULT_VAT_RATES.
 */
export function getAvailableVatRates(
  settings?: Pick<CompanyBillingSettings, "vatRates"> | null
): number[] {
  return sanitizeVatRates(settings?.vatRates);
}

/**
 * Returns the default VAT rate from company billing settings.
 * Defaults to 23% (DEFAULT_STANDARD_VAT_RATE).
 * If the configured defaultVatRate is valid, returns it.
 * Otherwise falls back to 23, or the first available VAT rate.
 */
export function getDefaultVatRate(
  settings?: Pick<CompanyBillingSettings, "defaultVatRate" | "vatRates"> | null
): number {
  if (settings?.defaultVatRate !== undefined && settings?.defaultVatRate !== null) {
    const val = typeof settings.defaultVatRate === "number"
      ? settings.defaultVatRate
      : parseFloat(String(settings.defaultVatRate).trim());
    if (!isNaN(val) && val >= 0 && val <= 100) {
      return Math.round(val * 100) / 100;
    }
  }

  const available = getAvailableVatRates(settings);
  if (available.includes(DEFAULT_STANDARD_VAT_RATE)) {
    return DEFAULT_STANDARD_VAT_RATE;
  }
  return available[0] ?? DEFAULT_STANDARD_VAT_RATE;
}
