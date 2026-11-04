/**
 * The product name shown to people — one source of truth.
 *
 * The product was built as "CCRM" and is now called "Koperniq". Every visible
 * mention of the name goes through here, so:
 *
 *  - nothing is blank when the company has not chosen a name (it is Koperniq);
 *  - Settings → "System Brand Name" overrides it everywhere at once.
 *
 * What is stored (localStorage, `system_settings.SYSTEM_NAME`, the sync blob) is
 * only the OVERRIDE. An empty string means "use the default". Never store the
 * default itself: a stored default would stop following a future rename.
 */
import { useSyncExternalStore } from "react";

export const DEFAULT_BRAND_NAME = "Koperniq";

/**
 * What to keep as the override: trimmed, "" when blank. Any name is a real
 * choice, "CCRM" included: installs that saved it before the rename keep
 * showing it until the company clears the field, and it can be set on purpose.
 */
export function normalizeBrandOverride(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** The name to display for a stored override. */
export function resolveBrandName(raw: unknown): string {
  return normalizeBrandOverride(raw) || DEFAULT_BRAND_NAME;
}

// Plain strings and non-React code (notification text, exports, window titles)
// read the name through `getBrandName()`; components subscribe with
// `useBrandName()` so they repaint the moment Settings changes it.
let current = DEFAULT_BRAND_NAME;
const listeners = new Set<() => void>();

/** Called by App with the stored override whenever it changes. */
export function setBrandName(override: unknown): void {
  const next = resolveBrandName(override);
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

export function getBrandName(): string {
  return current;
}

export function useBrandName(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getBrandName,
    () => DEFAULT_BRAND_NAME,
  );
}

/** Fills the `{brand}` placeholder used by the translation tables. */
export function withBrand(text: string): string {
  return text.includes("{brand}") ? text.split("{brand}").join(current) : text;
}
