/*
  The product form's extra fields (VAT, price levels, package size, weight,
  alternative codes) as the text the inputs hold, and back to the item. Kept
  apart from the component so the parsing is tested: a blank field means "not
  set" (the company default VAT, no level price, no pack size), never zero.
*/
import type { WarehouseItem } from "../types";
import { normalizeAltCodes } from "./priceLevels.ts";

export interface ItemExtrasForm {
  /** "" = use the company default. */
  vatRate: string;
  /** Level id -> the price as typed. */
  priceLevels: Record<string, string>;
  packQuantity: string;
  packUnit: string;
  weightKg: string;
  /** Comma separated. */
  altCodes: string;
}

export const emptyExtrasForm = (): ItemExtrasForm => ({
  vatRate: "",
  priceLevels: {},
  packQuantity: "",
  packUnit: "",
  weightKg: "",
  altCodes: "",
});

const text = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? String(n) : "");

export const extrasFormFromItem = (item: Partial<WarehouseItem>): ItemExtrasForm => ({
  vatRate: text(item.vatRate),
  priceLevels: Object.fromEntries(Object.entries(item.priceLevels ?? {}).map(([id, price]) => [id, text(price)])),
  packQuantity: text(item.packQuantity),
  packUnit: item.packUnit ?? "",
  weightKg: text(item.weightKg),
  altCodes: (item.altCodes ?? []).join(", "),
});

/** A typed number ("1,44" or "1.44"); null for blank or not a number. */
export const parseTypedNumber = (raw: string): number | null => {
  const s = String(raw ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export type ItemExtras = Pick<WarehouseItem, "vatRate" | "priceLevels" | "packQuantity" | "packUnit" | "weightKg" | "altCodes">;

export const extrasFromForm = (form: ItemExtrasForm): ItemExtras => {
  const vat = parseTypedNumber(form.vatRate);
  const pack = parseTypedNumber(form.packQuantity);
  const weight = parseTypedNumber(form.weightKg);
  const priceLevels: Record<string, number> = {};
  for (const [id, raw] of Object.entries(form.priceLevels)) {
    const price = parseTypedNumber(raw);
    if (price !== null && price > 0) priceLevels[id] = price;
  }
  return {
    vatRate: vat !== null && vat >= 0 && vat <= 100 ? vat : null,
    priceLevels,
    packQuantity: pack !== null && pack > 0 ? pack : null,
    packUnit: form.packUnit.trim() || null,
    weightKg: weight !== null && weight >= 0 ? weight : null,
    altCodes: normalizeAltCodes(form.altCodes),
  };
};
