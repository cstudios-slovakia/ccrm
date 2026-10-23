import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INVOICE_STATUS_DEFS,
  DEFAULT_OFFER_STATUS_DEFS,
  defaultOfferStatus,
  firstOfferStatusOf,
  isLostOfferStatus,
  issuedInvoiceStatus,
  isWonOfferStatus,
  normalizeInvoiceStatusDefs,
  normalizeOfferStatusDefs,
  offerStatusBadgeStyle,
  offerStatusGroup,
  offerStatusKeyFor,
  offerStatusLabel,
  offerStatusOptions,
  offerWinStats,
  type OfferStatusDef,
} from "./offerStatuses.ts";

const en = (e: string) => e;
const sk = (_e: string, s: string) => s;
const keys = (defs: readonly OfferStatusDef[]) => defs.map((d) => d.key);

test("nothing stored, junk and an emptied list all give the six built-ins", () => {
  for (const raw of [undefined, null, "x", 3, {}, [], [null, 4, "a"], [{ key: "", group: "draft" }]]) {
    assert.deepEqual(keys(normalizeOfferStatusDefs(raw)), ["draft", "sent", "approved", "invoiced", "rejected", "cancelled"]);
  }
});

test("the built-ins keep the keys offers already store, and group the way the code used to read them", () => {
  const g = (k: string) => offerStatusGroup(k);
  assert.equal(g("draft"), "draft");
  assert.equal(g("sent"), "open");
  assert.equal(g("approved"), "won");
  assert.equal(g("invoiced"), "won");
  assert.equal(g("rejected"), "lost");
  assert.equal(g("cancelled"), "cancelled");
});

test("a list nobody edited reads like a normalised stored copy of itself", () => {
  assert.deepEqual(normalizeOfferStatusDefs(DEFAULT_OFFER_STATUS_DEFS), [...DEFAULT_OFFER_STATUS_DEFS]);
});

test("duplicates, over-long keys, unknown groups and bad colours are cleaned up", () => {
  const out = normalizeOfferStatusDefs([
    { key: "draft", color: "#64748b", group: "draft" },
    { key: "draft", color: "#000000", group: "won" },
    { key: "x".repeat(51), group: "open" },
    { key: "prepared", group: "nonsense", color: "red" },
    { key: "approved", group: "bogus", color: "nope" },
  ]);
  assert.deepEqual(keys(out), ["draft", "prepared", "approved"]);
  const prepared = out.find((d) => d.key === "prepared")!;
  assert.equal(prepared.group, "open");
  assert.equal(prepared.color, "#6366f1");
  const approved = out.find((d) => d.key === "approved")!;
  assert.equal(approved.group, "won");
  assert.equal(approved.color, "#10b981");
});

test("statuses are kept in group order whatever order they arrive in", () => {
  const out = normalizeOfferStatusDefs([
    { key: "won1", color: "#10b981", group: "won" },
    { key: "d1", color: "#64748b", group: "draft" },
    { key: "o1", color: "#3b82f6", group: "open" },
    { key: "d2", color: "#64748b", group: "draft" },
  ]);
  assert.deepEqual(keys(out), ["d1", "d2", "o1", "won1"]);
});

test("a list with no draft status has nowhere to start and falls back to the built-ins", () => {
  const out = normalizeOfferStatusDefs([{ key: "sent", color: "#3b82f6", group: "open" }]);
  assert.equal(out.length, DEFAULT_OFFER_STATUS_DEFS.length);
  // the legacy "invoiced" is never a place to start either
  assert.equal(
    normalizeOfferStatusDefs([{ key: "invoiced", group: "draft" }, { key: "sent", group: "open" }]).length,
    DEFAULT_OFFER_STATUS_DEFS.length,
  );
});

test("a renamed built-in keeps its key and group; the label is trimmed and an empty one is dropped", () => {
  const out = normalizeOfferStatusDefs([
    { key: "draft", label: "  Vypracovanie  ", color: "#64748b", group: "draft" },
    { key: "sent", label: "   ", color: "#3b82f6", group: "open" },
  ]);
  assert.equal(out[0].label, "Vypracovanie");
  assert.equal("label" in out[1], false);
});

test("legacy survives a round trip and is forced on for the built-in invoiced", () => {
  const out = normalizeOfferStatusDefs([
    { key: "draft", group: "draft" },
    { key: "invoiced", group: "won" },
    { key: "old", group: "won", legacy: true },
    { key: "new", group: "won", legacy: "yes" },
  ]);
  assert.equal(out.find((d) => d.key === "invoiced")!.legacy, true);
  assert.equal(out.find((d) => d.key === "old")!.legacy, true);
  assert.equal(out.find((d) => d.key === "new")!.legacy, undefined);
});

test("labels: a name from settings wins, a built-in speaks the UI language, an unknown key is shown raw", () => {
  const defs = normalizeOfferStatusDefs([
    { key: "draft", label: "Precenenie", color: "#64748b", group: "draft" },
    { key: "sent", color: "#3b82f6", group: "open" },
  ]);
  assert.equal(offerStatusLabel("draft", en, defs), "Precenenie");
  assert.equal(offerStatusLabel("sent", sk, DEFAULT_OFFER_STATUS_DEFS.map((d) => ({ ...d }))), "Odoslaná");
  assert.equal(offerStatusLabel("something_else", en, defs), "something_else");
  assert.equal(offerStatusLabel(undefined, en, defs), "");
});

test("an unknown key has no group and a neutral badge", () => {
  assert.equal(offerStatusGroup("gone"), null);
  assert.equal(isWonOfferStatus("gone"), false);
  assert.equal(isLostOfferStatus("gone"), false);
  assert.equal(offerStatusBadgeStyle("gone").color, "#94a3b8");
});

test("a custom status counts through its group, not its key", () => {
  const defs = normalizeOfferStatusDefs([
    { key: "draft", group: "draft" },
    { key: "closed_won", group: "won", color: "#10b981" },
    { key: "closed_lost", group: "lost", color: "#f43f5e" },
    { key: "repricing", group: "open", color: "#f59e0b" },
  ]);
  assert.equal(isWonOfferStatus("closed_won", defs), true);
  assert.equal(isLostOfferStatus("closed_lost", defs), true);
  const stats = offerWinStats(
    [{ status: "closed_won" }, { status: "closed_won" }, { status: "closed_lost" }, { status: "repricing" }, { status: "draft" }, { status: "mystery" }],
    defs,
  );
  assert.deepEqual(stats, { won: 2, decided: 3, winRate: 67 });
});

test("the win rate on the built-ins is the one the view always showed", () => {
  const stats = offerWinStats([{ status: "approved" }, { status: "invoiced" }, { status: "rejected" }, { status: "cancelled" }, { status: "draft" }, { status: "sent" }]);
  assert.deepEqual(stats, { won: 2, decided: 3, winRate: 67 });
  assert.deepEqual(offerWinStats([]), { won: 0, decided: 0, winRate: 0 });
});

test("set by group: the first non-legacy status of the group, and a new offer starts in draft", () => {
  assert.equal(firstOfferStatusOf("won"), "approved");
  assert.equal(firstOfferStatusOf("open"), "sent");
  const defs = normalizeOfferStatusDefs([
    { key: "prep", group: "draft" },
    { key: "inv_only", group: "won", legacy: true },
  ]);
  assert.equal(firstOfferStatusOf("won", defs), "inv_only", "a group with only a legacy status still resolves");
  assert.equal(firstOfferStatusOf("lost", defs), undefined);
  assert.equal(defaultOfferStatus(defs), "prep");
});

test("the picker leaves the legacy status out, unless the offer itself carries it", () => {
  const plain = offerStatusOptions(en).map((o) => o.value);
  assert.deepEqual(plain, ["draft", "sent", "approved", "rejected", "cancelled"]);
  assert.deepEqual(offerStatusOptions(en, DEFAULT_OFFER_STATUS_DEFS, "invoiced").map((o) => o.value), [
    "draft", "sent", "approved", "invoiced", "rejected", "cancelled",
  ]);
});

test("the picker keeps a current value the list does not know, so it never vanishes from its own dropdown", () => {
  const options = offerStatusOptions(en, DEFAULT_OFFER_STATUS_DEFS, "imported_state");
  assert.equal(options.at(-1)?.value, "imported_state");
  assert.equal(options.at(-1)?.label, "imported_state");
});

test("generated keys are ASCII snake case and never collide", () => {
  assert.equal(offerStatusKeyFor("Cenová ponuka uzavretá", []), "cenova_ponuka_uzavreta");
  assert.equal(offerStatusKeyFor("Sent", ["sent"]), "sent_2");
  assert.equal(offerStatusKeyFor("Sent", ["sent", "sent_2"]), "sent_3");
  assert.equal(offerStatusKeyFor("???", []), "status");
  assert.ok(offerStatusKeyFor("a".repeat(120), []).length <= 50);
});

// ── invoices and proformas: a list of their own ──────────────────────────────

test("an invoice list nobody edited is the six statuses invoices always had, with invoiced selectable", () => {
  for (const raw of [undefined, null, [], "x"]) {
    assert.deepEqual(keys(normalizeInvoiceStatusDefs(raw)), ["draft", "sent", "invoiced", "approved", "rejected", "cancelled"]);
  }
  // unlike on an offer, `invoiced` is a real choice here: what a paid order's invoice starts in
  assert.deepEqual(offerStatusOptions(en, DEFAULT_INVOICE_STATUS_DEFS).map((o) => o.value), [
    "draft", "sent", "invoiced", "approved", "rejected", "cancelled",
  ]);
  assert.equal(firstOfferStatusOf("won", DEFAULT_INVOICE_STATUS_DEFS), "invoiced");
  assert.equal(firstOfferStatusOf("open", DEFAULT_INVOICE_STATUS_DEFS), "sent");
});

test("the invoice built-ins group the way the finance bridge used to read their keys", () => {
  const g = (k: string) => offerStatusGroup(k, DEFAULT_INVOICE_STATUS_DEFS);
  assert.equal(g("cancelled"), "cancelled");
  assert.equal(g("rejected"), "lost");
  assert.equal(g("invoiced"), "won");
  assert.equal(g("sent"), "open");
});

test("`invoiced` is named for what it is on an invoice, and for what it was on an offer", () => {
  assert.equal(offerStatusLabel("invoiced", en, DEFAULT_INVOICE_STATUS_DEFS), "Invoiced");
  assert.equal(offerStatusLabel("invoiced", sk, DEFAULT_INVOICE_STATUS_DEFS), "Vyfakturovaná");
  assert.equal(offerStatusLabel("invoiced", en, DEFAULT_OFFER_STATUS_DEFS), "Approved (invoiced)");
});

test("an edited invoice list keeps its custom statuses and the invoice built-in colours", () => {
  const defs = normalizeInvoiceStatusDefs([
    { key: "draft" },
    { key: "paid", label: "Zaplatená", color: "#00ff00", group: "won" },
    { key: "invoiced", color: "nonsense" },
  ]);
  assert.deepEqual(keys(defs), ["draft", "paid", "invoiced"]);
  assert.equal(defs.find((d) => d.key === "invoiced")?.color, "#10b981");
  assert.equal(defs.find((d) => d.key === "invoiced")?.legacy, undefined);
  assert.equal(offerStatusLabel("paid", en, defs), "Zaplatená");
});

test("an invoice list with nowhere to start falls back to the invoice built-ins, not the offer ones", () => {
  const defs = normalizeInvoiceStatusDefs([{ key: "sent", group: "open" }]);
  assert.deepEqual(keys(defs), ["draft", "sent", "invoiced", "approved", "rejected", "cancelled"]);
});

test("an invoice issued from an order starts settled when the order is paid, else waiting for the money", () => {
  assert.equal(issuedInvoiceStatus(true), "invoiced");
  assert.equal(issuedInvoiceStatus(false), "sent");
  const custom = normalizeInvoiceStatusDefs([
    { key: "prep", group: "draft" },
    { key: "issued", label: "Vystavená", group: "open" },
    { key: "paid", label: "Zaplatená", group: "won" },
  ]);
  assert.equal(issuedInvoiceStatus(true, custom), "paid");
  assert.equal(issuedInvoiceStatus(false, custom), "issued");
  // nothing of the group in the list: the keys invoices always used
  const bare = normalizeInvoiceStatusDefs([{ key: "prep", group: "draft" }]);
  assert.equal(issuedInvoiceStatus(true, bare), "invoiced");
  assert.equal(issuedInvoiceStatus(false, bare), "sent");
});
