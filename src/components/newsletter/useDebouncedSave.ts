import { useCallback, useEffect, useRef, useState } from "react";
import { registerPendingSave } from "../../utils/pendingSaves";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Debounced write of one value (the pattern of docs/UNSAVED-DRAFTS-DECISIONS.md option B: a pause,
 * a flush on exit, and the app's unload guard). `queue(v)` keeps only the newest value and writes
 * it `delay` ms after the last call; `flush()` writes now; unmounting flushes; a reload inside the
 * pause hands the value to the app through `registerPendingSave`. A failed write keeps the value,
 * `status` becomes "error" and `flush()` (the "Not saved, retry" link) tries again.
 */
export const useDebouncedSave = <T,>(save: (value: T) => Promise<void>, delay = 1500) => {
  const [status, setStatus] = useState<SaveState>("idle");
  const pending = useRef<{ value: T } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const mounted = useRef(true);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    // Wait for a write that is already on its way, so two writes never overtake each other.
    if (inFlight.current) await inFlight.current.catch(() => undefined);
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    if (mounted.current) setStatus("saving");
    const run = saveRef.current(job.value).then(
      () => {
        if (mounted.current) setStatus(pending.current ? "saving" : "saved");
      },
      () => {
        // Keep the value (unless a newer one arrived meanwhile) so the retry has something to write.
        if (!pending.current) pending.current = job;
        if (mounted.current) setStatus("error");
      },
    );
    inFlight.current = run;
    await run;
    if (inFlight.current === run) inFlight.current = null;
  }, []);

  const queue = useCallback(
    (value: T) => {
      pending.current = { value };
      setStatus("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    mounted.current = true;
    const unregister = registerPendingSave({ isPending: () => pending.current !== null, flush: () => void flush() });
    return () => {
      unregister();
      // Leaving with an edit waiting writes it now; the component is gone, so no state is set.
      mounted.current = false;
      void flush();
    };
  }, [flush]);

  return { status, queue, flush };
};
