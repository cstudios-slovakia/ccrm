import { useEffect, useState } from "react";
import type { UserProfile } from "../../types";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { formatMoney } from "../../utils/currency";
import { taskCostFigure, withRunningSeconds, type TaskPersonTime } from "../../utils/taskTimeSummary.ts";
import { getTaskPeople } from "../../utils/timeTrackingApi.ts";
import { elapsedSeconds, formatDuration } from "../../utils/timeTracking.ts";
import { readTimeCreate } from "./timeCreateBridge";

/**
 * Task drawer: who has time on this task, and the cost the viewer is allowed to see.
 * The play button and the tracked/estimate chip stay on TaskTimeControls.
 */
export function TaskTimeBreakdown({ taskId, users }: { taskId?: string; users: UserProfile[] }) {
  const tt = useTimeTracking();
  const [people, setPeople] = useState<TaskPersonTime[] | null>(null);

  useEffect(() => {
    if (!tt.enabled || !taskId) {
      setPeople(null);
      return;
    }
    let live = true;
    getTaskPeople(taskId)
      .then((rows) => {
        if (live) setPeople(rows);
      })
      .catch(() => {
        if (live) setPeople([]);
      });
    return () => {
      live = false;
    };
  }, [tt.enabled, taskId, tt.version]);

  if (!tt.enabled || !taskId || people === null) return null;

  const t = tt.t;
  const { currency, language } = readTimeCreate();
  const money = (n: number) => formatMoney(n, currency, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const noRate = t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve");
  const nameOf = (userId: string) => users.find((u) => u.id === userId)?.name || t("Unknown", "Neznámy", "Ismeretlen");
  const runningHere = tt.running?.taskId === taskId && tt.userId
    ? { userId: tt.userId, seconds: elapsedSeconds(tt.running.startAt, tt.nowMs) }
    : null;
  const rows = withRunningSeconds(people, runningHere).sort(
    (a, b) => b.seconds - a.seconds || nameOf(a.userId).localeCompare(nameOf(b.userId)),
  );
  if (rows.length === 0) return null;

  const figure = taskCostFigure(people, tt.userId);
  const others = people.some((p) => p.userId !== tt.userId);

  return (
    <div data-testid="task-time-breakdown" className="mt-3 grid gap-2">
      {figure.total !== null && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-overline text-slate-500">{t("Cost", "Náklad", "Költség")}</span>
          <span className="text-ui font-semibold tabular-nums text-violet-700" data-testid="task-time-cost">{money(figure.total)}</span>
        </div>
      )}
      {figure.total === null && figure.own !== null && others && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-overline text-slate-500">{t("Your cost", "Váš náklad", "Az Ön költsége")}</span>
          <span className="text-ui font-semibold tabular-nums text-violet-700" data-testid="task-time-own-cost">{money(figure.own)}</span>
        </div>
      )}
      {figure.total === null && figure.own === null && figure.ownUnrated && (
        <p className="type-meta text-amber-700">{noRate}</p>
      )}
      <div className="type-overline text-slate-500">{t("By person", "Podľa osoby", "Személyenként")}</div>
      <ul className="grid gap-1">
        {rows.map((p) => (
          <li key={p.userId} data-testid="task-time-person" className="flex items-center justify-between gap-3 type-meta text-slate-700">
            <span className="min-w-0 truncate">{nameOf(p.userId)}</span>
            <span className="flex shrink-0 items-center gap-3 tabular-nums">
              <span className="text-slate-600">{formatDuration(p.seconds)}</span>
              {"cost" in p && p.cost === null ? (
                <span className="text-amber-700" title={noRate}>—</span>
              ) : typeof p.cost === "number" ? (
                <span className="text-violet-700">{money(p.cost)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
