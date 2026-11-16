import assert from "node:assert/strict";
import test from "node:test";
import {
  MICROSOFT_PROVIDER,
  isMicrosoftProfile,
  microsoftProfileAfterSignIn,
  microsoftProfileNeedsReconnect,
  readSignInMessage,
} from "./microsoftMail.ts";
import { draftFromMailbox, emptyMailboxDraft, isMicrosoftMailbox, mailboxPayload, type CompanyMailbox } from "./companyMailboxes.ts";

test("a profile is a Microsoft 365 one by its provider, nothing else", () => {
  assert.equal(isMicrosoftProfile({ provider: MICROSOFT_PROVIDER }), true);
  assert.equal(isMicrosoftProfile({ provider: "exchange" }), false);
  assert.equal(isMicrosoftProfile({ provider: "smtp", graphAccount: "a@b.sk" }), false);
  assert.equal(isMicrosoftProfile(null), false);
});

test("a signed-in profile whose token is gone has to sign in again", () => {
  const signedIn = { provider: MICROSOFT_PROVIDER, isValidated: true, graphAccount: "a@b.sk", graphRefreshToken: "********" };
  assert.equal(microsoftProfileNeedsReconnect(signedIn), false);
  // the server clears the token when Microsoft refuses it; it then arrives without its mask
  assert.equal(microsoftProfileNeedsReconnect({ ...signedIn, graphRefreshToken: "" }), true);
  assert.equal(microsoftProfileNeedsReconnect({ provider: MICROSOFT_PROVIDER, isValidated: true }), true);
  // never signed in, or reset: that is "not connected", not "reconnect"
  assert.equal(microsoftProfileNeedsReconnect({ provider: MICROSOFT_PROVIDER, isValidated: false }), false);
  // an IMAP mailbox has no token and never needs one
  assert.equal(microsoftProfileNeedsReconnect({ provider: "smtp", isValidated: true }), false);
});

test("the profile kept after a sign-in names the account and holds a mask, never a token", () => {
  assert.deepEqual(microsoftProfileAfterSignIn("  Jana@Laminam.SK "), {
    provider: "microsoft365",
    graphAccount: "jana@laminam.sk",
    graphRefreshToken: "********",
    isValidated: true,
  });
});

test("only the sign-in window's own message is read", () => {
  assert.deepEqual(readSignInMessage({ type: "ccrm-graph-oauth", ok: true, account: "a@b.sk" }), { ok: true, account: "a@b.sk", error: undefined });
  assert.deepEqual(readSignInMessage({ type: "ccrm-graph-oauth", ok: false, error: "no" }), { ok: false, account: undefined, error: "no" });
  // "ok" has to be exactly true: a message that merely looks truthy connects nothing
  assert.equal(readSignInMessage({ type: "ccrm-graph-oauth", ok: "yes" })?.ok, false);
  assert.equal(readSignInMessage({ type: "something-else", ok: true }), null);
  assert.equal(readSignInMessage("ccrm-graph-oauth"), null);
  assert.equal(readSignInMessage(null), null);
});

const m365Box: CompanyMailbox = {
  id: "cmb-9",
  name: "Info",
  address: "info@laminam.sk",
  isActive: true,
  ownerUserId: null,
  backfillSince: null,
  settings: { provider: "microsoft365" },
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  folders: [],
  connected: true,
  account: "admin@laminam.sk",
};

test("a Microsoft 365 company mailbox is saved with its type only: no server, no password", () => {
  assert.equal(isMicrosoftMailbox(m365Box), true);
  const payload = mailboxPayload(draftFromMailbox(m365Box));
  // The Exchange connector signed in with Microsoft: its type and who it is assigned to, nothing else.
  assert.deepEqual(payload.settings, { connectorType: "exchange", provider: "microsoft365", userIds: [] });
  assert.equal(payload.connectorType, "exchange");
  assert.equal(payload.id, "cmb-9");
  assert.equal(payload.address, "info@laminam.sk");
});

test("an IMAP company mailbox is sent as before", () => {
  const draft = emptyMailboxDraft();
  draft.name = "Steel";
  draft.address = "Steel@X.sk";
  draft.settings.imapHost = "imap.x.sk";
  draft.settings.imapUsername = "steel@x.sk";
  draft.settings.imapPassword = "s3cret";
  const payload = mailboxPayload(draft);
  assert.equal(isMicrosoftMailbox(draft), false);
  assert.equal(payload.settings.provider, "smtp");
  assert.equal(payload.settings.imapPassword, "s3cret");
  assert.equal(payload.settings.smtpUsername, "steel@x.sk");
  assert.equal(payload.settings.smtpPassword, undefined);
  assert.equal(payload.address, "steel@x.sk");
  assert.equal(payload.id, undefined);
});
