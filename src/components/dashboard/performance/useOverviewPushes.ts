/**
 * The GitHub pushes per project for the selected period ("Nasadenia na server"): ONE request for all
 * projects (`api/project_pushes.php`, local-day range), made only while the tab is shown and some
 * project is paired with a repository. A new period starts from "loading" with no summary; a response
 * for an earlier period is ignored. No polling. Statuses:
 *
 * - `forbidden`: the server answered 403 (the user may not view projects).
 * - `failed`: the request failed for any other reason.
 */

import { useEffect, useMemo, useState } from "react";
import { ProjectPushesError, fetchProjectPushesOverview, type ProjectPushesOverview } from "../../../utils/projectPushesApi";
import { toIsoDay } from "../../../utils/performance/period";
import type { PerformancePeriod } from "./types";

export interface OverviewPushes {
  status: "idle" | "loading" | "ready" | "forbidden" | "failed";
  summary: ProjectPushesOverview | null;
}

const IDLE: OverviewPushes = { status: "idle", summary: null };
const LOADING: OverviewPushes = { status: "loading", summary: null };

export const useOverviewPushes = (enabled: boolean, period: PerformancePeriod): OverviewPushes => {
  const from = period.start ? toIsoDay(period.start) : "";
  const to = period.end ? toIsoDay(period.end) : "";
  const key = `${from}|${to}`;
  const [state, setState] = useState<OverviewPushes & { key: string }>({ ...IDLE, key: "" });

  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    setState((prev) => (prev.key === key && prev.status === "ready" ? prev : { ...LOADING, key }));
    fetchProjectPushesOverview({ from: from || undefined, to: to || undefined })
      .then((summary) => {
        if (!stale) setState({ status: "ready", summary, key });
      })
      .catch((err) => {
        if (stale) return;
        setState({ status: err instanceof ProjectPushesError && err.status === 403 ? "forbidden" : "failed", summary: null, key });
      });
    return () => {
      stale = true;
    };
  }, [enabled, from, to, key]);

  // The period changed and the effect has not run yet: never show the old period's answer.
  return useMemo(() => (!enabled ? IDLE : state.key === key ? state : LOADING), [enabled, state, key]);
};
