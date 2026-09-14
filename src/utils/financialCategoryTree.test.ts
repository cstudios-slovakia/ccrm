import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialCategory } from "../types";
import {
  categoryChildren,
  categorySubtreeDepth,
  moveCategory,
  nextCategorySortOrder,
  resolveCategoryDrop,
} from "./financialCategoryTree.ts";

const cat = (id: string, parentId: string | null, level: 1 | 2 | 3, sortOrder = 0, type: "income" | "expense" = "expense"): FinancialCategory =>
  ({ id, type, name: id, parentId, level, sortOrder, icon: level === 1 ? "Layers" : level === 2 ? "Folder" : "Tag" });

// A (L1) ─ A1 (L2) ─ A1x (L3)
//        └ A2 (L2)
// B (L1)
// C (L1)
const TREE = (): FinancialCategory[] => [
  cat("A", null, 1, 0),
  cat("B", null, 1, 1),
  cat("C", null, 1, 2),
  cat("A1", "A", 2, 0),
  cat("A2", "A", 2, 1),
  cat("A1x", "A1", 3, 0),
];

const byId = (cats: FinancialCategory[], id: string) => cats.find((c) => c.id === id)!;
const order = (cats: FinancialCategory[], parentId: string | null) =>
  categoryChildren(cats, "expense", parentId).map((c) => c.id);

test("children come back in sortOrder, and unordered rows keep their array order", () => {
  assert.deepEqual(order(TREE(), null), ["A", "B", "C"]);
  const legacy = [cat("Z", null, 1), cat("Y", null, 1), cat("X", null, 1)];
  assert.deepEqual(order(legacy, null), ["Z", "Y", "X"]);
});

test("a row whose parent is gone is listed with the main categories", () => {
  assert.deepEqual(order([cat("orphan", "deleted", 2)], null), ["orphan"]);
});

test("reordering within the same parent only renumbers positions", () => {
  const next = moveCategory(TREE(), "C", { targetId: "A", position: "before" })!;
  assert.deepEqual(order(next, null), ["C", "A", "B"]);
  assert.equal(byId(next, "C").level, 1);
  assert.equal(byId(next, "C").parentId, null);
});

test("dropping inside a category makes it the last child one level down", () => {
  const next = moveCategory(TREE(), "B", { targetId: "A", position: "inside" })!;
  assert.deepEqual(order(next, "A"), ["A1", "A2", "B"]);
  assert.equal(byId(next, "B").level, 2);
  assert.equal(byId(next, "B").icon, "Folder");
  assert.deepEqual(order(next, null), ["A", "C"]);
});

test("promoting a category carries its whole subtree up a level", () => {
  const next = moveCategory(TREE(), "A1", { targetId: "B", position: "after" })!;
  assert.deepEqual(order(next, null), ["A", "B", "A1", "C"]);
  assert.equal(byId(next, "A1").level, 1);
  assert.equal(byId(next, "A1").parentId, null);
  assert.equal(byId(next, "A1x").level, 2);
  assert.equal(byId(next, "A1x").parentId, "A1");
  assert.equal(byId(next, "A1x").icon, "Folder");
  // The sibling it left closes the gap.
  assert.equal(byId(next, "A2").sortOrder, 0);
});

test("demoting a category to a sibling position deeper in the tree", () => {
  const next = moveCategory(TREE(), "C", { targetId: "A1x", position: "before" })!;
  assert.deepEqual(order(next, "A1"), ["C", "A1x"]);
  assert.equal(byId(next, "C").level, 3);
  assert.equal(byId(next, "C").icon, "Tag");
});

test("the end-of-list zone makes a category the last main category", () => {
  const next = moveCategory(TREE(), "A2", { targetId: null, position: "after" })!;
  assert.deepEqual(order(next, null), ["A", "B", "C", "A2"]);
  assert.equal(byId(next, "A2").level, 1);
});

test("a move that would push part of a subtree below level 3 is refused", () => {
  // A has grandchildren, so it can only ever be a main category.
  assert.equal(categorySubtreeDepth(TREE(), "A"), 3);
  assert.equal(moveCategory(TREE(), "A", { targetId: "B", position: "inside" }), null);
  // A1 has a child, so it cannot go under a level-2 category.
  assert.equal(moveCategory(TREE(), "A1", { targetId: "A2", position: "inside" }), null);
  // Nothing can go inside a level-3 category.
  assert.equal(moveCategory(TREE(), "B", { targetId: "A1x", position: "inside" }), null);
  // But a leaf may still become a level-3 sibling.
  assert.ok(moveCategory(TREE(), "A2", { targetId: "A1x", position: "after" }));
});

test("a category cannot be dropped onto itself or into its own subtree", () => {
  assert.equal(resolveCategoryDrop(TREE(), "A", { targetId: "A", position: "inside" }), null);
  assert.equal(resolveCategoryDrop(TREE(), "A", { targetId: "A1x", position: "before" }), null);
});

test("income and expense trees never mix", () => {
  const cats = [...TREE(), cat("I", null, 1, 0, "income")];
  assert.equal(moveCategory(cats, "B", { targetId: "I", position: "inside" }), null);
});

test("a drop that changes nothing returns the same array", () => {
  const cats = TREE();
  assert.equal(moveCategory(cats, "B", { targetId: "A", position: "after" }), cats);
  assert.equal(moveCategory(cats, "A2", { targetId: "A", position: "inside" }), cats);
});

test("rows the move did not touch keep their identity, so the delta sync sends only real changes", () => {
  const cats = TREE();
  const next = moveCategory(cats, "C", { targetId: "B", position: "before" })!;
  assert.equal(byId(next, "A"), byId(cats, "A"));
  assert.equal(byId(next, "A1x"), byId(cats, "A1x"));
  assert.notEqual(byId(next, "C"), byId(cats, "C"));
});

test("a new category is placed after its last sibling", () => {
  assert.equal(nextCategorySortOrder(TREE(), "expense", null), 3);
  assert.equal(nextCategorySortOrder(TREE(), "expense", "A2"), 0);
  assert.equal(nextCategorySortOrder(TREE(), "income", null), 0);
});
