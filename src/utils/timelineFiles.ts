/*
  Files attached to a lead timeline event, as the documents registry sees them.

  An offer (and the other paperwork events) can carry several files in
  `attachments`. `fileName` / `fileSize` / `filePath` only mirror the first one,
  for readers written before multi-file support. The registry used to list that
  one field, so a price offer with a document and two images showed only the
  document — and deleting that row deleted the event, because the row's id was
  the event's id. A file is not the offer. Removing one leaves the event.
*/

import type { TimelineAttachment, TimelineEvent } from "../types";

export interface TimelineFileCarrier {
  id: string;
  fileName?: string;
  fileSize?: string;
  filePath?: string;
  attachments?: TimelineAttachment[];
}

/** Every file on an event. The attachments list wins; a legacy single file is the fallback. */
export const timelineEventFiles = (event: TimelineFileCarrier): TimelineAttachment[] => {
  const listed = (event.attachments ?? []).filter(file => String(file?.name ?? "").trim().length > 0);
  if (listed.length > 0) {
    return listed.map(file => ({
      name: file.name,
      size: file.size,
      // Same address the registry and the download link use, so removing a
      // file that was stored without a path still finds it.
      path: String(file.path ?? "").trim() || `/uploads/${event.id}_${file.name}`,
    }));
  }
  const name = String(event.fileName ?? "").trim();
  if (!name) return [];
  return [{
    name,
    size: event.fileSize,
    path: String(event.filePath ?? "").trim() || `/uploads/${event.id}_${name}`,
  }];
};

/**
 * Drop one file from an event. The event itself stays, with or without files
 * left on it. The legacy single-file fields follow the first remaining file,
 * or are cleared when nothing is left, so an old reader cannot resurrect the
 * file that was just removed.
 */
export const detachTimelineFile = <E extends TimelineFileCarrier>(
  event: E,
  target: { path?: string; name?: string },
): E => {
  const path = String(target.path ?? "").trim();
  const name = String(target.name ?? "").trim();
  if (!path && !name) return event;

  let dropped = false;
  const remaining = timelineEventFiles(event).filter(file => {
    if (dropped) return true;
    const filePath = String(file.path ?? "").trim();
    const hit = path ? filePath === path : file.name === name;
    if (!hit) return true;
    dropped = true;
    return false;
  });
  if (!dropped) return event;

  const next = remaining[0];
  return {
    ...event,
    attachments: remaining,
    fileName: next?.name,
    fileSize: next?.size,
    filePath: next?.path,
  };
};

export interface LeadOfferRegistryFile {
  id: string;
  /** The timeline event this file belongs to. Deleting the file must not delete it. */
  eventId: string;
  fileName: string;
  fileSize: string;
  fileType: "offer" | "contract" | "invoice";
  filePath: string;
  clientName: string;
  uploadedAt: string;
  offerValue: number;
  summary: string;
}

type OfferTimelineEvent = TimelineFileCarrier & Pick<TimelineEvent, "type" | "fileType" | "timestamp" | "amount" | "content">;

/**
 * One documents-registry row per file on an offer event, images included.
 * An offer with no files is absent here and still lives on the timeline.
 */
export const collectLeadOfferFiles = (
  leads: { name: string; timeline?: OfferTimelineEvent[] }[],
  unknownSize: string,
): LeadOfferRegistryFile[] => {
  const rows: LeadOfferRegistryFile[] = [];
  for (const lead of leads) {
    for (const event of lead.timeline ?? []) {
      if (event.type !== "offer") continue;
      const fileType = event.fileType === "contract" || event.fileType === "invoice" ? event.fileType : "offer";
      timelineEventFiles(event).forEach((file, index) => {
        const filePath = String(file.path ?? "").trim() || `/uploads/${event.id}_${file.name}`;
        rows.push({
          id: `${event.id}::${index}::${filePath}`,
          eventId: event.id,
          fileName: file.name,
          fileSize: String(file.size ?? "").trim() || unknownSize,
          fileType,
          filePath,
          clientName: lead.name,
          uploadedAt: event.timestamp,
          offerValue: Number(event.amount) || 0,
          summary: event.content || "",
        });
      });
    }
  }
  return rows;
};
