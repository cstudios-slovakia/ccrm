import assert from "node:assert/strict";
import test from "node:test";
import {
  highestListId,
  listIdFor,
  listIdsSignature,
  nextListId,
  normalizeListIds,
} from "./listIds.ts";

const CATS = ["Services", "Website", "Marketing"];

test("an unseeded list keeps the positional numbering it had", () => {
  // The contract with every form already deployed: the numbers Settings used to
  // render as `index + 1` are the ones that get frozen.
  assert.deepEqual(normalizeListIds(CATS, undefined), { Services: 1, Website: 2, Marketing: 3 });
  assert.deepEqual(normalizeListIds(CATS, null), { Services: 1, Website: 2, Marketing: 3 });
  assert.deepEqual(normalizeListIds(CATS, {}), { Services: 1, Website: 2, Marketing: 3 });
  assert.deepEqual(normalizeListIds(CATS, []), { Services: 1, Website: 2, Marketing: 3 });
  assert.deepEqual(normalizeListIds(CATS, "nonsense"), { Services: 1, Website: 2, Marketing: 3 });
});

test("reordering the list does not move a single id", () => {
  const ids = normalizeListIds(CATS, undefined);
  const reordered = ["Marketing", "Services", "Website"];
  assert.deepEqual(normalizeListIds(reordered, ids), { Services: 1, Website: 2, Marketing: 3 });
});

test("a new item takes the next id above the highest ever issued", () => {
  const ids = normalizeListIds([...CATS, "E-shop"], { Services: 1, Website: 2, Marketing: 3 });
  assert.equal(ids["E-shop"], 4);
  // Even inserted at the front, and even when its position is free.
  const inserted = normalizeListIds(["Branding", ...CATS], ids);
  assert.equal(inserted.Branding, 5);
});

test("a deleted item's id is retired, never handed to something else", () => {
  const ids = { Services: 1, Website: 2, Marketing: 3 };
  // "Website" removed from the list — its entry stays behind as a tombstone.
  const afterDelete = normalizeListIds(["Services", "Marketing"], ids);
  assert.deepEqual(afterDelete, { Services: 1, Website: 2, Marketing: 3 });
  // A new category cannot inherit 2.
  const afterAdd = normalizeListIds(["Services", "Marketing", "Support"], afterDelete);
  assert.equal(afterAdd.Support, 4);
});

test("re-adding a name under the same spelling gets its old id back", () => {
  const ids = normalizeListIds(["Services", "Website"], { Services: 1, Website: 2 });
  assert.deepEqual(normalizeListIds(["Services"], ids), { Services: 1, Website: 2 });
  assert.equal(normalizeListIds(["Services", "Website"], ids).Website, 2);
});

test("unusable stored ids are dropped and re-issued", () => {
  const ids = normalizeListIds(CATS, { Services: 0, Website: "x", Marketing: 7 });
  // Only Marketing survived, so the rest continue above it rather than
  // restarting at 1 and colliding with it.
  assert.equal(ids.Marketing, 7);
  assert.equal(ids.Services, 8);
  assert.equal(ids.Website, 9);
});

test("normalizing is idempotent", () => {
  const once = normalizeListIds(CATS, undefined);
  assert.deepEqual(normalizeListIds(CATS, once), once);
});

test("a duplicated name is one item with one id", () => {
  const ids = normalizeListIds(["Services", "Services"], { Website: 4 });
  assert.deepEqual(ids, { Website: 4, Services: 5 });
});

test("highestListId and nextListId read the whole map, tombstones included", () => {
  assert.equal(highestListId({}), 0);
  assert.equal(nextListId({}), 1);
  assert.equal(highestListId({ a: 1, gone: 9, b: 2 }), 9);
  assert.equal(nextListId({ a: 1, gone: 9, b: 2 }), 10);
});

test("listIdFor answers 0 for anything it cannot resolve", () => {
  assert.equal(listIdFor("Services", { Services: 3 }), 3);
  assert.equal(listIdFor("Missing", { Services: 3 }), 0);
  assert.equal(listIdFor("Services", {} as Record<string, number>), 0);
});

test("the signature is key-order independent", () => {
  const a = { Services: 1, Website: 2, Marketing: 3 };
  const b = { Marketing: 3, Services: 1, Website: 2 };
  assert.equal(JSON.stringify(listIdsSignature(a)), JSON.stringify(listIdsSignature(b)));
  assert.deepEqual(listIdsSignature(a), [["Services", 1], ["Website", 2], ["Marketing", 3]]);
});
