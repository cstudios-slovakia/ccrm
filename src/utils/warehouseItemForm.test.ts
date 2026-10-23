import assert from "node:assert/strict";
import test from "node:test";
import { emptyExtrasForm, extrasFormFromItem, extrasFromForm, parseTypedNumber } from "./warehouseItemForm.ts";

test("an item that predates the new fields gives an empty form, and an empty form gives 'nothing set'", () => {
  assert.deepEqual(extrasFormFromItem({}), emptyExtrasForm());
  assert.deepEqual(extrasFromForm(emptyExtrasForm()), {
    vatRate: null, priceLevels: {}, packQuantity: null, packUnit: null, weightKg: null, altCodes: [],
  });
});

test("every field survives item -> form -> item", () => {
  const item = { vatRate: 10, priceLevels: { a: 80, b: 95.5 }, packQuantity: 1.44, packUnit: "bal", weightKg: 12.5, altCodes: ["X1", "Y2"] };
  assert.deepEqual(extrasFromForm(extrasFormFromItem(item)), item);
});

test("0 % is a real VAT rate, a blank one is 'company default'", () => {
  assert.equal(extrasFromForm({ ...emptyExtrasForm(), vatRate: "0" }).vatRate, 0);
  assert.equal(extrasFromForm({ ...emptyExtrasForm(), vatRate: "" }).vatRate, null);
  assert.equal(extrasFromForm({ ...emptyExtrasForm(), vatRate: "250" }).vatRate, null);
});

test("a blank or zero level price is dropped, so the default applies", () => {
  const out = extrasFromForm({ ...emptyExtrasForm(), priceLevels: { a: "", b: "0", c: "12,5", d: "abc" } });
  assert.deepEqual(out.priceLevels, { c: 12.5 });
});

test("numbers are read with a comma or a point; junk is null", () => {
  assert.equal(parseTypedNumber("1,44"), 1.44);
  assert.equal(parseTypedNumber(" 1 200.5 "), 1200.5);
  assert.equal(parseTypedNumber(""), null);
  assert.equal(parseTypedNumber("x"), null);
});

test("alternative codes are split on commas and deduplicated; a zero pack size means none", () => {
  const out = extrasFromForm({ ...emptyExtrasForm(), altCodes: "A1, a1 ,B2,,", packQuantity: "0" });
  assert.deepEqual(out.altCodes, ["A1", "B2"]);
  assert.equal(out.packQuantity, null);
});
