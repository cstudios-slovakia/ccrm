/**
 * GitHub pushes as read-only items of a project's timeline.
 *
 * The timeline list is kept in stored order (a new event is put in front), not sorted by time. The
 * pushes (newest first, from `api/project_pushes.php`) are woven in without reordering the project's own
 * events: a push goes in front of the first event that is older than it, and the pushes older than
 * every event follow the last one. An event whose timestamp cannot be read never moves a push.
 * Push items exist only for display; they are never part of the saved project.
 */

import type { ProjectTimelineEvent } from "../types/index.ts";
import type { ProjectPush } from "./projectPushesApi.ts";
import { parseAppDate, toIsoDay } from "./performance/period.ts";

export interface PushTimelineItem {
  /** `push:<push id>`, so it never collides with an event id. */
  id: string;
  timestamp: string;
  push: ProjectPush;
}

export type TimelineEntry = ProjectTimelineEvent | PushTimelineItem;

export const isPushItem = (entry: TimelineEntry): entry is PushTimelineItem => "push" in entry;

/** "YYYY-MM-DD HH:MM" of a push's UTC instant in local time, the form the timeline's own items use. */
export const pushLocalStamp = (pushedAt: string): string => {
  const date = parseAppDate(pushedAt);
  if (!date) return "";
  return `${toIsoDay(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/** The subject line of a commit message ("" when there is none). */
export const firstLine = (message: string | null | undefined): string => (message ?? "").split(/\r\n|\r|\n/, 1)[0].trim();

export const mergePushesIntoTimeline = (events: readonly ProjectTimelineEvent[], pushes: readonly ProjectPush[]): TimelineEntry[] => {
  if (pushes.length === 0) return events as ProjectTimelineEvent[];
  const items = pushes
    .map((push) => ({ time: parseAppDate(push.pushedAt)?.getTime() ?? null, item: { id: `push:${push.id}`, timestamp: pushLocalStamp(push.pushedAt), push } as PushTimelineItem }))
    .filter((entry): entry is { time: number; item: PushTimelineItem } => entry.time !== null)
    .sort((a, b) => b.time - a.time);

  const merged: TimelineEntry[] = [];
  let next = 0;
  for (const event of events) {
    const eventTime = parseAppDate(event.timestamp)?.getTime();
    if (eventTime !== undefined) {
      while (next < items.length && items[next].time > eventTime) merged.push(items[next++].item);
    }
    merged.push(event);
  }
  while (next < items.length) merged.push(items[next++].item);
  return merged;
};
