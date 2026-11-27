import assert from "node:assert/strict";
import test from "node:test";
import type { OfferCategory } from "../types";
import { flattenOfferCategories } from "./offerCategories.ts";
import { isValidOfferCategoryFilter, matchesOfferCategoryFilter, offerCategoryPathLabel } from "./offerCategoryFilter.ts";

const cat = (id: string, name: string, parentId: string | null, sortOrder: number): OfferCategory => ({
  id, name, parentId, level: parentId ? 2 : 1, sortOrder, color: null,
});
const tree = [
  cat("b", "Beta", null, 2),
  cat("a", "Alpha", null, 1),
  cat("a2", "Alpha two", "a", 2),
  cat("a1", "Alpha one", "a", 1),
  cat("a1x", "Deep", "a1", 0),
];

test("the shared flatten gives the option order: sortOrder, children under parents, depth", () => {
  assert.deepEqual(
    flattenOfferCategories(tree).map(r => [r.category.id, r.depth]),
    [["a", 1], ["a1", 2], ["a1x", 3], ["a2", 2], ["b", 1]],
  );
});

test("matching: all, none, a parent and a leaf", () => {
  assert.equal(matchesOfferCategoryFilter(undefined, "all", tree), true);
  assert.equal(matchesOfferCategoryFilter(null, "none", tree), true);
  assert.equal(matchesOfferCategoryFilter("gone", "none", tree), true);
  assert.equal(matchesOfferCategoryFilter("a1x", "none", tree), false);
  assert.equal(matchesOfferCategoryFilter("a1x", "a", tree), true);
  assert.equal(matchesOfferCategoryFilter("a", "a", tree), true);
  assert.equal(matchesOfferCategoryFilter("b", "a", tree), false);
  assert.equal(matchesOfferCategoryFilter(null, "a", tree), false);
  assert.equal(matchesOfferCategoryFilter("a1", "a2", tree), false);
});

test("path label", () => {
  assert.equal(offerCategoryPathLabel(tree, "a1x"), "Alpha / Alpha one / Deep");
  assert.equal(offerCategoryPathLabel(tree, null), "");
});

test("a stored filter naming a deleted category is invalid", () => {
  assert.equal(isValidOfferCategoryFilter("a", tree), true);
  assert.equal(isValidOfferCategoryFilter("none", tree), true);
  assert.equal(isValidOfferCategoryFilter("zzz", tree), false);
});
