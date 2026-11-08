import assert from "node:assert/strict";
import test from "node:test";
import {
  BOTMAN_CONNECTOR_TYPES,
  BOTMAN_DRIVER_SPECS,
  SECRET_MASK,
  backlogSummary,
  draftFromMailbox,
  emptyMailboxDraft,
  getBotManWebhookUrl,
  getBotManWidgetSnippet,
  inferConnectorType,
  isBotManConnector,
  isMessagingConnector,
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

test("gmail preset fills imap.gmail.com and smtp.gmail.com automatically and syncs multi-user userIds", () => {
  const draft = emptyMailboxDraft("gmail");
  draft.name = "Gmail Sales";
  draft.address = "Sales@Gmail.com";
  draft.userIds = ["u-erik", "u-peti", "u-erik"];
  draft.settings.imapPassword = "app-password-16";
  const payload = mailboxPayload(draft);
  assert.equal(payload.connectorType, "gmail");
  assert.equal(payload.settings.imapHost, "imap.gmail.com");
  assert.equal(payload.settings.smtpHost, "smtp.gmail.com");
  assert.equal(payload.settings.imapUsername, "sales@gmail.com");
  assert.equal(payload.settings.smtpUsername, "sales@gmail.com");
  assert.deepEqual(payload.userIds, ["u-erik", "u-peti"]);
  assert.equal(payload.ownerUserId, "u-erik");
});

test("inferConnectorType identifies all external connector types including BotMan drivers accurately", () => {
  assert.equal(inferConnectorType({ imapHost: "imap.gmail.com" }), "gmail");
  assert.equal(inferConnectorType({ provider: "exchange" }), "exchange");
  assert.equal(inferConnectorType({ connectorType: "whatsapp" }), "whatsapp");
  assert.equal(inferConnectorType({}, "claude:team-max"), "claude");
  assert.equal(inferConnectorType({}, "antigravity:workspace"), "antigravity");
  assert.equal(inferConnectorType({}, "chatgpt:plus"), "chatgpt");
  assert.equal(inferConnectorType({ imapHost: "imap.websupport.sk" }), "smtp");

  for (const bm of BOTMAN_CONNECTOR_TYPES) {
    assert.equal(inferConnectorType({ connectorType: bm }), bm);
    assert.equal(inferConnectorType({}, `${bm}:bot-handle`), bm);
    assert.equal(isBotManConnector(bm), true);
    assert.equal(isMessagingConnector(bm), true);
  }
  assert.equal(isMessagingConnector("whatsapp"), true);
  assert.equal(isMessagingConnector("gmail"), false);
  assert.equal(isBotManConnector("whatsapp"), false);
});

test("every BotMan connector spec has localized EN/SK/HU setup guides, fields, and secret stripping", () => {
  for (const bm of BOTMAN_CONNECTOR_TYPES) {
    const spec = BOTMAN_DRIVER_SPECS[bm];
    assert.ok(spec, `Missing BOTMAN_DRIVER_SPECS entry for ${bm}`);
    assert.ok(spec.driverClass.startsWith("BotMan\\Drivers\\"));
    assert.ok(spec.portalUrl.startsWith("https://"));
    assert.ok(spec.setupSteps.en.length >= 3);
    assert.ok(spec.setupSteps.sk.length >= 3);
    assert.ok(spec.setupSteps.hu.length >= 3);
    assert.ok(spec.fields.length >= 1);

    const draft = emptyMailboxDraft(bm);
    draft.name = `${bm} Bot`;
    draft.settings.botmanToken = "";
    const payloadEmpty = mailboxPayload(draft);
    assert.equal("botmanToken" in payloadEmpty.settings, false, "blank botmanToken is stripped");

    draft.settings.botmanToken = SECRET_MASK;
    const payloadMasked = mailboxPayload(draft);
    assert.equal(payloadMasked.settings.botmanToken, SECRET_MASK, "masked botmanToken is preserved");
  }

  assert.match(getBotManWebhookUrl("cmb-42", "telegram"), /botman_webhook\.php\?connector_id=cmb-42&driver=telegram$/);
  assert.match(getBotManWidgetSnippet("cmb-99"), /botman_webhook\.php\?widget=js&connector_id=cmb-99/);
});
