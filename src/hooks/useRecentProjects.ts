import { useMemo } from "react";
import { useTimeEntries } from "./useTimeEntries";
import { addDays } from "../utils/holidays.ts";
import { todayIso, weekStart } from "../utils/timeTracking.ts";

/**
 * The project picker's "recent" list and per-project time tracked this week (Monday on), from the last 30 days of the
 * caller's own entries. Shared by the Time tracking page and the header timer panel.
 */
export function useRecentProjects(): { recentProjectIds: string[]; secondsByProject: Record<string, number> } {
  const today = todayIso();
  const { entries } = useTimeEntries({ from: addDays(today, -30), to: today });
  return useMemo(() => {
    const monday = weekStart(today);
    const ids: string[] = [];
    const seconds: Record<string, number> = {};
    for (const e of [...entries].sort((a, b) => (b.startAt ?? b.createdAt).localeCompare(a.startAt ?? a.createdAt))) {
      if (!e.projectId) continue;
      if (!ids.includes(e.projectId)) ids.push(e.projectId);
      if (e.entryDate >= monday) seconds[e.projectId] = (seconds[e.projectId] ?? 0) + (e.durationSec ?? 0);
    }
    return { recentProjectIds: ids, secondsByProject: seconds };
  }, [entries, today]);
}
