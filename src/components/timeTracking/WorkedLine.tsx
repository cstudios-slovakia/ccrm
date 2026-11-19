import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { clockTime, entrySeconds, formatDuration, type TimeEntry } from "../../utils/timeTracking.ts";
import { entryWorkedSeconds } from "../../utils/timeWorked.ts";
import { ofYourTimeLabel, parallelWith, workedAndDeliveredLabel } from "../../utils/timeWorkedView.ts";
import { ClockDigits } from "./ClockDigits";

/** A day or week total: one number, or "Worked 2:00 · Delivered 6:00" when parallel work made them differ. */
export function WorkedTotal({ projectSec, workedSec, className = "" }: { projectSec: number; workedSec: number; className?: string }) {
  const { t } = useTimeTracking();
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
  return label ? <span className="block whitespace-nowrap text-right type-meta text-slate-500" data-testid="time-entry-worked">{label}</span> : null;
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
    <div className="text-ui text-slate-600" data-testid="entry-worked-line">
      {t("Your time", "Váš čas", "A te időd")}: {formatDuration(worked)} {t("of", "z", "ennyiből:")} {formatDuration(project)}
      {others.length > 0 && ` · ${t("in parallel with", "súbežne s", "párhuzamosan ezzel:")} ${others.map((o) => o.title || "—").join(", ")} ${range}`}
    </div>
  );
}
