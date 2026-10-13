import { runUndoable } from "./undoable.ts";
import { undoLabel, type Lang } from "./undoMessages.ts";

/**
 * "Clear all error logs" (Settings, Personal settings, the crash screen).
 *
 * Strategy C: the list empties at once, and `DELETE /api/error_logs.php` is only
 * called when the undo window closes. Undo puts the entries back on screen; if
 * the server refuses, they come back with an error toast.
 */
export function clearErrorLogsWithUndo({
  logs,
  setLogs,
  lang,
}: {
  logs: any[];
  setLogs: (next: any[]) => void;
  lang: Lang;
}): void {
  runUndoable({
    message:
      lang === "sk"
        ? "Chybové záznamy boli vymazané"
        : lang === "hu"
          ? "A hibanaplók törölve"
          : "Error logs cleared",
    undoLabel: undoLabel(lang),
    apply: () => setLogs([]),
    revert: () => setLogs(logs),
    failureMessage:
      lang === "sk"
        ? "Chybové záznamy sa nepodarilo vymazať"
        : lang === "hu"
          ? "A hibanaplókat nem sikerült törölni"
          : "Failed to clear error logs",
    onCommit: async () => {
      const response = await fetch("/api/error_logs.php", { method: "DELETE" });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "");
    },
  });
}
