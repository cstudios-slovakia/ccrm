/**
 * The time entries of every user that the overview needs: the utilisation widget (period) and the
 * recent labour of inactive projects (last 30 days). One request, `userId: "all"`, for the range of
 * `overviewEntryRange`.
 *
 * Fetched only while the tab is shown and the user may use time tracking; refetched when the range
 * or the module's `version` changes (a save, stop or delete), never in a loop. A response for an
 * earlier range is ignored. The server answers `userId: "all"` for a caller without the
 * `time_tracking_team` permission with their own entries only, so `viewer.canTeam` decides: without
 * it (or on any error) the data is "unavailable", never a one-person "team".
 */

import { useEffect, useMemo, useState } from "react";
import { useTimeTracking } from "../../../hooks/useTimeTracking";
import type { TimeEntry } from "../../../utils/timeTracking";
import { listEntries } from "../../../utils/timeTrackingApi";
import { overviewEntryRange } from "../../../utils/performance/labour";
import type { PerformancePeriod } from "./types";

export type OverviewTimeEntries =
  | { status: "idle"; entries: readonly TimeEntry[] }
  | { status: "loading"; entries: readonly TimeEntry[] }
  | { status: "ready"; entries: readonly TimeEntry[] }
  | { status: "unavailable"; entries: readonly TimeEntry[] };

const NONE: readonly TimeEntry[] = [];

export const useOverviewTimeEntries = (active: boolean, period: PerformancePeriod, today: Date): OverviewTimeEntries => {
  const { enabled, version } = useTimeTracking();
  const { from, to } = useMemo(() => overviewEntryRange(period, today), [period, today]);
  const [state, setState] = useState<OverviewTimeEntries>({ status: "idle", entries: NONE });

  useEffect(() => {
    if (!enabled || !active) return;
    let stale = false;
    setState((prev) => ({ status: "loading", entries: prev.entries }));
    listEntries({ from, to, userId: "all" })
      .then((res) => {
        if (stale) return;
        setState(res.viewer?.canTeam ? { status: "ready", entries: res.entries ?? NONE } : { status: "unavailable", entries: NONE });
      })
      .catch(() => {
        if (!stale) setState({ status: "unavailable", entries: NONE });
      });
    return () => {
      stale = true;
    };
  }, [enabled, active, from, to, version]);

  return enabled ? state : { status: "unavailable", entries: NONE };
};
