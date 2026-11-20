import test from "node:test";
import assert from "node:assert/strict";
import type { FinancialRecord, InvoiceOffer, Lead } from "../../types/index.ts";
import { DEFAULT_INVOICE_STATUS_DEFS } from "../offerStatuses.ts";
import { buildPeriod } from "./period.ts";
import { computeDso, type DsoInput } from "./dso.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const TODAY = day(2026, 11, 20);
const period = buildPeriod("month", day(2026, 11, 1), day(2026, 11, 20), TODAY); // previous: 1-20 Oct
const all = buildPeriod("all", null, null, TODAY);

const invoice = (id: string, issuedAt: string, over: Partial<InvoiceOffer> = {}): InvoiceOffer =>
  ({ id, type: "invoice", status: "sent", issuedAt, leadId: "", clientId: null, clientName: "Anon", totalPrice: 100, ...over }) as unknown as InvoiceOffer;
const ledgerRow = (invoiceId: string, paidDate: string | null): FinancialRecord =>
  ({ id: `fr-inv-${invoiceId}`, type: "income", status: paidDate ? "paid" : "pending", paidDate, isRecurring: false }) as unknown as FinancialRecord;
const lead = (over: Partial<Lead>): Lead => ({ status: "new", value: 0, ...over }) as unknown as Lead;

const leads = [
  lead({ id: "client-a", name: "Alfa" }),
  lead({ id: "client-b", name: "Beta" }),
  lead({ id: "client-c", name: "Gama" }),
  lead({ id: "lead-c", name: "Gama deal", clientId: "client-c" }),
  lead({ id: "lead-solo", name: "Solo lead" }),
];

const input = (invoices: InvoiceOffer[], rows: FinancialRecord[], p = period): DsoInput => ({
  invoices,
  financialRecords: rows,
  leads,
  invoiceStatuses: DEFAULT_INVOICE_STATUS_DEFS,
  period: p,
  paymentTermDays: 14,
});

test("average, change against the previous period, per client, worst and best", () => {
  const invoices = [
    invoice("a1", "2026-11-01", { clientId: "client-a" }), // 10 days
    invoice("a2", "2026-10-20", { clientId: "client-a" }), // 21 days -> Alfa 15.5
    invoice("b1", "2026-11-01", { clientId: "client-b" }), // 1 day
    invoice("c1", "2026-11-03", { leadId: "lead-c" }), // 5 days, client through the lead's link
    invoice("s1", "2026-11-02", { leadId: "lead-solo" }), // 8 days, the lead itself
    invoice("p1", "2026-09-25", { clientId: "client-a" }), // previous period: paid 5 Oct, 10 days
    invoice("x-cancelled", "2026-11-01", { clientId: "client-a", status: "cancelled" }), // not live
    invoice("x-unpaid", "2026-11-01", { clientId: "client-a" }), // no ledger payment
    invoice("x-offer", "2026-11-01", { type: "price_offer", clientId: "client-a" }),
  ];
  const rows = [
    ledgerRow("a1", "2026-11-11"),
    ledgerRow("a2", "2026-11-10"),
    ledgerRow("b1", "2026-11-02"),
    ledgerRow("c1", "2026-11-08"),
    ledgerRow("s1", "2026-11-10"),
    ledgerRow("p1", "2026-10-05"),
    ledgerRow("x-cancelled", "2026-11-05"),
    ledgerRow("x-unpaid", null),
    ledgerRow("x-offer", "2026-11-05"),
  ];
  const d = computeDso(input(invoices, rows));

  // (10 + 21 + 1 + 5 + 8) / 5
  assert.equal(d.averageDays, 9);
  assert.equal(d.deltaDays, 9 - 10);
  assert.equal(d.paymentTermDays, 14);
  assert.deepEqual(d.worst.map((r) => [r.clientId, r.name, r.days]), [
    ["client-a", "Alfa", 15.5],
    ["lead-solo", "Solo lead", 8],
    ["client-c", "Gama", 5],
    ["client-b", "Beta", 1],
  ]);
  assert.deepEqual(d.best.map((r) => r.clientId), ["client-b", "client-c", "lead-solo", "client-a"]);
});

test("worst and best keep five rows", () => {
  const invoices = Array.from({ length: 7 }, (_, i) => invoice(`i${i}`, "2026-11-01", { clientId: `c${i}`, clientName: `Client ${i}` }));
  const rows = invoices.map((inv, i) => ledgerRow(inv.id, `2026-11-${String(2 + i).padStart(2, "0")}`));
  const d = computeDso(input(invoices, rows));
  assert.equal(d.worst.length, 5);
  assert.equal(d.best.length, 5);
  assert.equal(d.worst[0].days, 7);
  assert.equal(d.best[0].days, 1);
  assert.equal(d.worst[0].name, "Client 6");
});

test("period boundary on the payment day: first and last day in, day before and after out", () => {
  const invoices = ["before", "first", "last", "after"].map((id) => invoice(id, "2026-10-01"));
  const rows = [ledgerRow("before", "2026-10-31"), ledgerRow("first", "2026-11-01"), ledgerRow("last", "2026-11-20"), ledgerRow("after", "2026-11-21")];
  const d = computeDso(input(invoices, rows));
  // 31 and 50 days: only "first" and "last" are in.
  assert.equal(d.averageDays, (31 + 50) / 2);
});

test("an invoice paid before it was issued counts as 0 days", () => {
  const d = computeDso(input([invoice("odd", "2026-11-10")], [ledgerRow("odd", "2026-11-05")]));
  assert.equal(d.averageDays, 0);
});

test("empty input: no average, no change, no rows", () => {
  assert.deepEqual(computeDso(input([], [])), { averageDays: null, deltaDays: null, paymentTermDays: 14, worst: [], best: [] });
});

test("all time has no change; a missing previous average gives no change", () => {
  const invoices = [invoice("a1", "2026-11-01", { clientId: "client-a" })];
  const rows = [ledgerRow("a1", "2026-11-11")];
  assert.equal(computeDso(input(invoices, rows, all)).deltaDays, null);
  assert.equal(computeDso(input(invoices, rows)).deltaDays, null); // nothing paid in October
  assert.equal(computeDso({ ...input(invoices, rows), paymentTermDays: null }).paymentTermDays, null);
});
