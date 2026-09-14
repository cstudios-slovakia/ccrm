import type { ClientCategory } from "../types";

// Customer categories are the same shape as the finance category tree — up to
// three levels, a colour, and a hand-set position among siblings — minus the
// income/expense split. Stored flat: every row names its parent, its depth and
// its position, and drag & drop rewrites those three together, so they are
// kept consistent here rather than in the view.

export const MAX_CLIENT_CATEGORY_DEPTH = 3;

/** Where a dragged category lands relative to the row it is dropped on. */
export type ClientCategoryDropPosition = "before" | "after" | "inside";

/** `targetId: null` is the "end of the main categories" zone. */
export interface ClientCategoryDropTarget {
  targetId: string | null;
  position: ClientCategoryDropPosition;
}

type Level = ClientCategory["level"];

export const iconForClientCategoryLevel = (level: number): string =>
  level === 1 ? "Layers" : level === 2 ? "Folder" : "Tag";

const indexById = (cats: ClientCategory[]) => new Map(cats.map((c) => [c.id, c]));

/** A parent that no longer exists is treated as no parent, so the row stays visible at the root. */
const effectiveParentId = (cat: ClientCategory, byId: Map<string, ClientCategory>): string | null =>
  cat.parentId && byId.has(cat.parentId) ? cat.parentId : null;

/**
 * The children of `parentId` (null = main categories) in display order.
 * Rows that were never ordered all carry 0, so the sort is stable and they keep
 * the order the server sent them in.
 */
export function clientCategoryChildren(cats: ClientCategory[], parentId: string | null): ClientCategory[] {
  const byId = indexById(cats);
  return cats
    .filter((c) => effectiveParentId(c, byId) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** The position a newly created category should take: after its last sibling. */
export function nextClientCategorySortOrder(cats: ClientCategory[], parentId: string | null): number {
  const siblings = clientCategoryChildren(cats, parentId);
  return siblings.length ? Math.max(...siblings.map((c) => c.sortOrder ?? 0)) + 1 : 0;
}

/** Every id below `id`, not including `id` itself. */
export function clientCategoryDescendantIds(cats: ClientCategory[], id: string): Set<string> {
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
export function clientCategorySubtreeDepth(cats: ClientCategory[], id: string): number {
  const children = cats.filter((c) => c.parentId === id && c.id !== id);
  return 1 + children.reduce((max, child) => Math.max(max, clientCategorySubtreeDepth(cats, child.id)), 0);
}

/** Root first, the category itself last. Empty for an unknown id. */
export function clientCategoryPath(cats: ClientCategory[], id: string | null | undefined): ClientCategory[] {
  if (!id) return [];
  const byId = indexById(cats);
  const path: ClientCategory[] = [];
  let current = byId.get(id);
  while (current && !path.includes(current)) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** The colour a category shows: its own, else the nearest ancestor's. */
export function clientCategoryColor(cats: ClientCategory[], id: string | null | undefined): string | null {
  const path = clientCategoryPath(cats, id);
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].color) return path[i].color as string;
  }
  return null;
}

/** The whole tree in display order, depth-first, each row with its depth (1-3). */
export function flattenClientCategories(cats: ClientCategory[]): { category: ClientCategory; depth: number }[] {
  const out: { category: ClientCategory; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    clientCategoryChildren(cats, parentId).forEach((c) => {
      if (seen.has(c.id)) return;
      seen.add(c.id);
      out.push({ category: c, depth });
      walk(c.id, depth + 1);
    });
  };
  walk(null, 1);
  return out;
}

/**
 * The category ids a client may carry to pass a category filter: the chosen
 * category and everything below it, so filtering by a main category also finds
 * clients filed under its subcategories.
 */
export function clientCategoryFilterIds(cats: ClientCategory[], id: string): Set<string> {
  const ids = clientCategoryDescendantIds(cats, id);
  ids.add(id);
  return ids;
}

interface ResolvedDrop {
  parentId: string | null;
  level: number;
}

/**
 * Where a drop would put the dragged category, or null when it is not allowed:
 * onto itself or its own subtree, or so deep that some part of the moved
 * subtree would end up below level 3.
 */
export function resolveClientCategoryDrop(
  cats: ClientCategory[],
  dragId: string,
  drop: ClientCategoryDropTarget
): ResolvedDrop | null {
  const byId = indexById(cats);
  const drag = byId.get(dragId);
  if (!drag) return null;

  let resolved: ResolvedDrop;
  if (drop.targetId === null) {
    resolved = { parentId: null, level: 1 };
  } else {
    const target = byId.get(drop.targetId);
    if (!target || target.id === dragId) return null;
    if (clientCategoryDescendantIds(cats, dragId).has(target.id)) return null;
    resolved =
      drop.position === "inside"
        ? { parentId: target.id, level: target.level + 1 }
        : { parentId: effectiveParentId(target, byId), level: target.level };
  }

  if (resolved.level + clientCategorySubtreeDepth(cats, dragId) - 1 > MAX_CLIENT_CATEGORY_DEPTH) return null;
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
export function moveClientCategory(
  cats: ClientCategory[],
  dragId: string,
  drop: ClientCategoryDropTarget
): ClientCategory[] | null {
  const resolved = resolveClientCategoryDrop(cats, dragId, drop);
  if (!resolved) return null;

  const byId = indexById(cats);
  const drag = byId.get(dragId)!;
  const oldParentId = effectiveParentId(drag, byId);

  const destinationBefore = clientCategoryChildren(cats, resolved.parentId);
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

  const patches = new Map<string, Partial<ClientCategory>>();
  const patch = (id: string, fields: Partial<ClientCategory>) =>
    patches.set(id, { ...patches.get(id), ...fields });

  destination.forEach((c, i) => patch(c.id, { sortOrder: i }));
  if (!sameParent) {
    clientCategoryChildren(cats, oldParentId)
      .filter((c) => c.id !== dragId)
      .forEach((c, i) => patch(c.id, { sortOrder: i }));
  }

  const levelDelta = resolved.level - drag.level;
  patch(dragId, {
    parentId: resolved.parentId,
    level: resolved.level as Level,
    icon: levelDelta ? iconForClientCategoryLevel(resolved.level) : drag.icon,
  });
  if (levelDelta) {
    clientCategoryDescendantIds(cats, dragId).forEach((id) => {
      const level = byId.get(id)!.level + levelDelta;
      patch(id, { level: level as Level, icon: iconForClientCategoryLevel(level) });
    });
  }

  return cats.map((c) => {
    const fields = patches.get(c.id);
    if (!fields) return c;
    const changed = (Object.keys(fields) as (keyof ClientCategory)[]).some(
      (key) => (c[key] ?? null) !== (fields[key] ?? null)
    );
    return changed ? { ...c, ...fields } : c;
  });
}
