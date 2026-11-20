/**
 * Splatnosť / DSO: how many days pass between issuing an invoice and being paid.
 *
 * An invoice does not store its payment date. It lives on the invoice's ledger row
 * (`fr-inv-<invoice id>`, invoiceFinanceBridge.ts), so an invoice is "paid in the period" when
 * that row has a `paidDate` inside it.
 */

import type { FinancialRecord, InvoiceOffer, Lead } from "../../types/index.ts";
import type { DsoClientRow, DsoData, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { invoiceMovementId } from "../invoiceFinanceBridge.ts";
import { resolveLinkedClient } from "../leadClient.ts";
import { isLiveInvoiceStatus, type OfferStatusDef } from "../offerStatuses.ts";
import { dayDiff, isInRange, parseAppDate } from "./period.ts";

export interface DsoInput {
  invoices: readonly InvoiceOffer[];
  financialRecords: readonly FinancialRecord[];
  leads: readonly Lead[];
  invoiceStatuses: readonly OfferStatusDef[];
  period: PerformancePeriod;
}

interface PaidInvoice {
  invoice: InvoiceOffer;
  days: number;
}

const mean = (values: readonly number[]): number | null =>
  values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

const paidInvoicesIn = (
  invoices: readonly InvoiceOffer[],
  ledger: ReadonlyMap<string, FinancialRecord>,
  invoiceStatuses: readonly OfferStatusDef[],
  start: Date | null,
  end: Date | null,
): PaidInvoice[] => {
  const out: PaidInvoice[] = [];
  for (const invoice of invoices) {
    if (invoice.type !== "invoice" || !isLiveInvoiceStatus(invoice.status, invoiceStatuses)) continue;
    const issued = parseAppDate(invoice.issuedAt);
    if (!issued) continue;
    const paid = parseAppDate(ledger.get(invoiceMovementId(invoice.id))?.paidDate);
    if (!paid || !isInRange(paid, start, end)) continue;
    out.push({ invoice, days: Math.max(0, dayDiff(issued, paid)) });
  }
  return out;
};

/**
 * The agreed payment term: the mean of (`dueDate` - `issuedAt`) in whole days over the counted
 * invoices that have a due date (never below 0), rounded to a whole day; null when none has one.
 */
const agreedTermDays = (counted: readonly PaidInvoice[]): number | null => {
  const terms: number[] = [];
  for (const { invoice } of counted) {
    const issued = parseAppDate(invoice.issuedAt);
    const due = parseAppDate(invoice.dueDate);
    if (issued && due) terms.push(Math.max(0, dayDiff(issued, due)));
  }
  const term = mean(terms);
  return term === null ? null : Math.round(term);
};

export const computeDso = ({ invoices, financialRecords, leads, invoiceStatuses, period }: DsoInput): DsoData => {
  const ledger = new Map(financialRecords.map((r) => [r.id, r]));
  const leadList = leads as Lead[];
  const leadById = new Map(leadList.map((l) => [l.id, l]));

  const current = paidInvoicesIn(invoices, ledger, invoiceStatuses, period.start, period.end);
  const averageDays = mean(current.map((p) => p.days));

  let deltaDays: number | null = null;
  if (period.previousStart && period.previousEnd && averageDays !== null) {
    const previousAverage = mean(paidInvoicesIn(invoices, ledger, invoiceStatuses, period.previousStart, period.previousEnd).map((p) => p.days));
    if (previousAverage !== null) deltaDays = averageDays - previousAverage;
  }

  // Per client: the client on the invoice, else the client its lead is linked to, else the lead itself.
  const perClient = new Map<string, { name: string; days: number[] }>();
  for (const { invoice, days } of current) {
    const lead = invoice.leadId ? leadById.get(invoice.leadId) : undefined;
    const client = invoice.clientId ? leadById.get(invoice.clientId) : lead ? resolveLinkedClient(lead, leadList) ?? lead : undefined;
    const clientId = invoice.clientId || client?.id || invoice.leadId || `name:${invoice.clientName}`;
    const name = client?.name || invoice.clientName || clientId;
    const entry = perClient.get(clientId) ?? { name, days: [] };
    entry.days.push(days);
    perClient.set(clientId, entry);
  }
  const rows: DsoClientRow[] = [...perClient.entries()].map(([clientId, { name, days }]) => ({
    clientId,
    name,
    days: mean(days) ?? 0,
  }));
  const byName = (a: DsoClientRow, b: DsoClientRow) => a.name.localeCompare(b.name);

  return {
    averageDays,
    deltaDays,
    paymentTermDays: agreedTermDays(current),
    worst: [...rows].sort((a, b) => b.days - a.days || byName(a, b)).slice(0, 5),
    best: [...rows].sort((a, b) => a.days - b.days || byName(a, b)).slice(0, 5),
  };
};
