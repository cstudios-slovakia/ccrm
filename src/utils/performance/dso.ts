/**
 * Splatnosť / DSO: how many days pass between issuing an invoice and being paid.
 *
 * Counts both:
 * 1. Live invoices from `invoices_offers` whose linked ledger row (`fr-inv-<id>`) has a `paidDate`
 *    in the period, and
 * 2. Standalone paid ledger income invoices (e.g., created from Project Finances or imported from
 *    SuperFaktura) that are not already represented by an `invoices_offers` document.
 */

import type { FinancialRecord, InvoiceOffer, Lead, Project } from "../../types/index.ts";
import type { DsoClientRow, DsoData, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { invoiceMovementId } from "../invoiceFinanceBridge.ts";
import { resolveLinkedClient } from "../leadClient.ts";
import { isLiveInvoiceStatus, type OfferStatusDef } from "../offerStatuses.ts";
import { dayDiff, isInRange, parseAppDate } from "./period.ts";

export interface DsoInput {
  invoices: readonly InvoiceOffer[];
  financialRecords: readonly FinancialRecord[];
  leads: readonly Lead[];
  projects?: readonly Project[];
  invoiceStatuses: readonly OfferStatusDef[];
  period: PerformancePeriod;
}

interface PaidDsoItem {
  issued: Date;
  due: Date | null;
  days: number;
  clientId: string;
  clientName: string;
}

const mean = (values: readonly number[]): number | null =>
  values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

const isStandaloneInvoiceRecord = (rec: FinancialRecord): boolean =>
  rec.type === "income" &&
  rec.status === "paid" &&
  !rec.isRecurring &&
  (rec.subtype === "invoice" || Boolean(rec.invoiceNumber?.trim()) || Boolean(rec.projectId));

const paidItemsIn = (
  invoices: readonly InvoiceOffer[],
  financialRecords: readonly FinancialRecord[],
  ledger: ReadonlyMap<string, FinancialRecord>,
  leadList: Lead[],
  leadById: ReadonlyMap<string, Lead>,
  projectById: ReadonlyMap<string, Project>,
  invoiceStatuses: readonly OfferStatusDef[],
  start: Date | null,
  end: Date | null,
): PaidDsoItem[] => {
  const out: PaidDsoItem[] = [];
  const linkedLedgerIds = new Set<string>();

  for (const invoice of invoices) {
    const movId = invoiceMovementId(invoice.id);
    linkedLedgerIds.add(movId);
    if (invoice.type !== "invoice" || !isLiveInvoiceStatus(invoice.status, invoiceStatuses)) continue;
    const issued = parseAppDate(invoice.issuedAt);
    if (!issued) continue;
    const paid = parseAppDate(ledger.get(movId)?.paidDate);
    if (!paid || !isInRange(paid, start, end)) continue;

    const lead = invoice.leadId ? leadById.get(invoice.leadId) : undefined;
    const client = invoice.clientId
      ? leadById.get(invoice.clientId)
      : lead
        ? resolveLinkedClient(lead, leadList) ?? lead
        : undefined;
    const clientId = invoice.clientId || client?.id || invoice.leadId || `name:${invoice.clientName}`;
    const clientName = client?.name || invoice.clientName || clientId;
    out.push({
      issued,
      due: parseAppDate(invoice.dueDate),
      days: Math.max(0, dayDiff(issued, paid)),
      clientId,
      clientName,
    });
  }

  for (const rec of financialRecords) {
    if (linkedLedgerIds.has(rec.id) || !isStandaloneInvoiceRecord(rec)) continue;
    const issued = parseAppDate(rec.issueDate);
    const paid = parseAppDate(rec.paidDate);
    if (!issued || !paid || !isInRange(paid, start, end)) continue;

    const project = rec.projectId ? projectById.get(rec.projectId) : undefined;
    const directId = rec.clientId || project?.clientId || null;
    const leadId = project?.leadId || null;
    const direct = directId ? leadById.get(directId) : undefined;
    const lead = direct ?? (leadId ? leadById.get(leadId) : undefined);
    const client = direct ?? (lead ? resolveLinkedClient(lead, leadList) ?? lead : undefined);
    const clientId = client?.id || directId || leadId || `name:${rec.title || rec.id}`;
    const clientName = client?.name || project?.name || rec.title || clientId;
    out.push({
      issued,
      due: parseAppDate(rec.dueDate),
      days: Math.max(0, dayDiff(issued, paid)),
      clientId,
      clientName,
    });
  }

  return out;
};

/**
 * The agreed payment term: the mean of (`dueDate` - `issuedAt`) in whole days over the counted
 * invoices that have a due date (never below 0), rounded to a whole day; null when none has one.
 */
const agreedTermDays = (counted: readonly PaidDsoItem[]): number | null => {
  const terms: number[] = [];
  for (const { issued, due } of counted) {
    if (due) terms.push(Math.max(0, dayDiff(issued, due)));
  }
  const term = mean(terms);
  return term === null ? null : Math.round(term);
};

export const computeDso = ({ invoices, financialRecords, leads, projects = [], invoiceStatuses, period }: DsoInput): DsoData => {
  const ledger = new Map(financialRecords.map((r) => [r.id, r]));
  const leadList = leads as Lead[];
  const leadById = new Map(leadList.map((l) => [l.id, l]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const current = paidItemsIn(invoices, financialRecords, ledger, leadList, leadById, projectById, invoiceStatuses, period.start, period.end);
  const averageDays = mean(current.map((p) => p.days));

  let deltaDays: number | null = null;
  if (period.previousStart && period.previousEnd && averageDays !== null) {
    const previousAverage = mean(
      paidItemsIn(invoices, financialRecords, ledger, leadList, leadById, projectById, invoiceStatuses, period.previousStart, period.previousEnd).map(
        (p) => p.days,
      ),
    );
    if (previousAverage !== null) deltaDays = averageDays - previousAverage;
  }

  const perClient = new Map<string, { name: string; days: number[] }>();
  for (const { clientId, clientName, days } of current) {
    const entry = perClient.get(clientId) ?? { name: clientName, days: [] };
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
