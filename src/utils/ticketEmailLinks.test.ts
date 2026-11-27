import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Ticket } from "../types/index.ts";
import {
  buildLinkedEmail,
  buildLinkedEmailHash,
  buildTicketHash,
  emailMatchesLink,
  findLinkedTicketsForEmails,
  getTicketLinkedEmails,
  linkEmailToTicket,
  unlinkEmailFromTicket,
} from "./ticketEmailLinks.ts";

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: "tck-1",
  ticketNumber: "TCK-000001",
  subject: "Login issue",
  status: "open",
  priority: "medium",
  type: "bug",
  createdAt: "2026-11-27 10:00:00",
  ...overrides,
});

describe("ticketEmailLinks", () => {
  it("links and deduplicates emails on a ticket", () => {
    const email = {
      uid: 42,
      event_id: "evt-42",
      message_id: "<abc@example.com>",
      subject: "Need help with login",
      from: { name: "Jane Doe", address: "jane@example.com" },
      date: "2026-11-27 09:30:00",
      isSent: false,
    };
    const link = buildLinkedEmail(email, { mailboxId: "mb-support", activeFolder: "INBOX", linkedAt: "2026-11-27T10:00:00Z" });
    const t1 = linkEmailToTicket(makeTicket(), link);
    assert.equal(getTicketLinkedEmails(t1).length, 1);
    assert.equal(getTicketLinkedEmails(t1)[0].mailboxId, "mb-support");

    // Linking the same email again is a no-op
    const t2 = linkEmailToTicket(t1, link);
    assert.equal(t2, t1);
  });

  it("matches linked tickets by messageId, eventId, uid+folder+mailbox, and ticket.emailMessageId", () => {
    const email = {
      uid: 99,
      event_id: "evt-99",
      message_id: "<thread-99@example.com>",
      subject: "Invoice question",
      isSent: false,
    };
    const link = buildLinkedEmail(email, { mailboxId: "personal", activeFolder: "INBOX" });
    const tLinked = linkEmailToTicket(makeTicket({ id: "tck-linked", ticketNumber: "TCK-000010" }), link);
    const tImported = makeTicket({
      id: "tck-imported",
      ticketNumber: "TCK-000011",
      emailMessageId: "<thread-99@example.com>",
    });
    const tOther = makeTicket({ id: "tck-other", ticketNumber: "TCK-000012" });

    const matched = findLinkedTicketsForEmails([tLinked, tImported, tOther], [email], "personal", "INBOX");
    assert.deepEqual(
      matched.map((t) => t.id),
      ["tck-linked", "tck-imported"],
    );

    // Falls back to uid + folder + mailboxId when message_id is absent
    assert.equal(
      emailMatchesLink({ uid: 99, isSent: false }, { ...link, messageId: undefined, eventId: undefined }, "personal", "INBOX"),
      true,
    );
    assert.equal(
      emailMatchesLink({ uid: 99, isSent: true }, { ...link, messageId: undefined, eventId: undefined }, "personal", "INBOX"),
      false,
    );
  });

  it("unlinks by linkId or by email list", () => {
    const email = { uid: 7, message_id: "<m7@test>", subject: "Test", isSent: false };
    const link = buildLinkedEmail(email, { mailboxId: "personal" });
    const tLinked = linkEmailToTicket(makeTicket(), link);

    const byId = unlinkEmailFromTicket(tLinked, { linkId: link.id });
    assert.equal(getTicketLinkedEmails(byId).length, 0);

    const byEmail = unlinkEmailFromTicket(tLinked, { emails: [email], mailboxId: "personal", activeFolder: "INBOX" });
    assert.equal(getTicketLinkedEmails(byEmail).length, 0);
  });

  it("builds clickable hashes for both directions", () => {
    const link = buildLinkedEmail(
      { uid: 123, message_id: "<x@y>", subject: "Hi", isSent: true },
      { mailboxId: "mb-1" },
    );
    assert.equal(
      buildLinkedEmailHash(link),
      "email?channel=mb-1&uid=123&folder=Sent&msgid=%3Cx%40y%3E",
    );
    assert.equal(buildTicketHash("tck/42"), "tickets/tck%2F42");
  });
});
