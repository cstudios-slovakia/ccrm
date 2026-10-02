import type { FinancialRecord, Lead, Project, ProjectType } from "../types";
import { isMoneyValueEmpty, parseMoneyValue } from "./currency.ts";
import { splitRecordAmounts } from "./financialOverviewTable.ts";

const cents = (n: number) => Math.round(n * 100) / 100;
const positive = (raw: unknown): number => {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The contract value of a project, and the currency it is in.
 *
 * First positive result wins: `project.value`, the sum of every `money`
 * attribute of the project type, `data._projectValue ?? data.value`, the
 * paired lead's value. `project.budget` is a cost ceiling and is never used.
 */
export function resolveProjectValue(
  project: Pick<Project, "value" | "data" | "leadId">,
  projectType: ProjectType | undefined,
  lead: Pick<Lead, "value"> | undefined,
  defaultCurrency: string,
): { value: number; currency: string } {
  const own = positive(project.value);
  if (own > 0) return { value: cents(own), currency: defaultCurrency };

  const data = (project.data || {}) as Record<string, unknown>;
  let sum = 0;
  let currency: string | null = null;
  for (const attr of projectType?.attributes || []) {
    if (attr.type !== "money" || isMoneyValueEmpty(data[attr.id], defaultCurrency)) continue;
    const parsed = parseMoneyValue(data[attr.id], defaultCurrency);
    sum += parsed.amount || 0;
    if (!currency) currency = parsed.currency;
  }
  if (sum > 0) return { value: cents(sum), currency: currency || defaultCurrency };

  const fromData = positive(data._projectValue ?? data.value);
  if (fromData > 0) return { value: cents(fromData), currency: defaultCurrency };

  const fromLead = positive(lead?.value);
  if (fromLead > 0) return { value: cents(fromLead), currency: defaultCurrency };

  return { value: 0, currency: defaultCurrency };
}

export interface ProjectBilling {
  /** Contract value. */
  value: number;
  /** Money that has actually come in. */
  received: number;
  /** Invoiced (or planned) but not received yet. */
  invoicedOpen: number;
  /** received + invoicedOpen. Cancelled rows are excluded. */
  invoiced: number;
  /** max(0, value − invoiced). */
  notInvoiced: number;
  /** invoicedOpen + notInvoiced. */
  stillToBePaid: number;
  /** max(0, invoiced − value), only when value > 0. */
  overInvoiced: number;
}

/**
 * How much of a project's value has come in, is invoiced but unpaid, or is not
 * invoiced yet. Each income row is split by Finance's own `splitRecordAmounts`
 * (cancelled = 0/0, partially paid = paid part + unpaid rest), so this page can
 * never disagree with the Finance module.
 *
 * A recurring income rule counts as one row, as it does on the project's
 * invoice table.
 */
export function projectBilling(value: number, records: FinancialRecord[], projectId: string): ProjectBilling {
  let received = 0;
  let invoicedOpen = 0;
  for (const r of records) {
    if (r.projectId !== projectId || r.type !== "income") continue;
    const { real, estimated } = splitRecordAmounts(r);
    received += real;
    invoicedOpen += estimated;
  }
  const invoiced = received + invoicedOpen;
  const notInvoiced = Math.max(0, value - invoiced);
  return {
    value: cents(value),
    received: cents(received),
    invoicedOpen: cents(invoicedOpen),
    invoiced: cents(invoiced),
    notInvoiced: cents(notInvoiced),
    stillToBePaid: cents(invoicedOpen + notInvoiced),
    overInvoiced: value > 0 ? cents(Math.max(0, invoiced - value)) : 0,
  };
}
