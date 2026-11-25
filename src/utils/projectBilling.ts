import type { FinancialRecord, InvoiceOffer, Lead, Project, ProjectType } from "../types";
import { isMoneyValueEmpty, parseMoneyValue } from "./currency.ts";
import { movementAmounts } from "./financialOverviewTable.ts";

const cents = (n: number) => Math.round(n * 100) / 100;
const positive = (raw: unknown): number => {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const nonNegative = (raw: unknown): number | null => {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

type ValueProject = Pick<Project, "value" | "data" | "leadId"> & {
  id?: string;
  archived?: boolean;
  projectTypeId?: string | null;
  createdAt?: string | null;
};

export interface ResolveProjectValueOptions {
  /** All projects in the workspace, used to avoid inheriting `lead.value` on multiple projects sharing one `leadId`. */
  siblingProjects?: readonly ValueProject[];
  projectTypes?: readonly ProjectType[];
  /** When true (Net / VAT-excluded finance mode), convert a lead value matching a gross offer/invoice to its net subtotal. */
  netMode?: boolean;
  invoicesOffers?: readonly Pick<InvoiceOffer, "leadId" | "type" | "status" | "subtotal" | "vatAmount" | "totalPrice">[];
}

export interface ResolvedProjectValue {
  value: number;
  currency: string;
  inheritedFromLead: boolean;
}

const sumMoneyAttributes = (
  data: Record<string, unknown>,
  projectType: ProjectType | undefined,
  defaultCurrency: string,
): { sum: number; currency: string | null } => {
  let sum = 0;
  let currency: string | null = null;
  for (const attr of projectType?.attributes || []) {
    if (attr.type !== "money" || isMoneyValueEmpty(data[attr.id], defaultCurrency)) continue;
    const parsed = parseMoneyValue(data[attr.id], defaultCurrency);
    sum += parsed.amount || 0;
    if (!currency) currency = parsed.currency;
  }
  return { sum, currency };
};

/** True when a project carries its own value (including explicit `0`), without falling back to a linked lead. */
export function hasExplicitProjectValue(
  project: ValueProject,
  projectType: ProjectType | undefined,
  defaultCurrency: string,
): boolean {
  if (nonNegative(project.value) !== null) return true;
  const data = (project.data || {}) as Record<string, unknown>;
  if (sumMoneyAttributes(data, projectType, defaultCurrency).sum > 0) return true;
  return positive(data._projectValue ?? data.value) > 0;
}

/**
 * Resolves a lead's value for finance/pipeline sums. In `netMode`, when a lead's stored value matches
 * a live offer or invoice's gross `totalPrice` (and that document carries VAT), uses its net `subtotal`.
 */
export function resolveLeadEffectiveValue(
  lead: (Pick<Lead, "value"> & { id?: string }) | undefined,
  options?: Pick<ResolveProjectValueOptions, "netMode" | "invoicesOffers">,
): number {
  const raw = positive(lead?.value);
  if (raw <= 0) return 0;
  const rawCents = cents(raw);
  if (!options?.netMode || !lead?.id || !options.invoicesOffers?.length) return rawCents;
  const match = options.invoicesOffers.find((doc) => {
    if (doc.leadId !== lead.id) return false;
    const status = (doc.status || "").toLowerCase();
    if (status === "cancelled" || status === "rejected") return false;
    const gross = positive(doc.totalPrice);
    const sub = positive(doc.subtotal);
    const vat = positive(doc.vatAmount);
    return vat > 0 && sub > 0 && cents(gross) === rawCents;
  });
  return match ? cents(positive(match.subtotal)) : rawCents;
}

const canInheritLeadValue = (
  project: ValueProject,
  options: ResolveProjectValueOptions | undefined,
  defaultCurrency: string,
): boolean => {
  if (!project.leadId || !options?.siblingProjects?.length) return true;
  const activeSiblings = options.siblingProjects.filter(
    (s) => !s.archived && s.leadId === project.leadId,
  );
  if (activeSiblings.length === 0) return true;
  if (project.archived) return false;
  if (activeSiblings.length === 1) {
    return !project.id || !activeSiblings[0].id || activeSiblings[0].id === project.id;
  }

  const types = options.projectTypes || [];
  const otherHasExplicit = activeSiblings.some((s) => {
    if (project.id && s.id && s.id === project.id) return false;
    const sType = s.projectTypeId ? types.find((t) => t.id === s.projectTypeId) : undefined;
    return hasExplicitProjectValue(s, sType, defaultCurrency);
  });
  if (otherHasExplicit) return false;

  // Multiple active projects share this lead and none has an explicit value: count the lead value at most once.
  const ordered = [...activeSiblings].sort(
    (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || (a.id || "").localeCompare(b.id || ""),
  );
  return !project.id || ordered[0]?.id === project.id;
};

/**
 * Like `resolveProjectValue`, also indicating whether the resolved value was inherited from the paired lead.
 */
export function resolveProjectValueWithSource(
  project: ValueProject,
  projectType: ProjectType | undefined,
  lead: (Pick<Lead, "value"> & { id?: string }) | undefined,
  defaultCurrency: string,
  options?: ResolveProjectValueOptions,
): ResolvedProjectValue {
  const own = nonNegative(project.value);
  if (own !== null) return { value: cents(own), currency: defaultCurrency, inheritedFromLead: false };

  const data = (project.data || {}) as Record<string, unknown>;
  const { sum, currency } = sumMoneyAttributes(data, projectType, defaultCurrency);
  if (sum > 0) return { value: cents(sum), currency: currency || defaultCurrency, inheritedFromLead: false };

  const fromData = positive(data._projectValue ?? data.value);
  if (fromData > 0) return { value: cents(fromData), currency: defaultCurrency, inheritedFromLead: false };

  const fromLead = resolveLeadEffectiveValue(lead, options);
  if (fromLead > 0 && canInheritLeadValue(project, options, defaultCurrency)) {
    return { value: cents(fromLead), currency: defaultCurrency, inheritedFromLead: true };
  }

  return { value: 0, currency: defaultCurrency, inheritedFromLead: false };
}

/**
 * The contract value of a project, and the currency it is in.
 *
 * First explicit result wins: `project.value` (including explicit `0`), the sum of every `money`
 * attribute of the project type, `data._projectValue ?? data.value`, then the paired lead's value
 * (at most once across active sibling projects sharing a `leadId`). `project.budget` is a cost
 * ceiling and is never used.
 */
export function resolveProjectValue(
  project: ValueProject,
  projectType: ProjectType | undefined,
  lead: (Pick<Lead, "value"> & { id?: string }) | undefined,
  defaultCurrency: string,
  options?: ResolveProjectValueOptions,
): { value: number; currency: string } {
  const { value, currency } = resolveProjectValueWithSource(project, projectType, lead, defaultCurrency, options);
  return { value, currency };
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
 * A recurring income rule adds nothing of its own: its payments are stored as
 * movements (`recurringRuleDeletion.ts`), and the rule row counts only when it
 * holds a legacy payment the schedule does not account for (`movementAmounts`).
 */
export function projectBilling(value: number, records: FinancialRecord[], projectId: string): ProjectBilling {
  let received = 0;
  let invoicedOpen = 0;
  for (const r of records) {
    if (r.projectId !== projectId || r.type !== "income") continue;
    const { real, estimated } = movementAmounts(r);
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
