/**
 * The two names people see — one source of truth.
 *
 *  - PRODUCT NAME ("Koperniq"): what the software is. Fixed for every install.
 *    It is the name in hints, guides, warnings, the installer, the sidebar's top
 *    button and the profile footer. To rename the product, change PRODUCT_NAME
 *    here (and `KOPERNIQ_PRODUCT_NAME` in public/api/brand.php for the backend).
 *
 *  - SYSTEM TITLE (e.g. "Lapidea"): whose installation this is. The company sets
 *    it in Settings → System title; it shows in the page header, the login
 *    heading, the browser tab and the installed app. Empty means the install has
 *    no title of its own, and wherever a title is wanted the product name stands
 *    in for it.
 *
 * Think Craft CMS: the product is always "Craft CMS", while an install can carry
 * its own site name. The product was built as "CCRM"; nothing visible says so any
 * more, and "CRM" is not a name for it at all (it is no longer only a CRM).
 *
 * What is stored (localStorage, `system_settings.SYSTEM_NAME`, the sync blob) is
 * only the title OVERRIDE. An empty string means "none". Never store the product
 * name as a title: a stored copy would stop following a future rename.
 */
import { useSyncExternalStore } from "react";

export const PRODUCT_NAME = "Koperniq";

/**
 * What a licence key starts with: KPRNQ-XXXX-XXXX-XXXX-XXXX. Keys issued before the rename
 * start with CCRM- and stay valid; the key itself is never rewritten here.
 */
export const LICENSE_KEY_PREFIX = "KPRNQ";

/** The command-line entry point: `php kprnq update` (`php ccrm` forwards to it). */
export const PRODUCT_CLI = "kprnq";

/**
 * What to keep as the title override: trimmed, "" when blank. Any title is a real
 * choice, "CCRM" included: installs that saved it before the rename keep showing
 * it until the company clears the field.
 */
export function normalizeSystemTitleOverride(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** The title to display for a stored override: the override, or the product name. */
export function resolveSystemTitle(raw: unknown): string {
  return normalizeSystemTitleOverride(raw) || PRODUCT_NAME;
}

/**
 * Title and product together: "Lapidea (Koperniq)". With no title of its own the
 * install is just "Koperniq", never "Koperniq (Koperniq)". Used where one string
 * has to say both: the browser tab and the installed app's name.
 */
export function resolveTitleWithProduct(raw: unknown): string {
  const override = normalizeSystemTitleOverride(raw);
  return override && override !== PRODUCT_NAME ? `${override} (${PRODUCT_NAME})` : PRODUCT_NAME;
}

// Plain strings and non-React code (notification text, exports, window titles)
// read the title through `getSystemTitle()`; components subscribe with
// `useSystemTitle()` so they repaint the moment Settings changes it.
let currentOverride = "";
const listeners = new Set<() => void>();

/** Called by App with the stored override whenever it changes. */
export function setSystemTitle(override: unknown): void {
  const next = normalizeSystemTitleOverride(override);
  if (next === currentOverride) return;
  currentOverride = next;
  listeners.forEach((l) => l());
}

export function getSystemTitle(): string {
  return resolveSystemTitle(currentOverride);
}

export function getSystemTitleWithProduct(): string {
  return resolveTitleWithProduct(currentOverride);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSystemTitle(): string {
  return useSyncExternalStore(subscribe, getSystemTitle, () => PRODUCT_NAME);
}

/**
 * Fills the placeholders used by the translation tables:
 * `{product}` is always the product name, `{title}` is the system title.
 */
export function withBrand(text: string): string {
  if (!text.includes("{product}") && !text.includes("{title}")) return text;
  return text.split("{product}").join(PRODUCT_NAME).split("{title}").join(getSystemTitle());
}
