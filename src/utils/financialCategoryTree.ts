import type { FinancialCategory, FinancialType } from "../types";

// The finance category tree is stored flat: every row names its parent, its
// depth and its position among its siblings. Drag & drop in the categories tab
// rewrites those three fields together, so they are kept consistent here rather
// than in the view.

export const MAX_CATEGORY_DEPTH = 3;

/** Where a dragged category lands relative to the row it is dropped on. */
export type CategoryDropPosition = "before" | "after" | "inside";

/** `targetId: null` is the "end of the main categories" zone. */
export interface CategoryDropTarget {
  targetId: string | null;
  position: CategoryDropPosition;
}

type Level = FinancialCategory["level"];

export const iconForCategoryLevel = (level: number): string =>
  level === 1 ? "Layers" : level === 2 ? "Folder" : "Tag";

const indexById = (cats: FinancialCategory[]) => new Map(cats.map((c) => [c.id, c]));

/** A parent that no longer exists is treated as no parent, so the row stays visible at the root. */
export const effectiveParentId = (cat: FinancialCategory, byId: Map<string, FinancialCategory>): string | null =>
  cat.parentId && byId.has(cat.parentId) ? cat.parentId : null;

/**
 * The children of `parentId` (null = main categories) in display order.
 * Rows that were never ordered all carry 0, so the sort is stable and they keep
 * the order the server sent them in.
 */
export function categoryChildren(
  cats: FinancialCategory[],
  type: FinancialType,
  parentId: string | null
): FinancialCategory[] {
  const byId = indexById(cats);
  return cats
    .filter((c) => c.type === type && effectiveParentId(c, byId) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** The position a newly created category should take: after its last sibling. */
export function nextCategorySortOrder(
  cats: FinancialCategory[],
  type: FinancialType,
  parentId: string | null
): number {
  const siblings = categoryChildren(cats, type, parentId);
  return siblings.length ? Math.max(...siblings.map((c) => c.sortOrder ?? 0)) + 1 : 0;
}

/** Every id below `id`, not including `id` itself. */
export function categoryDescendantIds(cats: FinancialCategory[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (parentId: string) => {
    cats.forEach((c) => {
      if (c.parentId === parentId && !out.has(c.id) && c.id !== id) {
        out.add(c.id);
        walk(c.id);
      }
    });
  };
  walk(id);
  return out;
}

/** How many levels a subtree spans: 1 for a leaf, 3 for a category with grandchildren. */
export function categorySubtreeDepth(cats: FinancialCategory[], id: string): number {
  const children = cats.filter((c) => c.parentId === id && c.id !== id);
  return 1 + children.reduce((max, child) => Math.max(max, categorySubtreeDepth(cats, child.id)), 0);
}

interface ResolvedDrop {
  parentId: string | null;
  level: number;
}

/**
 * Where a drop would put the dragged category, or null when it is not allowed:
 * onto itself or its own subtree, across income/expense, or so deep that some
 * part of the moved subtree would end up below level 3.
 */
export function resolveCategoryDrop(
  cats: FinancialCategory[],
  dragId: string,
  drop: CategoryDropTarget
): ResolvedDrop | null {
  const byId = indexById(cats);
  const drag = byId.get(dragId);
  if (!drag) return null;

  let resolved: ResolvedDrop;
  if (drop.targetId === null) {
    resolved = { parentId: null, level: 1 };
  } else {
    const target = byId.get(drop.targetId);
    if (!target || target.id === dragId || target.type !== drag.type) return null;
    if (categoryDescendantIds(cats, dragId).has(target.id)) return null;
    resolved =
      drop.position === "inside"
        ? { parentId: target.id, level: target.level + 1 }
        : { parentId: effectiveParentId(target, byId), level: target.level };
  }

  if (resolved.level + categorySubtreeDepth(cats, dragId) - 1 > MAX_CATEGORY_DEPTH) return null;
  return resolved;
}

/**
 * Moves a category (with its whole subtree) to the drop target.
 *
 * Returns null when the drop is not allowed, the same array when nothing would
 * change, and otherwise a new array in which only the rows that actually changed
 * are new objects: the moved category (parent, level, position), its descendants
 * (level), and the siblings it left and joined (position).
 */
export function moveCategory(
  cats: FinancialCategory[],
  dragId: string,
  drop: CategoryDropTarget
): FinancialCategory[] | null {
  const resolved = resolveCategoryDrop(cats, dragId, drop);
  if (!resolved) return null;

  const byId = indexById(cats);
  const drag = byId.get(dragId)!;
  const oldParentId = effectiveParentId(drag, byId);

  const destinationBefore = categoryChildren(cats, drag.type, resolved.parentId);
  const destination = destinationBefore.filter((c) => c.id !== dragId);
  let insertAt = destination.length;
  if (drop.targetId !== null && drop.position !== "inside") {
    const targetIndex = destination.findIndex((c) => c.id === drop.targetId);
    insertAt = drop.position === "before" ? targetIndex : targetIndex + 1;
  }
  destination.splice(insertAt, 0, drag);

  const sameParent = oldParentId === resolved.parentId;
  if (sameParent && destination.every((c, i) => c.id === destinationBefore[i]?.id)) {
    return cats;
  }

  const patches = new Map<string, Partial<FinancialCategory>>();
  const patch = (id: string, fields: Partial<FinancialCategory>) =>
    patches.set(id, { ...patches.get(id), ...fields });

  destination.forEach((c, i) => patch(c.id, { sortOrder: i }));
  if (!sameParent) {
    categoryChildren(cats, drag.type, oldParentId)
      .filter((c) => c.id !== dragId)
      .forEach((c, i) => patch(c.id, { sortOrder: i }));
  }

  const levelDelta = resolved.level - drag.level;
  patch(dragId, {
    parentId: resolved.parentId,
    level: resolved.level as Level,
    icon: levelDelta ? iconForCategoryLevel(resolved.level) : drag.icon,
  });
  if (levelDelta) {
    categoryDescendantIds(cats, dragId).forEach((id) => {
      const level = byId.get(id)!.level + levelDelta;
      patch(id, { level: level as Level, icon: iconForCategoryLevel(level) });
    });
  }

  return cats.map((c) => {
    const fields = patches.get(c.id);
    if (!fields) return c;
    const changed = (Object.keys(fields) as (keyof FinancialCategory)[]).some(
      (key) => (c[key] ?? null) !== (fields[key] ?? null)
    );
    return changed ? { ...c, ...fields } : c;
  });
}
