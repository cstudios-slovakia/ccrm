/**
 * The paired lead's history as read-only items of a project's timeline.
 *
 * When a lead turns into a project, the project shows what happened on the lead before (and after):
 * calls, e-mails, offers, status changes. Nothing is copied: the items are read from the lead every time,
 * so they stay current and a project paired long ago gets them too. Like GitHub pushes
 * (projectPushTimeline.ts) they are woven in by time without reordering the project's own events, and
 * they are never part of the saved project.
 */

import type { TimelineEvent } from "../types/index.ts";
import { parseAppDate } from "./performance/period.ts";

export interface LeadHistoryItem {
  /** `lead:<event id>`, so it never collides with a project event id. */
  id: string;
  timestamp: string;
  leadEvent: TimelineEvent;
}

export const isLeadHistoryItem = (entry: object): entry is LeadHistoryItem => "leadEvent" in entry;

/** The lead's entries worth showing on the project: not hidden (filed-away mail tombstones). Newest first. */
export const leadHistoryItems = (events: readonly TimelineEvent[] | undefined): LeadHistoryItem[] =>
  (events ?? [])
    .filter((e) => !e.hidden && !!parseAppDate(e.timestamp))
    .map((e) => ({ id: `lead:${e.id}`, timestamp: e.timestamp, leadEvent: e }))
    .sort((a, b) => (parseAppDate(b.timestamp)?.getTime() ?? 0) - (parseAppDate(a.timestamp)?.getTime() ?? 0));

/**
 * Weaves the lead items (newest first) into the timeline: each goes in front of the first entry older than
 * it; the ones older than every entry follow the last. An entry whose time cannot be read never moves one.
 */
export const mergeLeadHistory = <T extends { timestamp: string }>(entries: readonly T[], items: readonly LeadHistoryItem[]): (T | LeadHistoryItem)[] => {
  if (items.length === 0) return entries as T[];
  const merged: (T | LeadHistoryItem)[] = [];
  let next = 0;
  for (const entry of entries) {
    const time = parseAppDate(entry.timestamp)?.getTime();
    if (time !== undefined) {
      while (next < items.length && (parseAppDate(items[next].timestamp)?.getTime() ?? 0) > time) merged.push(items[next++]);
    }
    merged.push(entry);
  }
  while (next < items.length) merged.push(items[next++]);
  return merged;
};

/**
 * One line of readable text from a lead entry's content. Old lead notes were saved as a JSON list of editor
 * blocks; their text is joined, tags stripped. Anything else is returned trimmed.
 */
export const leadEventText = (content: string | null | undefined): string => {
  const raw = (content ?? "").trim();
  if (!raw.startsWith("[")) return raw;
  try {
    const blocks = JSON.parse(raw);
    if (!Array.isArray(blocks)) return raw;
    return blocks
      .map((b) => (b && typeof b === "object" ? String((b as { content?: unknown }).content ?? "") : ""))
      .map((s) => s.replace(/<[^>]*>/g, "").trim())
      .filter(Boolean)
      .join(" · ");
  } catch {
    return raw;
  }
};
