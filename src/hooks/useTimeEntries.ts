import { useEffect, useRef, useState } from "react";
import { useTimeTracking } from "./useTimeTracking";
import type { TimeEntry } from "../utils/timeTracking.ts";
import { listEntries, type ListParams } from "../utils/timeTrackingApi.ts";

/**
 * Entries of a date range (and optionally one person / the whole team), refetched whenever
 * the module's `version` changes — every save, stop, delete and rename bumps it.
 * A stale answer for an earlier range never overwrites a newer one.
 */
export function useTimeEntries(params: ListParams): { entries: TimeEntry[]; loading: boolean; error: boolean } {
  const { version, enabled } = useTimeTracking();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!enabled) return;
    const mine = ++seq.current;
    setLoading(true);
    listEntries(params)
      .then((res) => {
        if (mine !== seq.current) return;
        setEntries(res.entries);
        setError(false);
      })
      .catch(() => {
        if (mine === seq.current) setError(true);
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, enabled]);

  return { entries, loading, error };
}
