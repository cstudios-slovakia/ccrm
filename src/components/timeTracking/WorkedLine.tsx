import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { clockTime, entrySeconds, formatDuration, type TimeEntry } from "../../utils/timeTracking.ts";
import { entryWorkedSeconds, showsWorkedAndDelivered } from "../../utils/timeWorked.ts";
import { ofYourTimeLabel, parallelWith, workedAndDeliveredLabel } from "../../utils/timeWorkedView.ts";
import { ClockDigits } from "./ClockDigits";

/**
 * A total: one number, or both when parallel work made worked and delivered (project) time differ
 * (docs/TIME-TRACKING-V2.md, D9). `labelled` (List, Day) reads "Worked 2:00 · Delivered 6:00" in
 * the parent's type; `compact` (Team, Salary report) shows worked in teal with delivered muted
 * after it, and `plain` drops the bold.
 */
export function WorkedTotal({ projectSec, workedSec, className = "", compact, plain }: { projectSec: number; workedSec: number; className?: string; compact?: boolean; plain?: boolean }) {
  const { t } = useTimeTracking();
  if (compact) {
    const cls = `block tabular-nums text-entity-text${plain ? "" : " font-bold"}`;
    if (!showsWorkedAndDelivered(projectSec, workedSec)) return <span className={cls}>{formatDuration(workedSec)}</span>;
    const wl = t("Worked", "Odpracované", "Ledolgozott");
    const dl = t("Delivered", "Dodané", "Leszállított");
    return (
      <span className={cls} title={`${wl} · ${dl}`} data-testid="worked-delivered">
        {formatDuration(workedSec)}
        <span className="type-meta font-normal text-gray-500"> · {formatDuration(projectSec)}</span>
      </span>
    );
  }
  const both = workedAndDeliveredLabel(t, projectSec, workedSec, true);
  return both ? (
    <span className={`tabular-nums ${className}`} data-testid="worked-delivered">{both}</span>
  ) : (
    <ClockDigits value={formatDuration(projectSec, true)} className={className} />
  );
}

/** Muted line under a row's project time: "0:40 of your time". */
export function OfYourTime({ entries }: { entries: readonly TimeEntry[] }) {
  const { t, nowMs } = useTimeTracking();
  const project = entries.reduce((s, e) => s + entrySeconds(e, nowMs), 0);
  const worked = entries.reduce((s, e) => s + entryWorkedSeconds(e, nowMs), 0);
  const label = ofYourTimeLabel(t, project, worked);
  return label ? <span className="block whitespace-nowrap text-right type-meta text-gray-500" data-testid="time-entry-worked">{label}</span> : null;
}

/** Drawer line above the cost: "Your time: 0:40 of 2:00 · in parallel with B, C 09:00–11:00". */
export function DrawerWorkedLine({ entry }: { entry: TimeEntry }) {
  const { t, nowMs } = useTimeTracking();
  const { entries } = useTimeEntries({ from: entry.entryDate, to: entry.entryDate, userId: entry.userId });
  const project = entrySeconds(entry, nowMs);
  const worked = entryWorkedSeconds(entry, nowMs);
  if (!entry.startAt || project - worked < 1) return null;
  const others = parallelWith(entry, entries, nowMs);
  const range = `${clockTime(entry.startAt)}–${entry.endAt ? clockTime(entry.endAt) : "…"}`;
  return (
    <div className="text-ui text-gray-600" data-testid="entry-worked-line">
      {t("Your time", "Váš čas", "A te időd")}: {formatDuration(worked)} {t("of", "z", "ennyiből:")} {formatDuration(project)}
      {others.length > 0 && ` · ${t("in parallel with", "súbežne s", "párhuzamosan ezzel:")} ${others.map((o) => o.title || "—").join(", ")} ${range}`}
    </div>
  );
}
