/**
 * Call-site helpers for "hold to confirm, then Undo".
 *
 * Three strategies (see docs/HOLD-TO-CONFIRM-INVENTORY.md):
 *
 *  A  archive           — flip fields now, Undo writes the snapshot back.
 *  B  sync-backed delete — drop the record from state now; the sync layer holds
 *                          the server delete back until the undo window closes.
 *  C  direct endpoint   — hide the item now; call the endpoint only on commit.
 *
 * All three share {@link runUndoable}: apply immediately, show one Undo toast,
 * and settle exactly once.
 */
import { cancelDeletion, markDeletionPending, releaseDeletion } from "./pendingDeletions.ts";

export interface DeletionGroup {
  /** Sync collection key ("leads", "tasks"…) or `unifiedEntryKey(id)`. */
  key: string;
  /** Snapshots of the records being removed. */
  records: ReadonlyArray<unknown>;
}

export interface UndoableOptions {
  /** Toast text, e.g. `Task "Calculation" deleted`. */
  message: string;
  undoLabel: string;
  /** Performs the action through the normal setters, so the UI updates at once. */
  apply: () => void;
  /** Puts every slice that `apply` changed back as it was. */
  revert: () => void;
  /** Strategy B: records whose server delete is held back until commit. */
  deletions?: ReadonlyArray<DeletionGroup>;
  /**
   * Strategy C: the deferred direct call. Runs once, on commit, before the held
   * sync deletions are released. If it throws or rejects the action is rolled
   * back (`revert`) and the failure is shown in an error toast.
   */
  onCommit?: () => void | Promise<void>;
  /** Headline of the error toast when the deferred call fails. */
  failureMessage?: string;
  durationMs?: number;
}

const idsOf = (records: ReadonlyArray<unknown>): string[] =>
  records
    .map((r) => (r && typeof r === "object" ? (r as { id?: unknown }).id : null))
    .filter((id): id is string | number => id != null)
    .map(String);

export function requestSyncFlush(): void {
  if (typeof window !== "undefined") window.ccrmFlushSync?.();
}

export function runUndoable(options: UndoableOptions): void {
  const { deletions = [] } = options;
  // Mark before applying: applying calls the push, and a push that runs while the
  // record is already gone but not yet marked would send the delete at once.
  for (const group of deletions) markDeletionPending(group.key, group.records);
  options.apply();

  const show = typeof window !== "undefined" ? window.showUndoToast : undefined;

  const cancelAll = () => {
    for (const group of deletions) cancelDeletion(group.key, idsOf(group.records));
  };
  const finish = () => {
    for (const group of deletions) releaseDeletion(group.key, idsOf(group.records));
    if (deletions.length) requestSyncFlush();
  };
  // The deferred call failed: the item is still on the server, so put it back and say why.
  const fail = (err: unknown) => {
    options.revert();
    cancelAll();
    const reason = err instanceof Error && err.message ? err.message : "";
    const text = [options.failureMessage, reason].filter(Boolean).join(" — ");
    if (text) window.showToast?.(text, "error");
  };

  const handlers = {
    onUndo: () => {
      options.revert();
      // Cancel after the restored state has been rendered: a push that was
      // already queued reads the state refs, and must not see the record gone
      // with its hold already lifted.
      setTimeout(cancelAll, 0);
    },
    onCommit: () => {
      let pending: void | Promise<void>;
      try {
        pending = options.onCommit?.();
      } catch (err) {
        fail(err);
        return;
      }
      if (pending && typeof (pending as Promise<void>).then === "function") {
        (pending as Promise<void>).then(finish, fail);
      } else {
        finish();
      }
    },
  };

  if (typeof show !== "function") {
    // No toast host (tests, early boot): there is nobody to press Undo, so the
    // action is final straight away rather than stuck pending forever.
    handlers.onCommit();
    return;
  }
  show({
    message: options.message,
    undoLabel: options.undoLabel,
    durationMs: options.durationMs,
    ...handlers,
  });
}
