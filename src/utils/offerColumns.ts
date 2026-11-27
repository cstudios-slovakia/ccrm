// The columns of the price offers list and how a user arranges them. One
// catalogue read by the table head, the body and the View menu, so they cannot
// drift. The Actions column is not here: it is always last and not configurable.

import { moveRelative, type DropPosition } from "./reorder.ts";

export type OfferColumnKey = "number" | "title" | "client" | "category" | "issued" | "validUntil" | "amount" | "status";

/** The columns in the order a list that has never been arranged shows them. */
export const OFFER_COLUMNS: readonly OfferColumnKey[] = ["number", "title", "client", "category", "issued", "validUntil", "amount", "status"];

/** Offered but off until someone asks: it widens the table. */
export const DEFAULT_HIDDEN_OFFER_COLUMNS: readonly OfferColumnKey[] = ["validUntil"];

/** The offer number identifies the row, so it cannot be hidden or moved. */
export const LOCKED_OFFER_COLUMN: OfferColumnKey = "number";

export const OFFER_COLUMN_LABELS: Record<OfferColumnKey, [string, string, string]> = {
  number: ["Offer no.", "Číslo ponuky", "Ajánlatszám"],
  title: ["Title & template", "Názov a šablóna", "Cím és sablon"],
  client: ["Client / lead", "Klient / Lead", "Ügyfél / Lead"],
  category: ["Category", "Kategória", "Kategória"],
  issued: ["Issued", "Vystavené", "Kiállítva"],
  validUntil: ["Valid until", "Platné do", "Érvényes eddig"],
  amount: ["Amount", "Suma", "Összeg"],
  status: ["Status", "Stav", "Állapot"],
};

export interface StoredOfferColumn {
  key: string;
  visible: boolean;
}

export interface ResolvedOfferColumn {
  key: OfferColumnKey;
  visible: boolean;
}

const isOfferColumnKey = (key: unknown): key is OfferColumnKey =>
  typeof key === "string" && (OFFER_COLUMNS as readonly string[]).includes(key);

/**
 * The saved arrangement reconciled with the columns that exist: unknown or
 * repeated keys are dropped, a column missing from the layout is appended with
 * its default visibility, and the locked column is forced first and visible.
 * Nothing saved (or junk) lands on exactly the default.
 */
export function resolveOfferColumns(saved: unknown): ResolvedOfferColumn[] {
  const out: ResolvedOfferColumn[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(saved) ? saved : []) {
    const key = (entry as StoredOfferColumn | null)?.key;
    if (!isOfferColumnKey(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible: (entry as StoredOfferColumn).visible !== false });
  }
  for (const key of OFFER_COLUMNS) {
    if (seen.has(key)) continue;
    out.push({ key, visible: !DEFAULT_HIDDEN_OFFER_COLUMNS.includes(key) });
  }
  const lockedAt = out.findIndex(c => c.key === LOCKED_OFFER_COLUMN);
  if (lockedAt > 0) out.unshift(...out.splice(lockedAt, 1));
  out[0].visible = true;
  return out;
}

export const visibleOfferColumns = (saved: unknown): ResolvedOfferColumn[] =>
  resolveOfferColumns(saved).filter(c => c.visible);

/**
 * What is worth storing: null when the arrangement is the default, so the
 * preferences only ever hold a layout somebody actually chose.
 */
export function toStoredOfferColumns(columns: readonly ResolvedOfferColumn[]): StoredOfferColumn[] | null {
  const stored = columns.map(({ key, visible }) => ({ key: key as string, visible }));
  const def = resolveOfferColumns(null);
  const isDefault = stored.length === def.length && stored.every((c, i) => c.key === def[i].key && c.visible === def[i].visible);
  return isDefault ? null : stored;
}

/** Moves one column before or after another; the locked column never moves and never loses first place. */
export function moveOfferColumn<T extends { key: string }>(
  columns: readonly T[],
  dragKey: string,
  targetKey: string,
  position: DropPosition,
): T[] {
  if (dragKey === LOCKED_OFFER_COLUMN) return columns.slice();
  const next = moveRelative(columns, c => c.key, dragKey, targetKey, position);
  if (next[0]?.key !== LOCKED_OFFER_COLUMN && columns[0]?.key === LOCKED_OFFER_COLUMN) return columns.slice();
  return next;
}
