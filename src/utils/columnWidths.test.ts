import test from "node:test";
import assert from "node:assert/strict";
import {
  clampColumnWidth,
  withColumnWidth,
  withColumnWidths,
  withoutColumnWidth,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
} from "./columnWidths.ts";

test("clamps to the allowed range and rounds", () => {
  assert.equal(clampColumnWidth(10), MIN_COLUMN_WIDTH);
  assert.equal(clampColumnWidth(5000), MAX_COLUMN_WIDTH);
  assert.equal(clampColumnWidth(120.6), 121);
  assert.equal(clampColumnWidth(NaN), MIN_COLUMN_WIDTH);
});

test("withColumnWidth merges per list without mutating", () => {
  const a = { leads: { name: 100 } };
  const b = withColumnWidth(a, "leads", "email", 200);
  assert.deepEqual(b, { leads: { name: 100, email: 200 } });
  assert.deepEqual(a, { leads: { name: 100 } });
  assert.deepEqual(withColumnWidth(undefined, "x", "y", 1), { x: { y: MIN_COLUMN_WIDTH } });
});

test("withColumnWidths keeps existing entries unless overwrite", () => {
  const a = { l: { a: 100 } };
  assert.deepEqual(withColumnWidths(a, "l", { a: 300, b: 150 }), { l: { a: 100, b: 150 } });
  assert.deepEqual(withColumnWidths(a, "l", { a: 300 }, true), { l: { a: 300 } });
});

test("withoutColumnWidth removes a column or a list, dropping empties", () => {
  const a = { l: { a: 100, b: 200 }, m: { c: 90 } };
  assert.deepEqual(withoutColumnWidth(a, "l", "a"), { l: { b: 200 }, m: { c: 90 } });
  assert.deepEqual(withoutColumnWidth(withoutColumnWidth(a, "l", "a"), "l", "b"), { m: { c: 90 } });
  assert.deepEqual(withoutColumnWidth(a, "m"), { l: { a: 100, b: 200 } });
});
