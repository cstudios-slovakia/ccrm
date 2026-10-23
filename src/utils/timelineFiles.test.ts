import assert from "node:assert/strict";
import test from "node:test";
import type { TimelineEvent } from "../types/index.ts";
import { collectLeadOfferFiles, detachTimelineFile, timelineEventFiles } from "./timelineFiles.ts";

const offer = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: "evt_offer",
  type: "offer",
  timestamp: "2026-10-23 16:12",
  title: "Cenová ponuka odoslaná (56 €)",
  content: "Odoslaná cenová ponuka vo výške 56 € klientovi.",
  amount: 56,
  fileType: "offer",
  fileName: "POapp_potvrdenie_odoslanie.docx",
  fileSize: "0.29 MB",
  filePath: "/uploads/evt_offer-1_POapp_potvrdenie_odoslanie.docx",
  attachments: [
    { name: "POapp_potvrdenie_odoslanie.docx", size: "0.29 MB", path: "/uploads/evt_offer-1_POapp_potvrdenie_odoslanie.docx" },
    { name: "Asset 34.png", size: "0.42 MB", path: "/uploads/evt_offer-2_Asset 34.png" },
    { name: "apple-touch-icon.png", size: "0.00 MB", path: "/uploads/evt_offer-3_apple-touch-icon.png" },
  ],
  ...over,
});

test("a price offer lists every attachment, including images", () => {
  const rows = collectLeadOfferFiles(
    [{ name: "ildiko test", timeline: [offer()] }],
    "Unknown size",
  );
  assert.deepEqual(rows.map(row => row.fileName), [
    "POapp_potvrdenie_odoslanie.docx",
    "Asset 34.png",
    "apple-touch-icon.png",
  ]);
  assert.equal(rows.every(row => row.eventId === "evt_offer"), true);
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
  assert.equal(rows[1].filePath, "/uploads/evt_offer-2_Asset 34.png");
  assert.equal(rows[0].offerValue, 56);
  assert.equal(rows[0].clientName, "ildiko test");
});

test("an offer with no files is not a document, and other event types are skipped", () => {
  const rows = collectLeadOfferFiles(
    [{
      name: "ildiko test",
      timeline: [
        offer({ fileName: undefined, filePath: undefined, fileSize: undefined, attachments: [] }),
        { id: "evt_note", type: "note", timestamp: "2026-10-23 10:00", title: "Note", content: "", fileName: "photo.png" },
      ],
    }],
    "Unknown size",
  );
  assert.deepEqual(rows, []);
});

test("a legacy offer that only has fileName still lists that one file", () => {
  const rows = collectLeadOfferFiles(
    [{
      name: "ildiko test",
      timeline: [offer({ attachments: undefined, filePath: undefined })],
    }],
    "Unknown size",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fileName, "POapp_potvrdenie_odoslanie.docx");
  assert.equal(rows[0].filePath, "/uploads/evt_offer_POapp_potvrdenie_odoslanie.docx");
});

test("removing the document leaves the price offer and its other files", () => {
  const next = detachTimelineFile(offer(), {
    path: "/uploads/evt_offer-1_POapp_potvrdenie_odoslanie.docx",
    name: "POapp_potvrdenie_odoslanie.docx",
  });
  assert.equal(next.id, "evt_offer");
  assert.equal(next.type, "offer");
  assert.equal(next.title, "Cenová ponuka odoslaná (56 €)");
  assert.equal(next.amount, 56);
  assert.deepEqual(timelineEventFiles(next).map(file => file.name), [
    "Asset 34.png",
    "apple-touch-icon.png",
  ]);
  assert.equal(next.fileName, "Asset 34.png");
  assert.equal(next.filePath, "/uploads/evt_offer-2_Asset 34.png");
});

test("removing the last file leaves the price offer with nothing attached", () => {
  const bare = offer({
    attachments: [{ name: "POapp_potvrdenie_odoslanie.docx", size: "0.29 MB", path: "/uploads/evt_offer-1_POapp_potvrdenie_odoslanie.docx" }],
  });
  const next = detachTimelineFile(bare, { path: "/uploads/evt_offer-1_POapp_potvrdenie_odoslanie.docx" });
  assert.equal(next.id, "evt_offer");
  assert.equal(next.amount, 56);
  assert.deepEqual(next.attachments, []);
  assert.equal(next.fileName, undefined);
  assert.equal(next.filePath, undefined);
  assert.deepEqual(timelineEventFiles(next), []);
  assert.deepEqual(
    collectLeadOfferFiles([{ name: "ildiko test", timeline: [next] }], "Unknown size"),
    [],
  );
});

test("a file stored without a path is still the one that gets removed", () => {
  const next = detachTimelineFile(
    offer({
      attachments: [
        { name: "scan.png", size: "0.10 MB" },
        { name: "quote.docx", size: "0.20 MB", path: "/uploads/evt_offer-2_quote.docx" },
      ],
      fileName: "scan.png",
      filePath: undefined,
    }),
    { path: "/uploads/evt_offer_scan.png", name: "scan.png" },
  );
  assert.deepEqual(timelineEventFiles(next).map(file => file.name), ["quote.docx"]);
  assert.equal(next.id, "evt_offer");
});

test("a file that is not on the offer is left untouched", () => {
  const original = offer();
  assert.equal(detachTimelineFile(original, { path: "/uploads/missing.png" }), original);
});
