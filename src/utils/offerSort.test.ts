import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_OFFER_SORT, normalizeOfferSort, sortOffers, type OfferSortValues } from "./offerSort.ts";

interface Row { id: string; v: Partial<OfferSortValues> }
const values = (r: Row): OfferSortValues => ({
  number: "", client: "", amount: null, statusRank: 0, category: "", validUntil: null, ...r.v,
});
const rows: Row[] = [
  { id: "1", v: { number: "CP-2026-010", client: "bravo", amount: 50, statusRank: 2, category: "B", validUntil: "2026-03-01" } },
  { id: "2", v: { number: "CP-2026-002", client: "Alpha", amount: 900, statusRank: 0, category: "A" } },
  { id: "3", v: { number: "CP-2026-003", client: "charlie", amount: null, statusRank: 1, category: "", validUntil: "2026-01-01" } },
];
const ids = (r: Row[]) => r.map(x => x.id).join("");

test("default keeps the incoming order and returns a copy", () => {
  const out = sortOffers(rows, DEFAULT_OFFER_SORT, values);
  assert.equal(ids(out), "123");
  assert.notEqual(out, rows);
});

test("offer numbers sort naturally", () => {
  assert.equal(ids(sortOffers(rows, { key: "number", direction: "asc" }, values)), "231");
  assert.equal(ids(sortOffers(rows, { key: "number", direction: "desc" }, values)), "132");
});

test("client sorts case-insensitively", () => {
  assert.equal(ids(sortOffers(rows, { key: "client", direction: "asc" }, values)), "213");
});

test("amount sorts numerically and an empty amount is last in both directions", () => {
  assert.equal(ids(sortOffers(rows, { key: "amount", direction: "asc" }, values)), "123");
  assert.equal(ids(sortOffers(rows, { key: "amount", direction: "desc" }, values)), "213");
});

test("status sorts by rank, category by path text, valid until by date; empty is always last", () => {
  assert.equal(ids(sortOffers(rows, { key: "status", direction: "asc" }, values)), "231");
  assert.equal(ids(sortOffers(rows, { key: "category", direction: "asc" }, values)), "213");
  assert.equal(ids(sortOffers(rows, { key: "category", direction: "desc" }, values)), "123");
  assert.equal(ids(sortOffers(rows, { key: "validUntil", direction: "asc" }, values)), "312");
  assert.equal(ids(sortOffers(rows, { key: "validUntil", direction: "desc" }, values)), "132");
});

test("normalizeOfferSort falls back to the default on junk", () => {
  assert.deepEqual(normalizeOfferSort(null), DEFAULT_OFFER_SORT);
  assert.deepEqual(normalizeOfferSort({ key: "bogus", direction: "desc" }), { key: "default", direction: "desc" });
  assert.deepEqual(normalizeOfferSort({ key: "amount", direction: "desc" }), { key: "amount", direction: "desc" });
});
