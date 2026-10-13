import { runUndoable, type DeletionGroup } from "./undoable.ts";
import { pickFields, reinsertAt, removeByIds, restoreFields } from "./undoableList.ts";
import { bulkMessage, singleMessage, undoLabel, type EntityKey, type Lang } from "./undoMessages.ts";

/**
 * Generic hold-to-confirm helpers for any sync-backed collection (projects,
 * invoices, finance rows, warehouse rows, employees…). The leads/tasks helpers
 * (leadActions.ts, taskActions.ts) are the same thing with their own wording and
 * extra rules.
 */
type Id = string | number;
type Setter<T> = (updater: (prev: T[]) => T[]) => void;

export interface CascadeGroup<C extends { id?: Id | null }> {
  collection: string;
  /** The full list the targets sit in. */
  all: C[];
  targets: C[];
  set: Setter<C>;
}

export interface DeleteRecordsOptions<T extends { id?: Id | null }> {
  /** Sync collection key: "projects", "financialRecords", "invoicesOffers"… */
  collection: string;
  /** The full list the targets sit in (for their original index). */
  allRecords: T[];
  targets: T[];
  setRecords: Setter<T>;
  lang: Lang;
  entity: EntityKey;
  /** Name shown in the toast. */
  titleOf: (record: T) => string | null | undefined;
  /** Runs right after the records left state (clear a selection, close a drawer…). */
  onApplied?: () => void;
  /** Other collections that must go together (e.g. a project's tasks). */
  alsoDelete?: ReadonlyArray<DeletionGroup>;
  /**
   * Child rows that leave state with the record (an item's stock rows, a
   * warehouse's…). Removed together, held back from the server together, and put
   * back at their old index by Undo.
   */
  cascade?: ReadonlyArray<CascadeGroup<any>>;
  /** Extra state changes made by `onApplied`-style cascades, and how to undo them. */
  applyExtra?: () => void;
  revertExtra?: () => void;
  /** Overrides the generated toast text. */
  message?: string;
  /**
   * Strategy C: the direct endpoint call. When given, sync is not what deletes
   * the record, so it runs on commit and a failure rolls everything back.
   */
  onCommit?: () => void | Promise<void>;
  failureMessage?: string;
}

const idOf = (record: { id?: Id | null }) => record.id;

/** Strategy B: remove now, hold the server delete until the undo window closes. */
export function deleteRecordsWithUndo<T extends { id?: Id | null }>(opts: DeleteRecordsOptions<T>): void {
  const { targets } = opts;
  if (targets.length === 0) return;
  const ids = new Set(targets.map((r) => String(r.id)));
  const { removed } = removeByIds(opts.allRecords, ids, idOf);
  const cascades = (opts.cascade ?? []).map((group) => {
    const childIds = new Set(group.targets.map((r) => String(r.id)));
    return { group, childIds, removed: removeByIds(group.all, childIds, idOf).removed };
  });
  runUndoable({
    message:
      opts.message ??
      (targets.length === 1
        ? singleMessage(opts.lang, opts.entity, "delete", opts.titleOf(targets[0]))
        : bulkMessage(opts.lang, opts.entity, "delete", targets.length)),
    undoLabel: undoLabel(opts.lang),
    deletions: [
      { key: opts.collection, records: targets },
      ...cascades.map(({ group }) => ({ key: group.collection, records: group.targets })),
      ...(opts.alsoDelete ?? []),
    ],
    apply: () => {
      opts.setRecords((prev) => prev.filter((r) => !ids.has(String(r.id))));
      for (const { group, childIds } of cascades) {
        group.set((prev) => prev.filter((r) => !childIds.has(String(r.id))));
      }
      opts.applyExtra?.();
      opts.onApplied?.();
    },
    revert: () => {
      opts.setRecords((prev) => reinsertAt(prev, removed, idOf));
      for (const { group, removed: childRemoved } of cascades) {
        group.set((prev) => reinsertAt(prev, childRemoved, idOf));
      }
      opts.revertExtra?.();
    },
    onCommit: opts.onCommit,
    failureMessage: opts.failureMessage,
  });
}

export interface ArchiveRecordsOptions<T extends { id?: Id | null }> {
  targets: T[];
  setRecords: Setter<T>;
  lang: Lang;
  entity: EntityKey;
  titleOf: (record: T) => string | null | undefined;
  /** Fields the archive changes — snapshotted so Undo is exact. */
  fields: ReadonlyArray<keyof T>;
  /** The change itself. */
  change: (record: T) => T;
  onApplied?: () => void;
  /** Undoes whatever `onApplied` changed outside the collection (e.g. a mirrored selection). */
  revertExtra?: () => void;
  message?: string;
}

/** Strategy A: flip fields now, Undo writes the exact previous values back. */
export function archiveRecordsWithUndo<T extends { id?: Id | null }>(opts: ArchiveRecordsOptions<T>): void {
  const { targets } = opts;
  if (targets.length === 0) return;
  const ids = new Set(targets.map((r) => String(r.id)));
  const snapshots = new Map(targets.map((r) => [String(r.id), pickFields(r, opts.fields)]));
  runUndoable({
    message:
      opts.message ??
      (targets.length === 1
        ? singleMessage(opts.lang, opts.entity, "archive", opts.titleOf(targets[0]))
        : bulkMessage(opts.lang, opts.entity, "archive", targets.length)),
    undoLabel: undoLabel(opts.lang),
    apply: () => {
      opts.setRecords((prev) => prev.map((r) => (ids.has(String(r.id)) ? opts.change(r) : r)));
      opts.onApplied?.();
    },
    revert: () => {
      opts.setRecords((prev) =>
        prev.map((r) => (ids.has(String(r.id)) ? restoreFields(r, snapshots.get(String(r.id)) ?? {}, opts.fields) : r))
      );
      opts.revertExtra?.();
    },
  });
}
