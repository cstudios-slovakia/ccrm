/**
 * List surgery for undoable deletes: take records out of an array remembering
 * where each one sat, and put them back at the same index. Order matters in the
 * places the user can drag to reorder (projects, tasks), so Undo must not append.
 */
export interface RemovedItem<T> {
  item: T;
  /** Index the item had in the list before removal. */
  index: number;
}

const keyOf = (value: unknown): string => String(value);

export function removeByIds<T>(
  list: ReadonlyArray<T>,
  ids: Iterable<string | number>,
  getId: (item: T) => string | number | null | undefined
): { next: T[]; removed: RemovedItem<T>[] } {
  const wanted = new Set<string>();
  for (const id of ids) wanted.add(keyOf(id));
  const next: T[] = [];
  const removed: RemovedItem<T>[] = [];
  list.forEach((item, index) => {
    const id = getId(item);
    if (id != null && wanted.has(keyOf(id))) removed.push({ item, index });
    else next.push(item);
  });
  return { next, removed };
}

/**
 * Inserts removed items back at their original indexes. Items whose id is already
 * in the list (restored twice, or re-created meanwhile) are skipped, so an
 * Undo can never duplicate a record.
 */
export function reinsertAt<T>(
  list: ReadonlyArray<T>,
  removed: ReadonlyArray<RemovedItem<T>>,
  getId: (item: T) => string | number | null | undefined
): T[] {
  const present = new Set<string>();
  for (const item of list) {
    const id = getId(item);
    if (id != null) present.add(keyOf(id));
  }
  const out = [...list];
  const ordered = [...removed].sort((a, b) => a.index - b.index);
  for (const { item, index } of ordered) {
    const id = getId(item);
    if (id != null && present.has(keyOf(id))) continue;
    out.splice(Math.min(index, out.length), 0, item);
    if (id != null) present.add(keyOf(id));
  }
  return out;
}

/** Values of the named fields, so an archive can be reverted exactly. */
export function pickFields<T extends object>(record: T, fields: ReadonlyArray<keyof T>): Partial<T> {
  const out: Partial<T> = {};
  for (const f of fields) out[f] = record[f];
  return out;
}

/**
 * Writes a snapshot made by {@link pickFields} back. A field that was absent
 * before the change is removed again rather than left as `undefined`, so the
 * serialised record is byte-identical to the original and the sync diff sees no
 * change.
 */
export function restoreFields<T extends object>(
  record: T,
  snapshot: Partial<T>,
  fields: ReadonlyArray<keyof T>
): T {
  const out: any = { ...record };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(snapshot, f) && snapshot[f] !== undefined) out[f] = snapshot[f];
    else delete out[f];
  }
  return out as T;
}
