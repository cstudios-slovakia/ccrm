/*
  ── WAREHOUSE ITEM PRICING & LOOKUP ─────────────────────

  What an item costs a given customer, which VAT it carries, how it is packed
  and how it is found. Pure functions, so the offer editor, the order screen,
  the warehouse list and the tests all read one rule.

  Price levels (price lists) are an admin-defined list in Settings ("Retail",
  "Wholesale", "Partner"). An item carries one price per level beside its
  `defaultSellPrice`; a client may carry a default level. Picking an item for
  that client uses the level's price and falls back to `defaultSellPrice` when
  the item has no usable price on that level. No discount engine.
*/
import type { CompanyBillingSettings, WarehouseItem } from "../types";
import { getDefaultVatRate } from "./vat.ts";

export interface PriceLevel {
  id: string;
  name: string;
}

type PricedItem = Pick<WarehouseItem, "defaultSellPrice"> & { priceLevels?: Record<string, number> | null };

const MAX_NAME_LENGTH = 60;

/**
 * A stored list, cleaned up: unique non-empty ids, a trimmed non-empty name
 * (unique ignoring case). Anything unreadable gives an empty list — an
 * installation that never opened the editor has no levels.
 */
export const normalizePriceLevels = (raw: unknown): PriceLevel[] => {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const out: PriceLevel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = String(rec.id ?? "").trim();
    const name = String(rec.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
    if (!id || id.length > 50 || !name || ids.has(id) || names.has(name.toLowerCase())) continue;
    ids.add(id);
    names.add(name.toLowerCase());
    out.push({ id, name });
  }
  return out;
};

/** An id for a level added under `name`; stable once written, unique against `taken`. */
export const priceLevelIdFor = (name: string, taken: readonly string[]): string => {
  const base =
    "pl-" +
    (name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "level");
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
};

const usable = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** The level's own price for the item, or null when it has none (a missing, zero or negative price is "not set"). */
export const levelPriceOf = (item: PricedItem, levelId: string | null | undefined): number | null => {
  if (!levelId) return null;
  const price = item.priceLevels?.[levelId];
  return usable(price) ? price : null;
};

/**
 * The unit sell price for a customer: the price on their level when the level
 * still exists and the item has a price on it, else the item's default price.
 */
export const resolveSellPrice = (
  item: PricedItem,
  levelId: string | null | undefined,
  levels: readonly PriceLevel[] = [],
): number => {
  if (levelId && levels.some((l) => l.id === levelId)) {
    const price = levelPriceOf(item, levelId);
    if (price !== null) return price;
  }
  return Number.isFinite(item.defaultSellPrice) ? item.defaultSellPrice : 0;
};

/** Which level a price came from, for a hint: the level, or null when the default applied. */
export const appliedPriceLevel = (
  item: PricedItem,
  levelId: string | null | undefined,
  levels: readonly PriceLevel[] = [],
): PriceLevel | null => {
  const level = levelId ? levels.find((l) => l.id === levelId) : undefined;
  return level && levelPriceOf(item, level.id) !== null ? level : null;
};

/**
 * The VAT rate to prefill on a document line: the item's own rate when it has
 * one, else the company default. The default is read from the billing settings,
 * never from a literal (the Slovak standard rate changed to 23 % in 2025).
 */
export const resolveItemVatRate = (
  item: Pick<WarehouseItem, "vatRate">,
  settings?: Pick<CompanyBillingSettings, "defaultVatRate" | "vatRates"> | null,
): number => {
  const own = item.vatRate;
  if (typeof own === "number" && Number.isFinite(own) && own >= 0 && own <= 100) return own;
  return getDefaultVatRate(settings);
};

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

/** "1 pack = 1.44 m²", or null when the item has no pack size. */
export const packHint = (
  item: Pick<WarehouseItem, "packQuantity" | "packUnit" | "unit">,
  packWord: string,
): string | null => {
  const qty = item.packQuantity;
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) return null;
  const label = (item.packUnit || "").trim() || packWord;
  return `1 ${label} = ${fmt(qty)} ${item.unit || "ks"}`;
};

/** Whole packs needed for a quantity — a suggestion to show, never a silent change. */
export const suggestedPacks = (quantity: number, packQuantity: number | null | undefined): number | null => {
  if (!usable(packQuantity) || !Number.isFinite(quantity) || quantity <= 0) return null;
  const packs = Math.ceil(Math.round((quantity / packQuantity) * 1e6) / 1e6);
  return packs * packQuantity === quantity ? null : packs;
};

/** The codes beside the SKU, cleaned: trimmed, non-empty, unique. */
export const normalizeAltCodes = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;\n]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    const code = String(entry ?? "").trim().slice(0, 100);
    if (!code || seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    out.push(code);
  }
  return out;
};

/** Everything an item is found by: name, SKU, barcode, alternative codes and the external id. */
export const matchesItemQuery = (
  item: Pick<WarehouseItem, "name" | "sku" | "barcode" | "altCodes" | "externalId">,
  query: string,
): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [item.name, item.sku, item.barcode, item.externalId, ...(item.altCodes ?? [])];
  return hay.some((v) => typeof v === "string" && v.toLowerCase().includes(q));
};

/**
 * The price level a customer buys on. A client is a `leads` row with a `client-*`
 * id and a lead links to it through `clientId`, so a lead without a level of its
 * own takes its client's. Null when neither has one.
 */
export const clientPriceLevelId = (
  lead: { priceLevelId?: string | null; clientId?: string | null } | null | undefined,
  leads: readonly { id: string; priceLevelId?: string | null }[],
): string | null => {
  if (!lead) return null;
  if (lead.priceLevelId) return lead.priceLevelId;
  if (lead.clientId) return leads.find((l) => l.id === lead.clientId)?.priceLevelId || null;
  return null;
};
