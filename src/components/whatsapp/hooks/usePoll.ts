import { useEffect, useRef } from "react";

export interface PollOptions {
  /** Poll at all. Default true. */
  enabled?: boolean;
  /** Stop while the browser tab is hidden, and poll at once when it comes back. Default true. */
  pauseWhenHidden?: boolean;
  /** Poll once straight away instead of waiting a whole interval. Default true. */
  immediate?: boolean;
}

/**
 * Call `fn` every `intervalMs`. A call that is still running is not overlapped. `fn` can change between
 * renders without restarting the timer. Errors are `fn`'s own business.
 */
export function usePoll(fn: () => Promise<void> | void, intervalMs: number, opts: PollOptions = {}): void {
  const { enabled = true, pauseWhenHidden = true, immediate = true } = opts;
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    let stopped = false;
    const tick = async () => {
      if (running || stopped) return;
      if (pauseWhenHidden && document.hidden) return;
      running = true;
      try {
        await latest.current();
      } finally {
        running = false;
      }
    };
    if (immediate) void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    if (pauseWhenHidden) document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, pauseWhenHidden, immediate]);
}
