import assert from "node:assert/strict";
import test from "node:test";
import type { ClientCategory } from "../types";
import {
  clientCategoryChildren,
  clientCategoryColor,
  clientCategoryFilterIds,
  clientCategoryPath,
  flattenClientCategories,
  moveClientCategory,
  nextClientCategorySortOrder,
  resolveClientCategoryDrop,
} from "./clientCategoryTree.ts";

const cat = (id: string, level: 1 | 2 | 3, parentId: string | null, sortOrder: number, color: string | null = null): ClientCategory => ({
  id,
  name: id,
  level,
  parentId,
  sortOrder,
  color,
});

// retail ─┬─ kitchens ── bratislava
//         └─ bathrooms
// wholesale
const tree = (): ClientCategory[] => [
  cat("wholesale", 1, null, 1, "#0000ff"),
  cat("retail", 1, null, 0, "#ff0000"),
  cat("bathrooms", 2, "retail", 1),
  cat("kitchens", 2, "retail", 0),
  cat("bratislava", 3, "kitchens", 0),
];

const ids = (cats: ClientCategory[]) => cats.map((c) => c.id);

test("children come back in sort order", () => {
  assert.deepEqual(ids(clientCategoryChildren(tree(), null)), ["retail", "wholesale"]);
  assert.deepEqual(ids(clientCategoryChildren(tree(), "retail")), ["kitchens", "bathrooms"]);
});

test("a row whose parent is gone shows up among the main categories", () => {
  const cats = [...tree(), cat("orphan", 2, "deleted", 5)];
  assert.deepEqual(ids(clientCategoryChildren(cats, null)), ["retail", "wholesale", "orphan"]);
});

test("a new category goes after its last sibling", () => {
  assert.equal(nextClientCategorySortOrder(tree(), null), 2);
  assert.equal(nextClientCategorySortOrder(tree(), "bathrooms"), 0);
});

test("the flattened tree is depth-first in display order", () => {
  assert.deepEqual(
    flattenClientCategories(tree()).map((r) => `${r.category.id}:${r.depth}`),
    ["retail:1", "kitchens:2", "bratislava:3", "bathrooms:2", "wholesale:1"]
  );
});

test("path runs from the root to the category, and colour is inherited", () => {
  assert.deepEqual(ids(clientCategoryPath(tree(), "bratislava")), ["retail", "kitchens", "bratislava"]);
  assert.deepEqual(clientCategoryPath(tree(), "missing"), []);
  assert.equal(clientCategoryColor(tree(), "bratislava"), "#ff0000");
  assert.equal(clientCategoryColor(tree(), null), null);
});

test("path survives a parent cycle in bad data", () => {
  const cats = [cat("a", 1, "b", 0), cat("b", 2, "a", 0)];
  assert.deepEqual(ids(clientCategoryPath(cats, "a")), ["b", "a"]);
});

test("filtering by a category also matches its whole subtree", () => {
  assert.deepEqual([...clientCategoryFilterIds(tree(), "retail")].sort(), ["bathrooms", "bratislava", "kitchens", "retail"]);
  assert.deepEqual([...clientCategoryFilterIds(tree(), "wholesale")], ["wholesale"]);
});

test("a drop onto its own subtree or below level 3 is refused", () => {
  assert.equal(resolveClientCategoryDrop(tree(), "retail", { targetId: "kitchens", position: "inside" }), null);
  // kitchens carries a child, so under bathrooms (L2) it would push bratislava to level 4.
  assert.equal(resolveClientCategoryDrop(tree(), "kitchens", { targetId: "bathrooms", position: "inside" }), null);
  assert.deepEqual(resolveClientCategoryDrop(tree(), "bathrooms", { targetId: "wholesale", position: "inside" }), {
    parentId: "wholesale",
    level: 2,
  });
});

test("reordering among siblings rewrites positions only", () => {
  const cats = tree();
  const next = moveClientCategory(cats, "wholesale", { targetId: "retail", position: "before" })!;
  assert.deepEqual(ids(clientCategoryChildren(next, null)), ["wholesale", "retail"]);
  // Rows the move did not touch keep their identity, so the sync diff skips them.
  assert.equal(next.find((c) => c.id === "bathrooms"), cats.find((c) => c.id === "bathrooms"));
});

test("a move that changes nothing returns the same array", () => {
  const cats = tree();
  assert.equal(moveClientCategory(cats, "retail", { targetId: "wholesale", position: "before" }), cats);
});

test("moving a subtree to the root lifts every level with it", () => {
  const next = moveClientCategory(tree(), "kitchens", { targetId: null, position: "after" })!;
  const byId = new Map(next.map((c) => [c.id, c]));
  assert.equal(byId.get("kitchens")!.parentId, null);
  assert.equal(byId.get("kitchens")!.level, 1);
  assert.equal(byId.get("bratislava")!.level, 2);
  assert.deepEqual(ids(clientCategoryChildren(next, null)), ["retail", "wholesale", "kitchens"]);
  // The sibling it left closes the gap.
  assert.equal(byId.get("bathrooms")!.sortOrder, 0);
});
