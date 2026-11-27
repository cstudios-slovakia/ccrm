/*
  ── SUB-STATUS TREE (shared by lead states and project statuses) ──

  One model for both settings tables: a flat list of items, each in a group,
  each optionally under a parent. One level only. The pure rules live here so
  the two tables cannot drift apart:
    · indent  — the row becomes a sub-status of the closest main status above it
                in the same group (only if it has no sub-statuses itself);
    · outdent — a sub-status becomes a main status again;
    · drop    — a main status carries its sub-statuses along; a sub-status dropped
                on a row of the same group is re-parented to that row's main
                status; dropped on a divider or into another group it is detached.
*/

export interface TreeItem {
  key: string;
  group: string;
  parent?: string;
}

export type TreeRow<T extends TreeItem = TreeItem> = { type: "divider"; group: string } | { type: "item"; item: T };

/** Drops broken parents (missing, self, or itself a sub-status), keeps each sub-status in its parent's group, orders by group and tree. */
export const arrangeTree = <T extends TreeItem>(items: readonly T[], groups: readonly string[]): T[] => {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const valid = (i: T): string | undefined => {
    const p = i.parent;
    if (!p || p === i.key) return undefined;
    const parent = byKey.get(p);
    if (!parent) return undefined;
    // A parent that is itself a sub-status would make a second level.
    return parent.parent && parent.parent !== parent.key && byKey.has(parent.parent) ? undefined : p;
  };
  const cleaned = items.map((i): T => {
    const p = valid(i);
    const { parent: _drop, ...rest } = i;
    return (p ? { ...rest, group: byKey.get(p)!.group, parent: p } : rest) as T;
  });
  return groups.flatMap((g) => {
    const inGroup = cleaned.filter((i) => i.group === g);
    return inGroup.filter((i) => !i.parent).flatMap((main) => [main, ...inGroup.filter((c) => c.parent === main.key)]);
  });
};

/** Dividers and items exactly as the table renders them. */
export const buildRows = <T extends TreeItem>(items: readonly T[], groups: readonly string[]): TreeRow<T>[] => {
  const arranged = arrangeTree(items, groups);
  return groups.flatMap((group): TreeRow<T>[] => [
    { type: "divider", group },
    ...arranged.filter((i) => i.group === group).map((item) => ({ type: "item" as const, item })),
  ]);
};

export const hasSubStatuses = (items: readonly TreeItem[], key: string) => items.some((i) => i.parent === key);

/** The main status an indent would pick for `key`, or null when indent does not apply. */
export const indentParent = (items: readonly TreeItem[], groups: readonly string[], key: string): string | null => {
  const self = items.find((i) => i.key === key);
  if (!self || self.parent || hasSubStatuses(items, key)) return null;
  const rows = buildRows(items, groups);
  const at = rows.findIndex((r) => r.type === "item" && r.item.key === key);
  for (let i = at - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.type === "divider") return null;
    if (!r.item.parent) return r.item.key;
  }
  return null;
};

export const canOutdent = (items: readonly TreeItem[], key: string) => !!items.find((i) => i.key === key)?.parent;

export const indentItem = <T extends TreeItem>(items: readonly T[], groups: readonly string[], key: string): T[] | null => {
  const parent = indentParent(items, groups, key);
  return parent ? arrangeTree(items.map((i) => (i.key === key ? { ...i, parent } : i)), groups) : null;
};

export const outdentItem = <T extends TreeItem>(items: readonly T[], groups: readonly string[], key: string): T[] =>
  arrangeTree(
    items.map((i) => {
      if (i.key !== key) return i;
      const { parent: _d, ...rest } = i;
      return rest as T;
    }),
    groups,
  );

/** Main statuses an add form offers under "Under (main status)". */
export const parentOptions = <T extends TreeItem>(items: readonly T[]): T[] => items.filter((i) => !i.parent);

/** Drops `key` on row `targetIdx` of `buildRows(items, groups)`. Returns the new arranged list, or null for a no-op. */
export const moveItem = <T extends TreeItem>(items: readonly T[], groups: readonly string[], key: string, targetIdx: number): T[] | null => {
  const rows = buildRows(items, groups);
  const from = rows.findIndex((r) => r.type === "item" && r.item.key === key);
  const target = rows[targetIdx];
  if (from === -1 || !target) return null;
  const dragged = (rows[from] as { item: T }).item;
  const block = rows.filter((r) => r.type === "item" && (r.item.key === key || r.item.parent === key));
  if (block.includes(target)) return null;

  // A sub-status dropped on a row of its own group goes under that row's main status.
  if (dragged.parent && target.type === "item" && target.item.group === dragged.group) {
    const parent = target.item.parent ?? target.item.key;
    return arrangeTree(items.map((i) => (i.key === key ? { ...i, parent } : i)), groups);
  }

  // Otherwise the same walk as the old tables: below the target when dragged down, above it when dragged up.
  const rest = rows.filter((r) => !block.includes(r));
  const at = rest.indexOf(target);
  rest.splice(from < targetIdx ? at + 1 : at, 0, ...block);
  let group = groups[0];
  const next: T[] = [];
  rest.forEach((r) => {
    if (r.type === "divider") group = r.group;
    else if (r.item.key === key && r.item.parent && r.item.group !== group) {
      const { parent: _d, ...plain } = r.item;
      next.push({ ...plain, group } as T);
    } else next.push({ ...r.item, group });
  });
  return arrangeTree(next, groups);
};
