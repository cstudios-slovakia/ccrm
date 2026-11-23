/**
 * The time entries of every user that the overview needs: the utilisation widget (period) and the
 * recent labour of inactive projects (last 30 days). One request, `userId: "all"`, for the range of
 * `overviewEntryRange`.
 *
 * Fetched only while the tab is shown and the user may use time tracking. A new range starts from
 * "loading" with no entries; a refetch for the same range (the module's `version` changed: a save,
 * stop or delete) keeps what is shown until the answer arrives. A response for an earlier range is
 * ignored. Statuses:
 *
 * - `forbidden`: the module is off for the user, or the server does not give them the team's entries.
 *   The server answers `userId: "all"` without `time_tracking_team` with the caller's own entries only,
 *   so `viewer.canTeam` decides, and a 403 counts the same.
 * - `failed`: the request failed for any other reason.
 */

import { useEffect, useMemo, useState } from "react";
import { useTimeTracking } from "../../../hooks/useTimeTracking";
import type { TimeEntry } from "../../../utils/timeTracking";
import { TimeApiError, listEntries } from "../../../utils/timeTrackingApi";
import { overviewEntryRange } from "../../../utils/performance/labour";
import type { PerformancePeriod } from "./types";

/** The server returns at most this many entries, newest first, with no flag (`LIMIT 5000` in `public/api/time_entries.php`). */
export const TIME_ENTRIES_SERVER_LIMIT = 5000;

export interface OverviewTimeEntries {
  status: "idle" | "loading" | "ready" | "forbidden" | "failed";
  entries: readonly TimeEntry[];
  /** The answer hit the server limit: older entries of the range are missing. */
  truncated: boolean;
}

const NONE: readonly TimeEntry[] = [];
const IDLE: OverviewTimeEntries = { status: "idle", entries: NONE, truncated: false };
const LOADING: OverviewTimeEntries = { status: "loading", entries: NONE, truncated: false };
const FORBIDDEN:OverviewTimeEntries = { status: "forbidden", entries: NONE, truncated: false };

export const useOverviewTimeEntries = (active: boolean, period: PerformancePeriod, today: Date): OverviewTimeEntries => {
  const { enabled, version } = useTimeTracking();
  const { from, to } = useMemo(() => overviewEntryRange(period, today), [period, today]);
  const key = `${from}|${to}`;
  const [state, setState] = useState<OverviewTimeEntries & { key: string }>({ ...IDLE, key: "" });

  useEffect(() => {
    if (!enabled || !active) return;
    let stale = false;
    setState((prev) => (prev.key === key && prev.status === "ready" ? prev : { status: "loading", entries: NONE, truncated: false, key }));
    listEntries({ from, to, userId: "all" })
      .then((res) => {
        if (stale) return;
        if (!res.viewer?.canTeam) {
          setState({ ...FORBIDDEN, key });
          return;
        }
        const entries = res.entries ?? NONE;
        setState({ status: "ready", entries, truncated: entries.length >= TIME_ENTRIES_SERVER_LIMIT, key });
      })
      .catch((err) => {
        if (stale) return;
        const refused = err instanceof TimeApiError && err.status === 403;
        setState({ status: refused ? "forbidden" : "failed", entries: NONE, truncated: false, key });
      });
    return () => {
      stale = true;
    };
  }, [enabled, active, from, to, key, version]);

  if (!enabled) return FORBIDDEN;
  // The range changed and the effect has not run yet: never show the old range's answer.
  return state.key === key || !active ? state : LOADING;
};
