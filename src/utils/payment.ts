import type { CompanyBillingSettings } from "../types";

/**
 * Standard default payment methods for commercial and e-shop orders.
 */
export const DEFAULT_PAYMENT_METHODS: readonly string[] = [
  "Prevod na účet",
  "Dobierka",
  "Platobná karta",
  "Hotovosť"
];

export const DEFAULT_STANDARD_PAYMENT_METHOD = "Prevod na účet";

/**
 * Returns a sanitized, deduplicated list of available payment methods.
 * Falls back to DEFAULT_PAYMENT_METHODS if empty or unconfigured.
 */
export function getAvailablePaymentMethods(
  settings?: Pick<CompanyBillingSettings, "paymentMethods"> | null
): string[] {
  const configured = settings?.paymentMethods;
  if (!Array.isArray(configured) || configured.length === 0) {
    return [...DEFAULT_PAYMENT_METHODS];
  }

  const cleaned = Array.from(
    new Set(
      configured
        .map(m => (typeof m === "string" ? m.trim() : ""))
        .filter(m => m.length > 0)
    )
  );

  return cleaned.length > 0 ? cleaned : [...DEFAULT_PAYMENT_METHODS];
}

/**
 * Returns the default payment method to prefill when creating new orders.
 */
export function getDefaultPaymentMethod(
  settings?: Pick<CompanyBillingSettings, "defaultPaymentMethod" | "paymentMethods"> | null
): string {
  const available = getAvailablePaymentMethods(settings);
  const preferred = settings?.defaultPaymentMethod?.trim();

  if (preferred && available.includes(preferred)) {
    return preferred;
  }

  if (available.includes(DEFAULT_STANDARD_PAYMENT_METHOD)) {
    return DEFAULT_STANDARD_PAYMENT_METHOD;
  }

  return available[0] || DEFAULT_STANDARD_PAYMENT_METHOD;
}
