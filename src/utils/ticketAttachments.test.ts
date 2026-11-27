import assert from "node:assert/strict";
import test from "node:test";
import type { TicketAttachment } from "../types/index.ts";
import { collectTicketAttachments, mergeTicketAttachments } from "./ticketAttachments.ts";

const att = (over: Partial<TicketAttachment> & { name: string }): TicketAttachment => ({
  id: `att-${over.name}`,
  ...over,
});

test("mergeTicketAttachments appends new attachments and deduplicates by url/path/dataUrl", () => {
  const a = att({ id: "1", name: "shot.png", url: "/uploads/tickets/shot.png" });
  const dup = att({ id: "2", name: "shot-copy.png", url: "/uploads/tickets/shot.png" });
  const b = att({ id: "3", name: "err.png", path: "/uploads/tickets/err.png" });

  const merged = mergeTicketAttachments([a], [dup, b]);
  assert.deepEqual(merged.map((x) => x.name), ["shot.png", "err.png"]);
});

test("collectTicketAttachments includes images from timeline messages on the ticket", () => {
  const ticketImg = att({ id: "t1", name: "initial.png", url: "/uploads/tickets/initial.png" });
  const msgImg = att({ id: "m1", name: "image.png", url: "/uploads/tickets/image.png", type: "image/png" });
  const dupMsgImg = att({ id: "m2", name: "initial.png", url: "/uploads/tickets/initial.png" });

  const all = collectTicketAttachments({
    attachments: [ticketImg],
    messages: [
      { id: "msg-1", ticketId: "tck-1", authorType: "client", authorName: "Client", body: "reply", isInternal: false, createdAt: "2026-11-26", attachments: [msgImg, dupMsgImg] },
    ],
  });
  assert.deepEqual(all.map((x) => x.name), ["initial.png", "image.png"]);
});
