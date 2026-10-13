export {};

declare global {
  interface UndoToastOptions {
    message: string;
    undoLabel: string;
    /** Puts everything back. Runs when the user presses Undo (or Ctrl/Cmd+Z). */
    onUndo: () => void;
    /** Makes the action final. Runs on expiry, ×, supersede, pagehide and logout. */
    onCommit: () => void;
    /** Length of the undo window. Default 6000. */
    durationMs?: number;
  }

  interface Window {
    /** Installed by App. `actionOrVariant` is an action button or a severity. */
    showToast?: (
      message: string,
      actionOrVariant?: { label: string; onClick: () => void } | "error" | "warning",
      explicitVariant?: "error" | "warning"
    ) => void;
    /** Installed by App. Shows an Undo toast immediately (never held back by a save). */
    showUndoToast?: (options: UndoToastOptions) => void;
    /** Installed by App. Pushes the current state to the server now. */
    ccrmFlushSync?: () => void;
  }
}
