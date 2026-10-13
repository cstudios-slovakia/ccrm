/**
 * Records that were deleted in the UI but whose deletion must not reach the
 * server yet, because the user can still press Undo.
 *
 * Why this exists: sync is a delta push. A record that disappears from React
 * state goes out in the payload's `deleted` map and the server deletes the row
 * — and, through `ON DELETE CASCADE`, its children (a lead's timeline rows, a
 * project's files, an invoice's items…). Some of those children are not held in
 * client state, so "delete now, re-insert on Undo" would silently lose them.
 * Instead the push layer holds the deletion back until the undo window closes:
 *
 *   - while pending, the id is left out of `deleted` and stays in the baseline,
 *     so the server still has the full row;
 *   - Undo puts the snapshot back into state; the diff then matches the baseline
 *     and nothing is ever sent;
 *   - commit releases the id; the next push carries the deletion.
 *
 * Pure module (no React, no DOM) so it can be unit-tested with `node --test`.
 * Keys are the sync collection names ("leads", "tasks"…); unified-entry rows
 * use `unifiedEntriesData:<entryId>` (see {@link unifiedEntryKey}).
 */
type IdRecord = { id?: unknown };

const registry = new Map<string, Map<string, unknown>>();

const UE_PREFIX = "unifiedEntriesData:";

/** Registry key for the rows of one unified entry. */
export const unifiedEntryKey = (entryId: string): string => `${UE_PREFIX}${entryId}`;

/** The unified-entry id a registry key refers to, or null for a plain collection. */
export const parseUnifiedEntryKey = (key: string): string | null =>
  key.startsWith(UE_PREFIX) ? key.slice(UE_PREFIX.length) : null;

const idOf = (record: unknown): string | null => {
  const id = record && typeof record === "object" ? (record as IdRecord).id : null;
  return id == null ? null : String(id);
};

/**
 * Holds the deletion of these records back. The records are kept as snapshots so
 * a protocol-v1 push (where an omitted record means "delete it") can re-attach
 * them to the payload.
 */
export function markDeletionPending(key: string, records: ReadonlyArray<unknown>): void {
  let bucket = registry.get(key);
  for (const record of records) {
    const id = idOf(record);
    if (id == null) continue;
    if (!bucket) {
      bucket = new Map();
      registry.set(key, bucket);
    }
    bucket.set(id, record);
  }
}

const drop = (key: string, ids: Iterable<string | number>): void => {
  const bucket = registry.get(key);
  if (!bucket) return;
  for (const id of ids) bucket.delete(String(id));
  if (bucket.size === 0) registry.delete(key);
};

/** The undo window closed: the deletion may now be sent. */
export function releaseDeletion(key: string, ids: Iterable<string | number>): void {
  drop(key, ids);
}

/** The user pressed Undo: the deletion never happens. */
export function cancelDeletion(key: string, ids: Iterable<string | number>): void {
  drop(key, ids);
}

export function isDeletionPending(key: string, id: string | number): boolean {
  return registry.get(key)?.has(String(id)) ?? false;
}

/** Ids whose deletion is currently held back for one collection. */
export function pendingDeletionIds(key: string): ReadonlySet<string> {
  const bucket = registry.get(key);
  return bucket ? new Set(bucket.keys()) : EMPTY;
}

/** Snapshots of the records held back for one collection. */
export function pendingDeletionRecords(key: string): unknown[] {
  const bucket = registry.get(key);
  return bucket ? [...bucket.values()] : [];
}

export function hasPendingDeletions(): boolean {
  return registry.size > 0;
}

/** Every key that currently holds something back. */
export function pendingDeletionKeys(): string[] {
  return [...registry.keys()];
}

/** Test helper / logout: forget everything without committing or cancelling. */
export function clearPendingDeletions(): void {
  registry.clear();
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * A server pull for the poller. The server still holds the records the user just
 * deleted, so applying its answer as-is would resurrect them on screen for the
 * length of the undo window. Returns the same object when nothing is pending.
 */
export function withoutPendingDeletions<T extends Record<string, any>>(data: T): T {
  if (registry.size === 0 || !data || typeof data !== "object") return data;
  let out: Record<string, any> | null = null;
  const own = () => (out ??= { ...data });
  for (const key of registry.keys()) {
    if (key.startsWith(UE_PREFIX)) {
      const entryId = key.slice(UE_PREFIX.length);
      const rows = data.unifiedEntriesData?.[entryId];
      if (Array.isArray(rows)) {
        const hidden = pendingDeletionIds(key);
        const kept = rows.filter((r: unknown) => {
          const id = idOf(r);
          return id == null || !hidden.has(id);
        });
        if (kept.length !== rows.length) {
          const target = own();
          target.unifiedEntriesData = { ...(target.unifiedEntriesData ?? data.unifiedEntriesData), [entryId]: kept };
        }
      }
      continue;
    }
    const list = data[key];
    if (!Array.isArray(list)) continue;
    const hidden = pendingDeletionIds(key);
    const kept = list.filter((r: unknown) => {
      const id = idOf(r);
      return id == null || !hidden.has(id);
    });
    if (kept.length !== list.length) own()[key] = kept;
  }
  return (out ?? data) as T;
}
