import React from "react";
import { registerPendingSave } from "../../utils/pendingSaves";

export type AutosaveStatus = "idle" | "saving" | "saved";

/**
 * Settings save themselves: an edit is written shortly after the last keystroke, with no
 * Save button. The caller says whether the draft differs from what is stored (`dirty`);
 * the hook waits `delay` ms of quiet, then calls `save` with the newest value. Leaving
 * the screen with an edit still waiting writes it at once instead of dropping it.
 *
 * `status` drives the small "Saving… / Saved" chip (`SaveStatus`).
 */
export const useAutosave = <T,>({
  value,
  dirty,
  enabled = true,
  save,
  delay = 700,
}: {
  value: T;
  dirty: boolean;
  enabled?: boolean;
  save: (value: T) => void;
  delay?: number;
}): AutosaveStatus => {
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  const latest = React.useRef({ value, dirty, enabled, save });
  latest.current = { value, dirty, enabled, save };
  const pending = React.useRef(false);
  const savedTimer = React.useRef<number | undefined>(undefined);

  const flush = React.useCallback(() => {
    const cur = latest.current;
    pending.current = false;
    if (!cur.enabled || !cur.dirty) return;
    cur.save(cur.value);
    setStatus("saved");
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setStatus("idle"), 2200);
  }, []);

  React.useEffect(() => {
    if (!enabled || !dirty) {
      // The edit went away (typed back to what is stored, or the stored value arrived): nothing to write.
      if (pending.current) {
        pending.current = false;
        setStatus((s) => (s === "saving" ? "idle" : s));
      }
      return undefined;
    }
    pending.current = true;
    setStatus("saving");
    const timer = window.setTimeout(flush, delay);
    return () => window.clearTimeout(timer);
    // `value` is the edit itself: every change restarts the wait.
  }, [value, dirty, enabled, delay, flush]);

  // Unmounting (leaving Settings) with an edit still waiting: write it now.
  React.useEffect(
    () => () => {
      window.clearTimeout(savedTimer.current);
      if (pending.current) flush();
    },
    [flush],
  );

  // A reload inside the pause never unmounts cleanly. Hand the edit to the app
  // first, the same way a project type does, so the unload guard can write it.
  React.useEffect(() => registerPendingSave({ isPending: () => pending.current, flush }), [flush]);

  return status;
};
