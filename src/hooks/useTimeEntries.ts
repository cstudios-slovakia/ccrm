import { useCallback, useEffect, useRef, useState } from "react";
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

/** A ticket's native entries. Empty unless the caller may see ticket time. Not gated on the module being visible. */
export function useTicketTimeEntries(ticketId: string | null, allowed: boolean): { entries: TimeEntry[]; reload: () => void } {
  const { version } = useTimeTracking();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const seq = useRef(0);
  const reload = useCallback(() => {
    if (!ticketId || !allowed) {
      setEntries([]);
      return;
    }
    const mine = ++seq.current;
    listEntries({ ticketId, from: "2000-01-01", to: "2100-01-01" })
      .then((res) => {
        if (mine === seq.current) setEntries(res.entries);
      })
      .catch(() => {
        if (mine === seq.current) setEntries([]);
      });
  }, [ticketId, allowed]);
  useEffect(() => {
    reload();
  }, [reload, version]);
  return { entries, reload };
}
