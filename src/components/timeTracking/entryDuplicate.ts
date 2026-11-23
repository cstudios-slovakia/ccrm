import type { TimeEntry } from "../../utils/timeTracking.ts";
import type { EntryInput } from "../../utils/timeTrackingApi.ts";

/** The manual copy of an entry (same day, same hours, no clock times) that "Duplicate" creates; shared by the drawer and the Calendar popover. */
export const duplicateInput = (entry: TimeEntry, viewerUserId: string | null | undefined): EntryInput => ({
  description: entry.titleSource === "entry" ? entry.title : null,
  note: entry.note,
  taskId: entry.taskId,
  ticketId: entry.taskId ? null : entry.ticketId,
  projectId: entry.projectId,
  entryDate: entry.entryDate,
  durationSec: entry.durationSec ?? 0,
  billable: entry.billable,
  tags: entry.tags,
  source: "manual",
  userId: entry.userId !== viewerUserId ? entry.userId : undefined,
});
