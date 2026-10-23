import assert from "node:assert/strict";
import test from "node:test";
import {
  appliedPriceLevel,
  clientPriceLevelId,
  levelPriceOf,
  matchesItemQuery,
  normalizeAltCodes,
  normalizePriceLevels,
  packHint,
  priceLevelIdFor,
  resolveItemVatRate,
  resolveSellPrice,
  suggestedPacks,
} from "./priceLevels.ts";

const levels = [
  { id: "pl-retail", name: "Maloobchod" },
  { id: "pl-wholesale", name: "Veľkoobchod" },
];
const item = { defaultSellPrice: 100, priceLevels: { "pl-retail": 100, "pl-wholesale": 80, "pl-gone": 50, "pl-zero": 0 } };

test("a client's level price wins over the default sell price", () => {
  assert.equal(resolveSellPrice(item, "pl-wholesale", levels), 80);
});

test("no level, or no client, uses the default sell price", () => {
  assert.equal(resolveSellPrice(item, null, levels), 100);
  assert.equal(resolveSellPrice(item, undefined, levels), 100);
  assert.equal(resolveSellPrice(item, "", levels), 100);
});

test("an item with no price on the level falls back to the default", () => {
  assert.equal(resolveSellPrice({ defaultSellPrice: 70, priceLevels: {} }, "pl-wholesale", levels), 70);
  assert.equal(resolveSellPrice({ defaultSellPrice: 70 }, "pl-wholesale", levels), 70);
});

test("a zero or negative level price means 'not set', not 'free'", () => {
  assert.equal(levelPriceOf({ defaultSellPrice: 5, priceLevels: { a: 0 } }, "a"), null);
  assert.equal(levelPriceOf({ defaultSellPrice: 5, priceLevels: { a: -3 } }, "a"), null);
  assert.equal(resolveSellPrice({ defaultSellPrice: 5, priceLevels: { "pl-retail": 0 } }, "pl-retail", levels), 5);
});

test("a level that was deleted from settings is ignored even if the item still carries a price for it", () => {
  assert.equal(resolveSellPrice(item, "pl-gone", levels), 100);
});

test("a hint says which level a price came from, and nothing when the default applied", () => {
  assert.equal(appliedPriceLevel(item, "pl-wholesale", levels)?.name, "Veľkoobchod");
  assert.equal(appliedPriceLevel({ defaultSellPrice: 1, priceLevels: {} }, "pl-wholesale", levels), null);
  assert.equal(appliedPriceLevel(item, null, levels), null);
});

test("an item's own VAT rate is prefilled, a missing one falls back to the configured default", () => {
  const settings = { defaultVatRate: 23, vatRates: [23, 10, 0] };
  assert.equal(resolveItemVatRate({ vatRate: 10 }, settings), 10);
  assert.equal(resolveItemVatRate({ vatRate: 0 }, settings), 0, "0 % is a real rate");
  assert.equal(resolveItemVatRate({ vatRate: null }, settings), 23);
  assert.equal(resolveItemVatRate({}, settings), 23);
  assert.equal(resolveItemVatRate({}, { defaultVatRate: 19, vatRates: [19, 0] }), 19, "read from settings, not from a literal");
  assert.equal(resolveItemVatRate({ vatRate: 250 }, settings), 23, "an impossible rate is ignored");
});

test("the pack hint reads '1 pack = 1.44 m²' and is absent without a pack size", () => {
  assert.equal(packHint({ packQuantity: 1.44, packUnit: "bal", unit: "m²" }, "pack"), "1 bal = 1.44 m²");
  assert.equal(packHint({ packQuantity: 6, packUnit: null, unit: "ks" }, "pack"), "1 pack = 6 ks");
  assert.equal(packHint({ packQuantity: null, unit: "ks" }, "pack"), null);
  assert.equal(packHint({ packQuantity: 0, unit: "ks" }, "pack"), null);
});

test("whole packs are suggested only when the quantity is not already whole packs", () => {
  assert.equal(suggestedPacks(3, 1.44), 3);
  assert.equal(suggestedPacks(2.88, 1.44), null);
  assert.equal(suggestedPacks(10, 6), 2);
  assert.equal(suggestedPacks(12, 6), null);
  assert.equal(suggestedPacks(5, null), null);
});

test("price levels are cleaned: junk dropped, names trimmed, duplicates removed", () => {
  assert.deepEqual(normalizePriceLevels(undefined), []);
  assert.deepEqual(normalizePriceLevels("x"), []);
  assert.deepEqual(
    normalizePriceLevels([
      { id: "a", name: "  Retail " },
      { id: "a", name: "Other" },
      { id: "b", name: "retail" },
      { id: "", name: "x" },
      { id: "c", name: "" },
      null,
      { id: "d", name: "Partner" },
    ]),
    [{ id: "a", name: "Retail" }, { id: "d", name: "Partner" }],
  );
});

test("level ids are ASCII, prefixed and unique", () => {
  assert.equal(priceLevelIdFor("Veľkoobchod", []), "pl-velkoobchod");
  assert.equal(priceLevelIdFor("Partner", ["pl-partner"]), "pl-partner-2");
  assert.equal(priceLevelIdFor("???", []), "pl-level");
});

test("alternative codes are trimmed, unique and accept a comma separated string", () => {
  assert.deepEqual(normalizeAltCodes([" A1 ", "a1", "", "B2", 5]), ["A1", "B2", "5"]);
  assert.deepEqual(normalizeAltCodes("X1, X2;x1\nX3"), ["X1", "X2", "X3"]);
  assert.deepEqual(normalizeAltCodes(null), []);
});

test("an item is found by name, SKU, barcode, an alternative code or its external id", () => {
  const it = { name: "Tehla Bramac", sku: "39", barcode: "8590001", altCodes: ["BR-100", "SUP/77"], externalId: "MRP-39" };
  for (const q of ["bramac", "39", "8590001", "br-100", "sup/77", "mrp-39", "  BRAMAC "]) assert.equal(matchesItemQuery(it, q), true, q);
  assert.equal(matchesItemQuery(it, "xyz"), false);
  assert.equal(matchesItemQuery(it, ""), true);
  assert.equal(matchesItemQuery({ name: "A", sku: "B" }, "b"), true, "an item without the new fields still matches");
});

test("a customer's price level is their own, else their client record's", () => {
  const rows = [{ id: "client-1", priceLevelId: "pl-a" }, { id: "client-2", priceLevelId: null }];
  assert.equal(clientPriceLevelId({ priceLevelId: "pl-b", clientId: "client-1" }, rows), "pl-b");
  assert.equal(clientPriceLevelId({ priceLevelId: null, clientId: "client-1" }, rows), "pl-a");
  assert.equal(clientPriceLevelId({ clientId: "client-2" }, rows), null);
  assert.equal(clientPriceLevelId({ clientId: "gone" }, rows), null);
  assert.equal(clientPriceLevelId(null, rows), null);
});
