import test from "node:test";
import assert from "node:assert/strict";
import type { FinancialRecord, InvoiceOffer, Lead, Project } from "../../types/index.ts";
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
});

test("average, change against the previous period, per client, worst and best", () => {
  const invoices = [
    invoice("a1", "2026-11-01", { clientId: "client-a", dueDate: "2026-11-15" }), // 10 days, term 14
    invoice("a2", "2026-10-20", { clientId: "client-a" }), // 21 days -> Alfa 15.5
    invoice("b1", "2026-11-01", { clientId: "client-b", dueDate: "2026-11-09" }), // 1 day, term 8
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
  assert.equal(d.paymentTermDays, 11); // the invoices with a due date: (14 + 8) / 2
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
  assert.deepEqual(computeDso(input([], [])), { averageDays: null, deltaDays: null, paymentTermDays: null, worst: [], best: [] });
});

test("all time has no change; a missing previous average gives no change", () => {
  const invoices = [invoice("a1", "2026-11-01", { clientId: "client-a" })];
  const rows = [ledgerRow("a1", "2026-11-11")];
  assert.equal(computeDso(input(invoices, rows, all)).deltaDays, null);
  assert.equal(computeDso(input(invoices, rows)).deltaDays, null); // nothing paid in October
});

test("payment term: none without a due date, the mean otherwise, never below 0, only counted invoices", () => {
  // One counted invoice without a due date.
  assert.equal(computeDso(input([invoice("a", "2026-11-01")], [ledgerRow("a", "2026-11-11")])).paymentTermDays, null);

  const invoices = [
    invoice("a", "2026-11-01", { dueDate: "2026-11-15" }), // 14
    invoice("b", "2026-11-01", { dueDate: "2026-11-08" }), // 7
    invoice("c", "2026-11-01", { dueDate: "2026-10-20" }), // due before issue: 0
    invoice("d", "2026-11-01"), // no due date: left out of the mean
    invoice("unpaid", "2026-11-01", { dueDate: "2027-11-01" }), // not counted at all
    invoice("late", "2026-11-01", { dueDate: "2027-11-01" }), // paid outside the period: not counted
  ];
  const rows = [
    ledgerRow("a", "2026-11-11"),
    ledgerRow("b", "2026-11-11"),
    ledgerRow("c", "2026-11-11"),
    ledgerRow("d", "2026-11-11"),
    ledgerRow("unpaid", null),
    ledgerRow("late", "2026-12-01"),
  ];
  assert.equal(computeDso(input(invoices, rows)).paymentTermDays, 7); // (14 + 7 + 0) / 3
});

test("includes standalone project and imported ledger invoices, avoids double-counting, excludes non-invoice income", () => {
  const projects: Project[] = [
    { id: "proj-1", name: "Alfa Web", clientId: "client-a", leadId: null, status: "active" } as unknown as Project,
    { id: "proj-2", name: "Gama Redesign", clientId: null, leadId: "lead-c", status: "active" } as unknown as Project,
  ];
  const invoices = [
    invoice("inv-1", "2026-11-01", { clientId: "client-a", dueDate: "2026-11-15" }), // 10 days, term 14
  ];
  const rows: FinancialRecord[] = [
    // Already linked to inv-1: must NOT be counted twice even with subtype=invoice & issueDate set.
    {
      id: "fr-inv-inv-1",
      type: "income",
      subtype: "invoice",
      title: "FA-2026-001",
      invoiceNumber: "FA-2026-001",
      clientId: "client-a",
      status: "paid",
      issueDate: "2026-11-01",
      dueDate: "2026-11-15",
      paidDate: "2026-11-11",
      isRecurring: false,
    } as unknown as FinancialRecord,
    // Project invoice created directly from ProjectDetailsView (client via project.clientId -> Alfa)
    {
      id: "fr-179000-abc",
      type: "income",
      subtype: "invoice",
      title: "Milestone 1",
      projectId: "proj-1",
      status: "paid",
      issueDate: "2026-11-01",
      dueDate: "2026-11-21", // term 20
      paidDate: "2026-11-19", // 18 days
      isRecurring: false,
    } as unknown as FinancialRecord,
    // External SuperFaktura import (client via project.leadId -> lead-c -> Gama)
    {
      id: "fr-sf-999",
      type: "income",
      subtype: "invoice",
      title: "SF #2026099",
      invoiceNumber: "2026099",
      projectId: "proj-2",
      status: "paid",
      issueDate: "2026-11-05",
      dueDate: "2026-11-15", // term 10
      paidDate: "2026-11-09", // 4 days
      isRecurring: false,
    } as unknown as FinancialRecord,
    // External invoice with no client/project link -> falls back to record title
    {
      id: "fr-sf-1000",
      type: "income",
      subtype: "invoice",
      title: "Delta s.r.o.",
      invoiceNumber: "2026100",
      status: "paid",
      issueDate: "2026-11-02",
      dueDate: "2026-11-10", // term 8
      paidDate: "2026-11-10", // 8 days
      isRecurring: false,
    } as unknown as FinancialRecord,
    // Previous-period standalone invoice (paid Oct 10, 6 days)
    {
      id: "fr-sf-prev",
      type: "income",
      subtype: "invoice",
      title: "Prev SF",
      clientId: "client-b",
      status: "paid",
      issueDate: "2026-10-04",
      paidDate: "2026-10-10", // 6 days
      isRecurring: false,
    } as unknown as FinancialRecord,
    // Non-invoice utility refund (no subtype=invoice, no invoiceNumber, no projectId) -> excluded
    {
      id: "fr-refund-1",
      type: "income",
      subtype: "other",
      title: "Electricity refund",
      status: "paid",
      issueDate: "2026-10-01",
      paidDate: "2026-11-20", // 50 days if wrongly included
      isRecurring: false,
    } as unknown as FinancialRecord,
    // Recurring rule row -> excluded
    {
      id: "fr-rec-1",
      type: "income",
      subtype: "invoice",
      title: "Retainer rule",
      projectId: "proj-1",
      status: "paid",
      issueDate: "2026-10-01",
      paidDate: "2026-11-20",
      isRecurring: true,
    } as unknown as FinancialRecord,
    // Expense row -> excluded
    {
      id: "fr-exp-1",
      type: "expense",
      subtype: "invoice",
      title: "Vendor bill",
      projectId: "proj-1",
      status: "paid",
      issueDate: "2026-10-01",
      paidDate: "2026-11-20",
      isRecurring: false,
    } as unknown as FinancialRecord,
  ];

  const d = computeDso({
    invoices,
    financialRecords: rows,
    leads,
    projects,
    invoiceStatuses: DEFAULT_INVOICE_STATUS_DEFS,
    period,
  });

  // Counted: inv-1 (10), fr-179000-abc (18), fr-sf-999 (4), fr-sf-1000 (8) -> mean = 40 / 4 = 10
  assert.equal(d.averageDays, 10);
  // Previous period: fr-sf-prev (6) -> delta = 10 - 6 = +4
  assert.equal(d.deltaDays, 4);
  // Agreed terms: (14 + 20 + 10 + 8) / 4 = 13
  assert.equal(d.paymentTermDays, 13);
  // Client ranking: Alfa = (10 + 18)/2 = 14, Delta s.r.o. = 8, Gama = 4
  assert.deepEqual(
    d.worst.map((r) => [r.clientId, r.name, r.days]),
    [
      ["client-a", "Alfa", 14],
      ["name:Delta s.r.o.", "Delta s.r.o.", 8],
      ["client-c", "Gama", 4],
    ],
  );
  assert.deepEqual(
    d.best.map((r) => [r.clientId, r.name, r.days]),
    [
      ["client-c", "Gama", 4],
      ["name:Delta s.r.o.", "Delta s.r.o.", 8],
      ["client-a", "Alfa", 14],
    ],
  );
});
