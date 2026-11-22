import { useEffect, useMemo, useState } from "react";
import { useTimeTracking } from "./useTimeTracking";
import { elapsedSeconds } from "../utils/timeTracking";
import {
  EMPTY_BREAKDOWN_TIME,
  type BreakdownTimeData,
  type BreakdownTimePerson,
} from "../utils/projectBreakdown";

interface UseProjectBreakdownTimeOpts {
  enabled: boolean;
  from?: string;
  to?: string;
}

/**
 * Loads pre-aggregated per-project x per-employee hours & cost from
 * `/api/project_breakdown.php` while Breakdown mode is active, and folds in
 * the active user's live running timer so totals tick smoothly without waiting
 * for a refetch.
 */
export function useProjectBreakdownTime({
  enabled,
  from,
  to,
}: UseProjectBreakdownTimeOpts): {
  timeData: BreakdownTimeData;
  loading: boolean;
} {
  const tt = useTimeTracking();
  const [raw, setRaw] = useState<BreakdownTimeData>(EMPTY_BREAKDOWN_TIME);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const query = qs.toString();
    const url = query ? `/api/project_breakdown.php?${query}` : "/api/project_breakdown.php";

    setLoading(true);
    fetch(url, { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (body && body.success === true) {
          setRaw({
            canSeeAllCosts: Boolean(body.canSeeAllCosts),
            byProject: body.byProject && typeof body.byProject === "object" ? body.byProject : {},
            firstEntryAtByTask:
              body.firstEntryAtByTask && typeof body.firstEntryAtByTask === "object"
                ? body.firstEntryAtByTask
                : {},
            firstEntryAtByTicket:
              body.firstEntryAtByTicket && typeof body.firstEntryAtByTicket === "object"
                ? body.firstEntryAtByTicket
                : {},
          });
        }
      })
      .catch(() => {
        // Fallback handled below via tt.totals.byProject
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, from, to, tt.version]);

  const timeData = useMemo<BreakdownTimeData>(() => {
    const running = tt.running;
    const hasRawProjects = Object.keys(raw.byProject).length > 0;

    // If endpoint hasn't loaded or returned empty yet, seed baseline from tt.totals.byProject
    let byProject: Record<string, BreakdownTimeData["byProject"][string]> = raw.byProject;
    if (!hasRawProjects && Object.keys(tt.totals.byProject).length > 0) {
      byProject = {};
      for (const [pid, tot] of Object.entries(tt.totals.byProject)) {
        byProject[pid] = {
          seconds: tot.seconds,
          billableSeconds: tot.seconds,
          cost: tot.cost,
          people: [],
        };
      }
    }

    if (!running || !running.projectId || running.durationSec != null) {
      return {
        ...raw,
        byProject,
      };
    }

    const extraSec = elapsedSeconds(running.startAt ?? null, tt.nowMs);
    if (extraSec <= 0) {
      return { ...raw, byProject };
    }

    const pid = running.projectId;
    const existing = byProject[pid] ?? {
      seconds: 0,
      billableSeconds: 0,
      cost: null,
      people: [],
    };
    const nextPeople: BreakdownTimePerson[] = existing.people.map((p) => ({ ...p }));
    const uid = running.userId || tt.userId || "";
    const match = nextPeople.find((p) => p.userId === uid);
    if (match) {
      match.seconds += extraSec;
      if (running.billable) match.billableSeconds += extraSec;
    } else if (uid) {
      nextPeople.push({
        userId: uid,
        employeeId: null,
        seconds: extraSec,
        billableSeconds: running.billable ? extraSec : 0,
      });
    }

    return {
      ...raw,
      byProject: {
        ...byProject,
        [pid]: {
          ...existing,
          seconds: existing.seconds + extraSec,
          billableSeconds: existing.billableSeconds + (running.billable ? extraSec : 0),
          people: nextPeople,
        },
      },
    };
  }, [raw, tt.totals.byProject, tt.running, tt.nowMs, tt.userId]);

  return { timeData, loading };
}
