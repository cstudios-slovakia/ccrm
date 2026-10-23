import assert from "node:assert/strict";
import test from "node:test";
import {
  SECRET_MASK,
  backlogSummary,
  draftFromMailbox,
  emptyMailboxDraft,
  mailboxPayload,
  type CompanyMailbox,
} from "./companyMailboxes.ts";

const stored: CompanyMailbox = {
  id: "cmb-1",
  name: "Info",
  address: "info@villatesta.sk",
  isActive: true,
  ownerUserId: null,
  backfillSince: "2025-06-01",
  settings: { provider: "smtp", imapHost: "imap.websupport.sk", imapPort: "993", imapSecure: "ssl", imapUsername: "info@villatesta.sk", imapPassword: SECRET_MASK },
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  folders: [],
};

test("a stored mailbox opens in the form with its password still masked", () => {
  const draft = draftFromMailbox(stored);
  assert.equal(draft.settings.imapPassword, SECRET_MASK);
  assert.equal(draft.settings.smtpPort, "465", "fields the server did not send take the form defaults");
  assert.equal(draft.backfillSince, "2025-06-01");
  assert.equal(draft.ownerUserId, "");
});

test("a masked password is sent back as it is, so the server keeps the stored one", () => {
  const payload = mailboxPayload(draftFromMailbox(stored));
  assert.equal(payload.settings.imapPassword, SECRET_MASK);
  assert.equal(payload.id, "cmb-1");
});

test("a blank password is left out of the request instead of blanking the stored one", () => {
  const draft = draftFromMailbox(stored);
  draft.settings.imapPassword = "";
  draft.settings.smtpPassword = "";
  const payload = mailboxPayload(draft);
  assert.equal("imapPassword" in payload.settings, false);
  assert.equal("smtpPassword" in payload.settings, false);
});

test("a blank SMTP login follows the IMAP one, and the address is trimmed and lower-cased", () => {
  const draft = emptyMailboxDraft();
  draft.name = "  Steel ";
  draft.address = " STEEL@Villatesta.SK ";
  draft.settings.imapUsername = "steel@villatesta.sk";
  draft.settings.imapPassword = "pw";
  const payload = mailboxPayload(draft);
  assert.equal(payload.name, "Steel");
  assert.equal(payload.address, "steel@villatesta.sk");
  assert.equal(payload.settings.smtpUsername, "steel@villatesta.sk");
  assert.equal(payload.id, undefined, "a new mailbox has no id");
});

test("filing progress reads from the folders: nothing yet, in progress, caught up", () => {
  const folder = (over: object) => ({ folder: "INBOX", lastUid: 5, backfillDone: false, filedCount: 2, lastRunAt: null, lastError: null, ...over });
  assert.deepEqual(backlogSummary([]), { filed: 0, started: false, caughtUp: false });
  assert.deepEqual(backlogSummary([folder({}), folder({ folder: "Sent", backfillDone: true, filedCount: 3 })]), { filed: 5, started: true, caughtUp: false });
  assert.deepEqual(backlogSummary([folder({ backfillDone: true }), folder({ folder: "Sent", backfillDone: true })]), { filed: 4, started: true, caughtUp: true });
});
