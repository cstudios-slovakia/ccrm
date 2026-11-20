import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialCategory, FinancialRecord } from "../types";
import {
  addDaysIso, attributeNewsletter, categoryCost, financeForPeriod, financeRevenue, leadsByChannel,
  monthColumns, normalizeMarketingRoiConfig, roiPct, type AttributionInvoice, type NewsletterSend,
} from "./marketingRoi.ts";

const cat = (id: string, type: "income" | "expense", parentId: string | null = null): FinancialCategory =>
  ({ id, type, name: id, parentId, level: parentId ? 2 : 1 });

const categories = [
  cat("inc", "income"), cat("mkt", "expense"), cat("mkt-nl", "expense", "mkt"), cat("mkt-soc", "expense", "mkt"), cat("rent", "expense"),
];

test("config: unknown channels and blank ids are dropped, the window is clamped", () => {
  const c = normalizeMarketingRoiConfig({
    newsletterCostCategoryIds: ["a", "a", "", 3],
    sourceChannels: { " Facebook ": "social", web: "tv" },
    newsletterWindowDays: 9999,
  });
  assert.deepEqual(c.newsletterCostCategoryIds, ["a"]);
  assert.deepEqual(c.sourceChannels, { facebook: "social" });
  assert.equal(c.newsletterWindowDays, 365);
  assert.equal(normalizeMarketingRoiConfig(null).newsletterWindowDays, 30);
});

test("roi is null without a cost", () => {
  assert.equal(roiPct(500, 0), null);
  assert.equal(roiPct(300, 100), 200);
  assert.equal(roiPct(50, 100), -50);
});

test("month columns are keyed YYYY-MM and cut to the range", () => {
  const cols = monthColumns("2026-01-15", "2026-03-10", "2026-02-01");
  assert.deepEqual(cols.map((c) => [c.id, c.startIso, c.endIso, c.isFuture]), [
    ["2026-01", "2026-01-15", "2026-01-31", false],
    ["2026-02", "2026-02-01", "2026-02-28", false],
    ["2026-03", "2026-03-01", "2026-03-10", true],
  ]);
  assert.equal(addDaysIso("2026-12-20", 30), "2027-01-19");
});

test("simplified mode: revenue and category cost come from the table, sub-categories roll up once", () => {
  const input = {
    mode: "simplified" as const,
    records: [],
    categories,
    simplifiedTable: { "inc:2026-01": "1000", "inc:2026-02": "500+500", "mkt-nl:2026-01": "100", "mkt-soc:2026-02": "40", "rent:2026-01": "300", "inc:2027-01": "999" },
    todayIso: "2026-11-20",
  };
  const agg = financeForPeriod(input, { startIso: null, endIso: null });
  assert.deepEqual(financeRevenue(agg), { paid: 2000, expected: 0 });
  assert.equal(categoryCost(agg, categories, ["mkt-nl"]), 100);
  assert.equal(categoryCost(agg, categories, ["mkt", "mkt-nl"]), 140, "parent already holds the child");
  const feb = financeForPeriod(input, { startIso: "2026-02-01", endIso: "2026-02-28" });
  assert.equal(financeRevenue(feb).paid, 1000);
});

test("ledger mode: paid income is revenue, unpaid income is expected", () => {
  const rec = (id: string, type: "income" | "expense", categoryId: string, amount: number, status: string, issueDate: string) =>
    ({ id, type, title: id, categoryId, amountPlanned: amount, amountReal: status === "paid" ? amount : 0, status, issueDate, paidDate: status === "paid" ? issueDate : null, isRecurring: false }) as unknown as FinancialRecord;
  const agg = financeForPeriod(
    {
      mode: "connected",
      records: [rec("1", "income", "inc", 800, "paid", "2026-03-02"), rec("2", "income", "inc", 200, "pending", "2026-03-05"), rec("3", "expense", "mkt-nl", 50, "paid", "2026-03-03")],
      categories, simplifiedTable: {}, todayIso: "2026-03-20",
    },
    { startIso: "2026-03-01", endIso: "2026-03-31" },
  );
  assert.equal(financeRevenue(agg).paid, 800);
  assert.equal(categoryCost(agg, categories, ["mkt-nl"]), 50);
});

test("no finance data: nothing to aggregate", () => {
  assert.equal(financeForPeriod({ mode: "connected", records: [], categories, simplifiedTable: {}, todayIso: "2026-11-20" }, { startIso: null, endIso: null }), null);
});

const invoice = (id: string, issuedAt: string, extra: Partial<AttributionInvoice> = {}): AttributionInvoice =>
  ({ id, type: "invoice", status: "sent", issuedAt, totalPrice: 100, ...extra });

test("newsletter: an invoice inside the window after the send counts, before or after it does not", () => {
  const sends: NewsletterSend[] = [{ id: "nlc-1", name: "Spring", sentAt: "2026-03-01T09:00:00Z", recipients: [
    { leadId: "client-a", email: "a@x.sk", sentAt: "2026-03-01T09:00:00Z" },
    { leadId: "client-b", email: "b@x.sk", sentAt: "2026-03-01T09:00:00Z" },
  ] }];
  const invoices = [
    invoice("in-window", "2026-03-20", { clientId: "client-a" }),
    invoice("same-day", "2026-03-01", { clientId: "client-a" }),
    invoice("too-late", "2026-04-15", { clientId: "client-b" }),
    invoice("by-email", "2026-03-10", { clientEmail: "Info@y.sk, B@x.sk" }),
    invoice("offer", "2026-03-10", { clientId: "client-a", type: "price_offer" }),
    invoice("cancelled", "2026-03-10", { clientId: "client-a", status: "cancelled" }),
  ];
  const r = attributeNewsletter(sends, invoices, [], undefined, 30, { startIso: null, endIso: null });
  assert.equal(r.invoices, 2);
  assert.equal(r.revenue, 200);
  assert.equal(r.recipients, 2);
});

test("newsletter: a lead's invoice counts for its client, and only the latest campaign gets it", () => {
  const touch = (leadId: string, sentAt: string) => ({ leadId, email: "", sentAt });
  const sends: NewsletterSend[] = [
    { id: "nlc-1", name: "One", sentAt: "2026-05-01", recipients: [touch("client-a", "2026-05-01")] },
    { id: "nlc-2", name: "Two", sentAt: "2026-05-10", recipients: [touch("client-a", "2026-05-10")] },
  ];
  const leads = [{ id: "lead-9", clientId: "client-a" }];
  const r = attributeNewsletter(sends, [invoice("i", "2026-05-12", { leadId: "lead-9" })], leads, undefined, 30, { startIso: null, endIso: null });
  assert.deepEqual(r.campaigns.map((c) => [c.id, c.invoices]), [["nlc-1", 0], ["nlc-2", 1]]);
});

test("newsletter: only campaigns sent in the period are evaluated", () => {
  const sends: NewsletterSend[] = [{ id: "nlc-1", name: "Old", sentAt: "2025-12-01", recipients: [{ leadId: "client-a", email: "", sentAt: "2025-12-01" }] }];
  const r = attributeNewsletter(sends, [invoice("i", "2025-12-05", { clientId: "client-a" })], [], undefined, 30, { startIso: "2026-01-01", endIso: null });
  assert.equal(r.campaigns.length, 0);
  assert.equal(r.revenue, 0);
});

test("lead-source channels count leads and won value per channel", () => {
  const config = normalizeMarketingRoiConfig({ sourceChannels: { facebook: "social", instagram: "social", "google ads": "google_ads" } });
  const out = leadsByChannel(
    [
      { source: "Facebook", status: "accepted", value: 400 },
      { source: "instagram", status: "lost", value: 900 },
      { source: "Google Ads", status: "new", value: 50 },
      { source: "website (sk)", status: "accepted", value: 1000 },
    ],
    config,
    (s) => s === "accepted",
  );
  assert.deepEqual(out.social, { leads: 2, won: 1, wonValue: 400 });
  assert.deepEqual(out.google_ads, { leads: 1, won: 0, wonValue: 0 });
  assert.deepEqual(out.meta_ads, { leads: 0, won: 0, wonValue: 0 });
});

test("newsletter: a month view credits the same campaign as the all-time view (no double counting)", () => {
  const touch = (sentAt: string) => ({ leadId: "client-a", email: "", sentAt });
  const sends: NewsletterSend[] = [
    { id: "nov", name: "November", sentAt: "2026-11-20", recipients: [touch("2026-11-20")] },
    { id: "dec", name: "December", sentAt: "2026-12-01", recipients: [touch("2026-12-01")] },
  ];
  const inv = [invoice("i", "2026-12-05", { clientId: "client-a" })];
  const nov = attributeNewsletter(sends, inv, [], undefined, 30, { startIso: "2026-11-01", endIso: "2026-11-30" });
  const dec = attributeNewsletter(sends, inv, [], undefined, 30, { startIso: "2026-12-01", endIso: "2026-12-31" });
  const all = attributeNewsletter(sends, inv, [], undefined, 30, { startIso: null, endIso: null });
  assert.equal(nov.revenue, 0, "the newer December campaign wins the invoice even when it is outside the month");
  assert.equal(dec.revenue, 100);
  assert.equal(all.revenue, nov.revenue + dec.revenue);
});

test("finance: a mistyped ancient date does not stretch 'all time' over centuries", () => {
  const rec = { id: "x", type: "income", title: "x", categoryId: "inc", amountPlanned: 5, amountReal: 5, status: "paid", issueDate: "0202-03-01", paidDate: "0202-03-01", isRecurring: false } as unknown as FinancialRecord;
  const ok = { ...rec, id: "y", issueDate: "2026-02-10", paidDate: "2026-02-10" } as FinancialRecord;
  const agg = financeForPeriod({ mode: "connected", records: [rec, ok], categories, simplifiedTable: {}, todayIso: "2026-03-15" }, { startIso: null, endIso: null });
  assert.ok(agg);
  assert.ok(Object.keys(agg.totalIncomesByCol).length <= 2);
  assert.equal(financeRevenue(agg).paid, 5);
});
