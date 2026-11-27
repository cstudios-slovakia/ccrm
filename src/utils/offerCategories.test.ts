import assert from "node:assert/strict";
import test from "node:test";
import { offerCountsByCategory, refileOffers, unfileOffers } from "./offerCategories.ts";
import { flattenOfferCategories, offerCategoryFilterIds } from "./offerCategories.ts";
import type { OfferCategory } from "../types";

const offer = (id: string, categoryId: string | null | undefined, updatedAt?: string) => ({ id, categoryId, updatedAt });

test("offerCountsByCategory counts offers directly under each category and ignores unfiled ones", () => {
  const counts = offerCountsByCategory([offer("a", "x"), offer("b", "x"), offer("c", "y"), offer("d", null), offer("e", undefined)]);
  assert.deepEqual(counts, { x: 2, y: 1 });
});

test("unfileOffers clears the category of offers under the deleted ids and stamps them", () => {
  const offers = [offer("a", "x", "2026-01-01"), offer("b", "y", "2026-01-02"), offer("c", null)];
  const { offers: next, filed } = unfileOffers(offers, new Set(["x"]), "2026-11-06T10:00:00Z");
  assert.equal(next[0].categoryId, null);
  assert.equal(next[0].updatedAt, "2026-11-06T10:00:00Z");
  assert.equal(next[1], offers[1]);
  assert.equal(next[2], offers[2]);
  assert.deepEqual([...filed.entries()], [["a", { categoryId: "x", updatedAt: "2026-01-01" }]]);
});

test("unfileOffers returns the same array when no offer is filed there", () => {
  const offers = [offer("a", "y"), offer("b", null)];
  const { offers: next, filed } = unfileOffers(offers, new Set(["x"]), "now");
  assert.equal(next, offers);
  assert.equal(filed.size, 0);
});

test("refileOffers files offers back with their old stamp, but leaves one that was filed again meanwhile", () => {
  const offers = [offer("a", "x"), offer("b", "x")];
  const { offers: unfiled, filed } = unfileOffers(offers, new Set(["x"]), "now");
  const edited = unfiled.map((o) => (o.id === "b" ? { ...o, categoryId: "z" } : o));
  const back = refileOffers(edited, filed);
  assert.equal(back[0].categoryId, "x");
  assert.equal("updatedAt" in back[0], false);
  assert.equal(back[1].categoryId, "z");
});

test("the offer category tree re-uses the shared tree helpers", () => {
  const cats: OfferCategory[] = [
    { id: "r", name: "Roofs", level: 1, parentId: null, sortOrder: 0 },
    { id: "r2", name: "Flat", level: 2, parentId: "r", sortOrder: 0 },
    { id: "f", name: "Facades", level: 1, parentId: null, sortOrder: 1 },
  ];
  assert.deepEqual(flattenOfferCategories(cats).map((x) => [x.category.id, x.depth]), [["r", 1], ["r2", 2], ["f", 1]]);
  assert.deepEqual([...offerCategoryFilterIds(cats, "r")].sort(), ["r", "r2"]);
});
