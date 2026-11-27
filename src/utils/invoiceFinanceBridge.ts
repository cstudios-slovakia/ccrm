import type { FinancialRecord, InvoiceOffer } from "../types";
import { DEFAULT_INVOICE_STATUS_DEFS, isLiveInvoiceStatus, type OfferStatusDef } from "./offerStatuses.ts";

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

/**
 * Settle an invoice's linked movement: money for it has been received (an
 * order already paid when the invoice is issued from it). Every entry point
 * that issues an invoice from a paid order calls this, so "paid" lands in the
 * ledger, the one place money is recorded (stored-vs-derived audit, finance #8).
 * A movement that is already settled is left as it is: never re-priced or re-dated.
 */
export function markInvoiceMovementPaid(
  records: FinancialRecord[],
  invoiceId: string,
  amount: number,
  paidDate: string
): FinancialRecord[] {
  const id = invoiceMovementId(invoiceId);
  let changed = false;
  const next = records.map((r) => {
    if (r.id !== id || isFullyPaid(r)) return r;
    changed = true;
    return { ...r, status: "paid" as const, amountReal: amount, paidDate };
  });
  return changed ? next : records;
}

/**
 * Only a real invoice is expected income — a price offer or a proforma is not —
 * and not one that was withdrawn or turned down. That is read from the status's
 * group (Price offers → Settings → Invoice statuses are configurable), so a
 * status the list does not know counts as live, as any status once did.
 */
const isLiveInvoice = (doc: InvoiceOffer, statuses: readonly OfferStatusDef[]) =>
  doc.type === "invoice" && isLiveInvoiceStatus(doc.status, statuses);

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
 * The amount an offer or invoice contributes to Finance / leads / project billing.
 * In `netMode` (VAT-excluded finance mode), uses `subtotal` (or `totalPrice - vatAmount` when subtotal is omitted).
 */
export const effectiveDocumentAmount = (
  doc: Pick<InvoiceOffer, "subtotal" | "vatAmount" | "totalPrice">,
  netMode = false
): number => {
  const gross = num(doc.totalPrice);
  if (!netMode) return Math.round(gross * 100) / 100;
  const sub = num(doc.subtotal);
  if (sub > 0) return Math.round(sub * 100) / 100;
  const vat = num(doc.vatAmount);
  if (gross > 0 && vat > 0) return Math.round(Math.max(0, gross - vat) * 100) / 100;
  return Math.round(gross * 100) / 100;
};

export interface ReconcileInvoiceOptions {
  /** When true, write net (`subtotal`) amounts to `financialRecords.amountPlanned` instead of gross `totalPrice`. */
  netMode?: boolean;
}

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

const invoiceOwnedSettlementFields = (doc: InvoiceOffer, netMode = false) => {
  const subtotal = num(doc.subtotal);
  return {
    amountPlanned: effectiveDocumentAmount(doc, netMode),
    currency: doc.currency || "EUR",
    issueDate: doc.issuedAt,
    dueDate: doc.dueDate || null,
    // An invoice with nothing to tax has no rate to derive; 0 rather than a guess.
    taxRate: subtotal > 0 ? Math.round((num(doc.vatAmount) / subtotal) * 100) : 0
  } satisfies Partial<FinancialRecord>;
};

const invoiceOwnedFields = (doc: InvoiceOffer, netMode = false) => ({
  ...invoiceOwnedIdentityFields(doc),
  ...invoiceOwnedSettlementFields(doc, netMode)
});

const newMovement = (doc: InvoiceOffer, now: string, netMode = false): FinancialRecord => ({
  id: invoiceMovementId(doc.id),
  type: "income",
  subtype: "invoice",
  ...invoiceOwnedFields(doc, netMode),
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
  now: string = new Date().toISOString(),
  statuses: readonly OfferStatusDef[] = DEFAULT_INVOICE_STATUS_DEFS,
  options?: ReconcileInvoiceOptions
): FinancialRecord[] {
  const netMode = Boolean(options?.netMode);
  const prevById = new Map(prevDocs.map(d => [d.id, d]));
  const nextIds = new Set(nextDocs.map(d => d.id));

  const upserts = new Map<string, InvoiceOffer>();
  const removals = new Set<string>();
  for (const doc of nextDocs) {
    if (prevById.get(doc.id) === doc) continue;
    if (isLiveInvoice(doc, statuses)) upserts.set(invoiceMovementId(doc.id), doc);
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
      const fields = isFullyPaid(rec) ? invoiceOwnedIdentityFields(doc) : invoiceOwnedFields(doc, netMode);
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
    created.push(newMovement(doc, now, netMode));
  }
  if (created.length) changed = true;

  return changed ? [...created, ...out] : records;
}
