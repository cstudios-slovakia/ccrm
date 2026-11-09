import { useCallback, useEffect, useRef, useState } from "react";
import { registerPendingSave } from "../../utils/pendingSaves";

/** Writes on their way, across screens: a screen that loads right after another unmounted waits for them (Back from the design route must not show the old body). */
const writing = new Set<Promise<unknown>>();
export const settleSaves = async (): Promise<void> => {
  while (writing.size) await Promise.allSettled([...writing]);
};

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
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const mounted = useRef(true);

  /** Writes the waiting value now. Resolves true when nothing is left unsaved, false when a write failed. */
  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    for (;;) {
      // Wait for a write that is already on its way, so two writes never overtake each other;
      // then look again, because another caller may have started the next one meanwhile.
      if (inFlight.current) {
        await inFlight.current;
        continue;
      }
      const job = pending.current;
      if (!job) return true;
      pending.current = null;
      if (mounted.current) setStatus("saving");
      const run = saveRef.current(job.value).then(
        () => {
          if (mounted.current) setStatus(pending.current ? "saving" : "saved");
          return true;
        },
        () => {
          // Keep the value (unless a newer one arrived meanwhile) so the retry has something to write.
          if (!pending.current) pending.current = job;
          if (mounted.current) setStatus("error");
          return false;
        },
      );
      inFlight.current = run;
      writing.add(run);
      const ok = await run;
      writing.delete(run);
      if (inFlight.current === run) inFlight.current = null;
      if (!ok) return false;
    }
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
