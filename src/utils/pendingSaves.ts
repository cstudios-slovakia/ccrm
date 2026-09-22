/**
 * Autosaves that live inside a component (a debounce waiting for a pause in
 * typing) are invisible to App's beforeunload guard, which only knows about
 * its own pushes. A reload or tab close inside that pause lost the last edit
 * without a warning. Components with such a pause register here; App asks on
 * beforeunload, writes what is waiting and warns.
 */
export interface PendingSave {
  /** A change is waiting for its pause and has not been handed to the app yet. */
  isPending: () => boolean;
  /** Hands the waiting change to the app now. */
  flush: () => void;
}

const registry = new Set<PendingSave>();

/** Registers a component's pending-save hooks; returns the unregister call (an effect cleanup). */
export function registerPendingSave(entry: PendingSave): () => void {
  registry.add(entry);
  return () => {
    registry.delete(entry);
  };
}

/** Writes every waiting change. True when there was at least one. */
export function flushPendingSaves(): boolean {
  let any = false;
  for (const entry of registry) {
    if (!entry.isPending()) continue;
    any = true;
    entry.flush();
  }
  return any;
}
