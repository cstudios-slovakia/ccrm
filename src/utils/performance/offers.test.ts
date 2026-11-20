import test from "node:test";
import assert from "node:assert/strict";
import type { InvoiceOffer } from "../../types/index.ts";
import { DEFAULT_OFFER_STATUS_DEFS } from "../offerStatuses.ts";
import { buildPeriod } from "./period.ts";
import { computeOfferSuccess } from "./offers.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const TODAY = day(2026, 11, 20);
const period = buildPeriod("month", day(2026, 11, 1), day(2026, 11, 20), TODAY);
const all = buildPeriod("all", null, null, TODAY);

const offer = (over: Partial<InvoiceOffer>): InvoiceOffer =>
  ({ id: "o", type: "price_offer", status: "sent", issuedAt: "2026-11-02", ...over }) as unknown as InvoiceOffer;
const run = (offers: InvoiceOffer[], opts = {}, p = period) => computeOfferSuccess(offers, DEFAULT_OFFER_STATUS_DEFS, p, TODAY, opts);

test("empty input: nothing closed, no rate", () => {
  assert.deepEqual(run([]), { ratePct: null, accepted: 0, closed: 0 });
});

test("accepted and rejected are counted by the day the status changed", () => {
  const r = run([
    offer({ id: "1", status: "approved", statusChangedAt: "2026-11-05" }),
    offer({ id: "2", status: "approved", statusChangedAt: "2026-11-06" }),
    offer({ id: "3", status: "rejected", statusChangedAt: "2026-11-07" }),
    offer({ id: "4", status: "rejected", statusChangedAt: "2026-11-08" }),
  ]);
  assert.deepEqual(r, { ratePct: 50, accepted: 2, closed: 4 });
});

test("falls back to issuedAt, then createdAt, when the status change was never stamped", () => {
  assert.equal(run([offer({ status: "approved", statusChangedAt: null, issuedAt: "2026-11-09" })]).closed, 1);
  assert.equal(run([offer({ status: "approved", statusChangedAt: null, issuedAt: "", createdAt: "2026-11-09 10:00" })]).closed, 1);
});

test("period boundary: first and last day in, day before and after out", () => {
  const at = (statusChangedAt: string) => run([offer({ status: "approved", statusChangedAt })]).closed;
  assert.equal(at("2026-11-01"), 1);
  assert.equal(at("2026-11-20"), 1);
  assert.equal(at("2026-10-31"), 0);
  assert.equal(at("2026-11-21"), 0);
});

test("only price offers count; proformas and invoices are ignored", () => {
  const r = run([
    offer({ id: "1", status: "approved", statusChangedAt: "2026-11-05" }),
    offer({ id: "2", type: "invoice", status: "approved", statusChangedAt: "2026-11-05" }),
    offer({ id: "3", type: "proforma", status: "rejected", statusChangedAt: "2026-11-05" }),
  ]);
  assert.deepEqual(r, { ratePct: 100, accepted: 1, closed: 1 });
});

test("expired: sent and past validUntil, by validUntil, switchable", () => {
  const lapsed = offer({ id: "1", status: "sent", validUntil: "2026-11-10" });
  assert.deepEqual(run([lapsed]), { ratePct: 0, accepted: 0, closed: 1 });
  assert.equal(run([lapsed], { countExpired: false }).closed, 0);

  // Still valid today and a draft never expire.
  assert.equal(run([offer({ status: "sent", validUntil: "2026-11-20" })]).closed, 0);
  assert.equal(run([offer({ status: "draft", validUntil: "2026-11-10" })]).closed, 0);
  // Expired before the period is not this period's.
  assert.equal(run([offer({ status: "sent", validUntil: "2026-10-31" })]).closed, 0);
  assert.equal(run([offer({ status: "sent", validUntil: "2026-10-31" })], {}, all).closed, 1);
});

test("cancelled is out by default and switchable in", () => {
  const withdrawn = offer({ status: "cancelled", statusChangedAt: "2026-11-05" });
  assert.equal(run([withdrawn]).closed, 0);
  assert.deepEqual(run([withdrawn], { countCancelled: true }), { ratePct: 0, accepted: 0, closed: 1 });
});

test("zero denominator: only open offers means no rate", () => {
  assert.equal(run([offer({ status: "sent", validUntil: "2027-01-01" })]).ratePct, null);
});

test("all time has no period bounds", () => {
  const r = run([offer({ status: "approved", statusChangedAt: "2020-01-01" })], {}, all);
  assert.equal(r.accepted, 1);
});
