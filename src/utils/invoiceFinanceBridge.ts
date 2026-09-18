import type { FinancialRecord, InvoiceOffer } from "../types";

/**
 * Bridge from the Invoicing module into the finance ledger (audit F27, option a).
 *
 * An invoice issued in Invoicing used to live only in `invoicesOffers`, which no
 * finance tab reads, so every open invoice was missing from expected income. Now
 * each live invoice owns exactly one linked `pending` income movement in
 * `financialRecords`, and the finance tabs keep reading a single ledger.
 *
 * The link is the movement's id, derived from the invoice id, so it needs no
 * extra column and survives sync unchanged.
 *
 * Ownership is split on purpose:
 * - The invoice owns what it states: title, number, client, amount, dates.
 * - The ledger owns what happens to the money: status once settled, the real
 *   amount, paid date, payment method, category and project. Settling ("paying")
 *   the movement is done in the finance tabs and the invoice never undoes it.
 */

export const invoiceMovementId = (invoiceId: string) => `fr-inv-${invoiceId}`;

/** Only a real invoice is expected income — a price offer or a proforma is not. */
const isLiveInvoice = (doc: InvoiceOffer) =>
  doc.type === "invoice" && doc.status !== "cancelled" && doc.status !== "rejected";

/** Money has already been recorded against the movement; it must never be removed. */
const isSettled = (rec: FinancialRecord) =>
  rec.status === "paid" || rec.status === "partially_paid" || (Number(rec.amountReal) || 0) > 0;

/**
 * Nothing is left owing: the invoice's amount and dates must not move
 * underneath it (audit F7). A `partially_paid` movement is settled money too,
 * but there's still a balance due, so the invoice may keep correcting the
 * amount/dates until it's fully paid.
 */
const isFullyPaid = (rec: FinancialRecord) => rec.status === "paid";

const normalizeNumber = (value: string | null | undefined) => (value || "").trim().toLowerCase();

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * The fields an invoice dictates on its linked movement, split by whether they
 * may still change once the movement is settled (paid/partially paid, or any
 * money recorded against it).
 *
 * Once settled, the amount and dates are frozen: an invoice edit after that
 * point is a correction to the *document* (title, number, client), never a
 * silent re-price or re-date of money already booked (audit F7). Only
 * identity fields still flow through.
 */
const invoiceOwnedIdentityFields = (doc: InvoiceOffer) => ({
  title: [doc.documentNumber, doc.clientName].filter(Boolean).join(" — ") || doc.title,
  description: doc.subject?.trim() || null,
  clientId: doc.clientId || doc.leadId || null,
  invoiceNumber: doc.documentNumber || null
} satisfies Partial<FinancialRecord>);

const invoiceOwnedSettlementFields = (doc: InvoiceOffer) => {
  const subtotal = num(doc.subtotal);
  return {
    amountPlanned: Math.round(num(doc.totalPrice) * 100) / 100,
    currency: doc.currency || "EUR",
    issueDate: doc.issuedAt,
    dueDate: doc.dueDate || null,
    taxRate: subtotal > 0 ? Math.round((num(doc.vatAmount) / subtotal) * 100) : 20
  } satisfies Partial<FinancialRecord>;
};

const invoiceOwnedFields = (doc: InvoiceOffer) => ({
  ...invoiceOwnedIdentityFields(doc),
  ...invoiceOwnedSettlementFields(doc)
});

const newMovement = (doc: InvoiceOffer, now: string): FinancialRecord => ({
  id: invoiceMovementId(doc.id),
  type: "income",
  subtype: "invoice",
  ...invoiceOwnedFields(doc),
  categoryId: null,
  categoryPath: null,
  amountReal: 0,
  status: "pending",
  paidDate: null,
  paymentMethod: "bank_transfer",
  isRecurring: false,
  projectId: null,
  attachments: [],
  createdBy: doc.createdBy || null,
  createdAt: now,
  updatedAt: now
});

/**
 * Reconcile the ledger with the invoices that changed between `prevDocs` and
 * `nextDocs`. Only changed documents are touched, so an untouched old invoice
 * is never backfilled into the ledger as fresh outstanding income.
 *
 * - A live invoice creates its movement, or refreshes the invoice-owned fields
 *   of the one it already has.
 * - A cancelled, rejected, deleted or re-typed invoice removes its movement,
 *   unless money was already recorded against it — then the movement stays.
 * - Double-entry guard: if the user already recorded the invoice by hand (an
 *   unlinked income movement carrying the same invoice number), no linked
 *   movement is created.
 *
 * Returns the same array when nothing changed, so callers can skip a sync.
 */
export function reconcileInvoiceMovements(
  prevDocs: InvoiceOffer[],
  nextDocs: InvoiceOffer[],
  records: FinancialRecord[],
  now: string = new Date().toISOString()
): FinancialRecord[] {
  const prevById = new Map(prevDocs.map(d => [d.id, d]));
  const nextIds = new Set(nextDocs.map(d => d.id));

  const upserts = new Map<string, InvoiceOffer>();
  const removals = new Set<string>();
  for (const doc of nextDocs) {
    if (prevById.get(doc.id) === doc) continue;
    if (isLiveInvoice(doc)) upserts.set(invoiceMovementId(doc.id), doc);
    else removals.add(invoiceMovementId(doc.id));
  }
  for (const doc of prevDocs) {
    if (!nextIds.has(doc.id)) removals.add(invoiceMovementId(doc.id));
  }
  if (!upserts.size && !removals.size) return records;

  let changed = false;
  const seen = new Set<string>();
  const out: FinancialRecord[] = [];
  for (const rec of records) {
    const doc = upserts.get(rec.id);
    if (doc) {
      seen.add(rec.id);
      const fields = isFullyPaid(rec) ? invoiceOwnedIdentityFields(doc) : invoiceOwnedFields(doc);
      const differs = (Object.keys(fields) as (keyof typeof fields)[]).some(k => rec[k] !== fields[k]);
      if (differs) {
        changed = true;
        out.push({ ...rec, ...fields, updatedAt: now });
      } else {
        out.push(rec);
      }
      continue;
    }
    if (removals.has(rec.id) && !isSettled(rec)) {
      changed = true;
      continue;
    }
    out.push(rec);
  }

  const handRecorded = new Set(
    records
      .filter(r => r.type === "income" && !r.id.startsWith("fr-inv-") && r.invoiceNumber)
      .map(r => normalizeNumber(r.invoiceNumber))
  );
  const created: FinancialRecord[] = [];
  for (const [id, doc] of upserts) {
    if (seen.has(id)) continue;
    if (doc.documentNumber && handRecorded.has(normalizeNumber(doc.documentNumber))) continue;
    created.push(newMovement(doc, now));
  }
  if (created.length) changed = true;

  return changed ? [...created, ...out] : records;
}
