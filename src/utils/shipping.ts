import type { CompanyBillingSettings } from "../types";

/**
 * Default shipping methods for e-shop and commercial orders.
 */
export const DEFAULT_SHIPPING_METHODS: readonly string[] = [
  "DPD Kuriér",
  "Packeta / Zásielkovňa",
  "GLS Expres",
  "Slovenská pošta",
  "Osobný odber"
];

/**
 * Returns a sanitized, deduplicated list of available shipping methods.
 * Falls back to DEFAULT_SHIPPING_METHODS if empty or unconfigured.
 */
export function getAvailableShippingMethods(
  settings?: Pick<CompanyBillingSettings, "shippingMethods"> | null
): string[] {
  const configured = settings?.shippingMethods;
  if (!Array.isArray(configured) || configured.length === 0) {
    return [...DEFAULT_SHIPPING_METHODS];
  }

  const cleaned = Array.from(
    new Set(
      configured
        .map(m => (typeof m === "string" ? m.trim() : ""))
        .filter(m => m.length > 0)
    )
  );

  return cleaned.length > 0 ? cleaned : [...DEFAULT_SHIPPING_METHODS];
}
