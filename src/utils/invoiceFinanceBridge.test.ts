import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialRecord, InvoiceOffer } from "../types";
import { invoiceMovementId, reconcileInvoiceMovements } from "./invoiceFinanceBridge.ts";

const NOW = "2026-09-18T10:00:00.000Z";

const invoice = (over: Partial<InvoiceOffer> = {}): InvoiceOffer => ({
  id: "io-1",
  documentNumber: "FA-2026-001",
  type: "invoice",
  mode: "default",
  leadId: "lead-1",
  clientId: "lead-1",
  clientName: "Acme",
  title: "Invoice",
  subject: "Roof repair",
  uspCards: [],
  items: [],
  subtotal: 1000,
  vatAmount: 200,
  totalPrice: 1200,
  currency: "EUR",
  status: "draft",
  issuedAt: "2026-09-18",
  dueDate: "2026-10-02",
  ...over
});

const record = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: "fr-x",
  type: "income",
  title: "x",
  amountPlanned: 0,
  amountReal: 0,
  status: "pending",
  issueDate: "2026-09-01",
  isRecurring: false,
  ...over
});

test("issuing an invoice creates one linked pending income movement", () => {
  const doc = invoice();
  const out = reconcileInvoiceMovements([], [doc], [], NOW);
  assert.equal(out.length, 1);
  const [m] = out;
  assert.equal(m.id, invoiceMovementId(doc.id));
  assert.equal(m.type, "income");
  assert.equal(m.subtype, "invoice");
  assert.equal(m.status, "pending");
  assert.equal(m.amountPlanned, 1200);
  assert.equal(m.amountReal, 0);
  assert.equal(m.issueDate, "2026-09-18");
  assert.equal(m.dueDate, "2026-10-02");
  assert.equal(m.clientId, "lead-1");
  assert.equal(m.invoiceNumber, "FA-2026-001");
  assert.equal(m.taxRate, 20);
});

test("price offers and proformas never reach the ledger", () => {
  const offer = invoice({ id: "io-2", type: "price_offer" });
  const proforma = invoice({ id: "io-3", type: "proforma" });
  const records: FinancialRecord[] = [];
  assert.equal(reconcileInvoiceMovements([], [offer, proforma], records, NOW), records);
});

test("editing the invoice refreshes its fields but keeps what the ledger owns", () => {
  const doc = invoice();
  const [created] = reconcileInvoiceMovements([], [doc], [], NOW);
  const settled = { ...created, status: "partially_paid" as const, amountReal: 500, paidDate: "2026-09-20", categoryId: "cat-1" };
  const edited = invoice({ totalPrice: 1500, dueDate: "2026-10-10" });
  const [m] = reconcileInvoiceMovements([doc], [edited], [settled], NOW);
  assert.equal(m.amountPlanned, 1500);
  assert.equal(m.dueDate, "2026-10-10");
  assert.equal(m.status, "partially_paid");
  assert.equal(m.amountReal, 500);
  assert.equal(m.paidDate, "2026-09-20");
  assert.equal(m.categoryId, "cat-1");
});

test("an unchanged invoice array leaves the ledger untouched", () => {
  const doc = invoice();
  const records = reconcileInvoiceMovements([], [doc], [], NOW);
  assert.equal(reconcileInvoiceMovements([doc], [doc], records, NOW), records);
  // A new object with identical invoice-owned fields does not rewrite the movement.
  assert.equal(reconcileInvoiceMovements([doc], [{ ...doc }], records, NOW), records);
});

test("untouched old invoices are not backfilled", () => {
  const old = invoice({ id: "io-old", documentNumber: "FA-2025-009" });
  const fresh = invoice({ id: "io-new", documentNumber: "FA-2026-002" });
  const out = reconcileInvoiceMovements([old], [old, fresh], [], NOW);
  assert.deepEqual(out.map(r => r.id), [invoiceMovementId("io-new")]);
});

test("cancelling, rejecting or deleting removes an unsettled movement", () => {
  const doc = invoice();
  const records = reconcileInvoiceMovements([], [doc], [], NOW);
  assert.equal(reconcileInvoiceMovements([doc], [{ ...doc, status: "cancelled" }], records, NOW).length, 0);
  assert.equal(reconcileInvoiceMovements([doc], [{ ...doc, status: "rejected" }], records, NOW).length, 0);
  assert.equal(reconcileInvoiceMovements([doc], [{ ...doc, type: "proforma" }], records, NOW).length, 0);
  assert.equal(reconcileInvoiceMovements([doc], [], records, NOW).length, 0);
});

test("a movement with money recorded against it survives the invoice going away", () => {
  const doc = invoice();
  const [created] = reconcileInvoiceMovements([], [doc], [], NOW);
  const paid = { ...created, status: "paid" as const, amountReal: 1200 };
  const out = reconcileInvoiceMovements([doc], [], [paid], NOW);
  assert.deepEqual(out, [paid]);
});

test("a hand-recorded movement with the same invoice number blocks the linked one", () => {
  const manual = record({ id: "fr-manual", invoiceNumber: " fa-2026-001 ", amountPlanned: 1200 });
  const records = [manual];
  assert.equal(reconcileInvoiceMovements([], [invoice()], records, NOW), records);
});

test("an expense with the same number is not mistaken for the invoice", () => {
  const expense = record({ id: "fr-exp", type: "expense", invoiceNumber: "FA-2026-001" });
  const out = reconcileInvoiceMovements([], [invoice()], [expense], NOW);
  assert.equal(out.length, 2);
});

test("re-activating a cancelled invoice brings its movement back", () => {
  const doc = invoice({ status: "cancelled" });
  const out = reconcileInvoiceMovements([doc], [{ ...doc, status: "sent" }], [], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "pending");
});
