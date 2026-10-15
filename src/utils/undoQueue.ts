/**
 * The bookkeeping behind "Undo" toasts, with no React and no DOM so it can be
 * unit-tested with `node --test`.
 *
 * An action that has been shown to the user is always settled exactly once:
 * either undone (the user changed their mind) or committed (the undo window
 * closed — by expiry, the toast's × button, a newer undo toast replacing it, or
 * the tab going away). Committing is what makes an archive/delete final, so a
 * pending action must never be dropped on the floor.
 */
export interface UndoableAction {
  /** Unique within a queue. Generated when omitted. */
  id?: string;
  /** Puts everything back the way it was. */
  onUndo: () => void;
  /** Makes the action final (e.g. lets the server delete go out). */
  onCommit: () => void;
}

export type UndoStatus = "pending" | "undone" | "committed";

interface Entry {
  id: string;
  action: UndoableAction;
  status: UndoStatus;
}

export interface UndoQueue {
  /**
   * Registers a pending action. Everything still pending is committed first
   * (one undo toast is on screen at a time, so a newer one supersedes it).
   * Returns the id of the new action.
   */
  register: (action: UndoableAction) => string;
  /** Runs onUndo. False when the action is unknown or already settled. */
  undo: (id: string) => boolean;
  /** Runs onCommit. False when the action is unknown or already settled. */
  commit: (id: string) => boolean;
  /** Commits every pending action; returns how many were committed. */
  commitAll: () => number;
  /** Status of an action, or null when it was never registered here. */
  statusOf: (id: string) => UndoStatus | null;
  /** The most recently registered action that is still pending. */
  current: () => string | null;
  /** Number of actions still pending. */
  size: () => number;
}

export function createUndoQueue(): UndoQueue {
  const entries = new Map<string, Entry>();
  let counter = 0;

  const pending = (): Entry[] => [...entries.values()].filter((e) => e.status === "pending");

  // A throwing handler must not stop the rest of the queue from settling: a
  // failed commit of one delete should not strand the others as "pending".
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      if (typeof console !== "undefined") console.error("undoQueue handler failed", err);
    }
  };

  const settle = (id: string, to: "undone" | "committed"): boolean => {
    const entry = entries.get(id);
    if (!entry || entry.status !== "pending") return false;
    // Flip first: a handler that re-enters (an onCommit that triggers a flush
    // which commits again) must find the action already settled.
    entry.status = to;
    run(to === "undone" ? entry.action.onUndo : entry.action.onCommit);
    return true;
  };

  return {
    register(action) {
      for (const old of pending()) settle(old.id, "committed");
      const id = action.id ?? `undo-${++counter}`;
      entries.set(id, { id, action, status: "pending" });
      return id;
    },
    undo: (id) => settle(id, "undone"),
    commit: (id) => settle(id, "committed"),
    commitAll() {
      let n = 0;
      for (const e of pending()) if (settle(e.id, "committed")) n++;
      return n;
    },
    statusOf: (id) => entries.get(id)?.status ?? null,
    current() {
      const list = pending();
      return list.length ? list[list.length - 1].id : null;
    },
    size: () => pending().length,
  };
}
