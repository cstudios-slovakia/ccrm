/**
 * Time tracking v2: the text of worked time in List, Day and the drawer (D9) — pure.
 */

import { formatDuration, type TFn, type TimeEntry } from "./timeTracking.ts";
import { showsWorkedAndDelivered } from "./timeWorked.ts";

type Span = Pick<TimeEntry, "id" | "userId" | "title" | "running" | "startAt" | "endAt" | "durationSec">;

/** "Worked 2:00 · Delivered 6:00" when the two differ, else null (the caller shows one number). */
export const workedAndDeliveredLabel = (t: TFn, projectSec: number, workedSec: number, withSeconds = false): string | null =>
  showsWorkedAndDelivered(projectSec, workedSec)
    ? `${t("Worked", "Odpracované", "Ledolgozott")} ${formatDuration(workedSec, withSeconds)} · ${t("Delivered", "Dodané", "Leszállított")} ${formatDuration(projectSec, withSeconds)}`
    : null;

/** "0:40 of your time", or null when worked equals project time (within a second). */
export const ofYourTimeLabel = (t: TFn, projectSec: number, workedSec: number): string | null =>
  showsWorkedAndDelivered(projectSec, workedSec)
    ? t(`${formatDuration(workedSec)} of your time`, `${formatDuration(workedSec)} z vášho času`, `${formatDuration(workedSec)} a saját idődből`)
    : null;

const endMs = (e: Span, nowMs: number): number | null => {
  if (!e.startAt) return null;
  const start = Date.parse(e.startAt);
  if (!Number.isFinite(start)) return null;
  if (e.running) return nowMs;
  const end = e.endAt ? Date.parse(e.endAt) : start + (e.durationSec ?? 0) * 1000;
  return Number.isFinite(end) ? end : null;
};

/** The same user's other timed entries that overlap `entry`, earliest first. */
export const parallelWith = <T extends Span>(entry: Span, entries: readonly T[], nowMs: number): T[] => {
  const s = entry.startAt ? Date.parse(entry.startAt) : NaN;
  const e = endMs(entry, nowMs);
  if (!Number.isFinite(s) || e === null) return [];
  return entries
    .filter((o) => {
      if (o.id === entry.id || o.userId !== entry.userId || !o.startAt) return false;
      const os = Date.parse(o.startAt);
      const oe = endMs(o, nowMs);
      return Number.isFinite(os) && oe !== null && os < e && s < oe;
    })
    .sort((a, b) => Date.parse(a.startAt ?? "") - Date.parse(b.startAt ?? ""));
};
