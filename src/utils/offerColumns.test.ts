import assert from "node:assert/strict";
import test from "node:test";
import { moveOfferColumn, resolveOfferColumns, toStoredOfferColumns, visibleOfferColumns } from "./offerColumns.ts";

const keys = (cols: { key: string }[]) => cols.map(c => c.key);

test("nothing saved gives the default: every column but Valid until", () => {
  for (const raw of [undefined, null, "x", 3, [], [null, 4]]) {
    const cols = resolveOfferColumns(raw);
    assert.deepEqual(keys(cols), ["number", "title", "client", "category", "issued", "validUntil", "amount", "status"]);
    assert.deepEqual(keys(cols.filter(c => !c.visible)), ["validUntil"]);
  }
});

test("a saved layout is kept; unknown and repeated keys are dropped; missing ones are appended", () => {
  const cols = resolveOfferColumns([
    { key: "amount", visible: true },
    { key: "bogus", visible: true },
    { key: "amount", visible: false },
    { key: "title", visible: false },
  ]);
  assert.deepEqual(keys(cols).slice(0, 3), ["number", "amount", "title"]);
  assert.equal(cols.find(c => c.key === "title")!.visible, false);
  assert.equal(cols.find(c => c.key === "amount")!.visible, true);
  assert.equal(cols.length, 8);
  assert.equal(cols.find(c => c.key === "category")!.visible, true);
  assert.equal(cols.find(c => c.key === "validUntil")!.visible, false);
});

test("the locked column is forced first and visible", () => {
  const cols = resolveOfferColumns([{ key: "status", visible: true }, { key: "number", visible: false }]);
  assert.equal(cols[0].key, "number");
  assert.equal(cols[0].visible, true);
});

test("visibleOfferColumns drops the hidden ones", () => {
  assert.equal(visibleOfferColumns(null).some(c => c.key === "validUntil"), false);
});

test("moving a column before or after another; the locked one is immovable", () => {
  const cols = resolveOfferColumns(null);
  assert.deepEqual(keys(moveOfferColumn(cols, "status", "title", "before")).slice(0, 3), ["number", "status", "title"]);
  assert.deepEqual(keys(moveOfferColumn(cols, "title", "status", "after")).slice(-2), ["status", "title"]);
  assert.deepEqual(keys(moveOfferColumn(cols, "number", "status", "after")), keys(cols));
  assert.deepEqual(keys(moveOfferColumn(cols, "status", "number", "before")), keys(cols));
  assert.deepEqual(keys(moveOfferColumn(cols, "nope", "status", "after")), keys(cols));
});

test("reset: the default layout stores as null, a changed one does not", () => {
  assert.equal(toStoredOfferColumns(resolveOfferColumns(null)), null);
  const changed = resolveOfferColumns(null).map(c => (c.key === "validUntil" ? { ...c, visible: true } : c));
  assert.deepEqual(toStoredOfferColumns(changed)?.find(c => c.key === "validUntil"), { key: "validUntil", visible: true });
});
