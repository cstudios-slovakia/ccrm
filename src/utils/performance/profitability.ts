/**
 * "Ziskovosť projektov": invoiced, costs and profit per project.
 *
 * `computeProfitability` only arranges numbers it is given. The numbers come from the three
 * small builders below, so the wiring holds no formulas: `projectInvoicedAmount` (what the
 * "Na fakturovanie" card computes), `projectExpenseCosts` and `projectHasRecentExpense`. Labour
 * cost is not a ledger record: the caller adds `timeTracking.totals.byProject[id].cost`; an inactive
 * project with worked time in the last days stays listed too (`projectsWithRecentLabour`).
 */

import type { FinancialRecord, InvoiceOffer, Lead, Project, ProjectType } from "../../types/index.ts";
import type { ProfitabilityData, ProfitabilityRow } from "../../components/dashboard/performance/types.ts";
import { movementAmounts } from "../financialOverviewTable.ts";
import { isLiveInvoiceStatus, type OfferStatusDef } from "../offerStatuses.ts";
import { effectiveDocumentAmount } from "../invoiceFinanceBridge.ts";
import { projectBilling, resolveProjectValue } from "../projectBilling.ts";
import { dayDiff, parseAppDate } from "./period.ts";
import type { TimeEntry } from "../timeTracking.ts";
import { RECENT_DAYS, entryWorkedMs } from "./labour.ts";

type Amounts = Readonly<Record<string, number>> | ReadonlyMap<string, number>;

const amountOf = (amounts: Amounts, id: string): number => {
  const raw = amounts instanceof Map ? amounts.get(id) : (amounts as Readonly<Record<string, number>>)[id];
  return Number(raw) || 0;
};

export interface ProfitabilityInput {
  projects: readonly Project[];
  /** The project-status rule of the installation: is this project still being worked on? */
  isActive: (project: Project) => boolean;
  invoicedByProject: Amounts;
  /** Ledger costs plus labour, per project id. */
  costsByProject: Amounts;
  /** Inactive projects that received an expense in the last days (see `projectHasRecentExpense`). */
  recentCostProjectIds: ReadonlySet<string> | readonly string[];
  clientNameOf: (project: Project) => string;
  /** The project's display name; defaults to `name`, then the id. */
  nameOf?: (project: Project) => string;
}

export const computeProfitability = ({
  projects,
  isActive,
  invoicedByProject,
  costsByProject,
  recentCostProjectIds,
  clientNameOf,
  nameOf = (p) => p.name?.trim() || p.id,
}: ProfitabilityInput): ProfitabilityData => {
  const recent = recentCostProjectIds instanceof Set ? recentCostProjectIds : new Set(recentCostProjectIds);

  const rows: ProfitabilityRow[] = [];
  for (const project of projects) {
    if (project.archived) continue;
    const active = isActive(project);
    if (!active && !recent.has(project.id)) continue;
    const invoiced = amountOf(invoicedByProject, project.id);
    const costs = amountOf(costsByProject, project.id);
    rows.push({
      projectId: project.id,
      name: nameOf(project),
      clientName: clientNameOf(project),
      inactive: !active,
      invoiced,
      costs,
      profit: invoiced - costs,
      costRatioPct: invoiced > 0 ? (costs / invoiced) * 100 : null,
    });
  }

  rows.sort((a, b) => Number(a.inactive) - Number(b.inactive) || b.invoiced - a.invoiced || a.name.localeCompare(b.name));

  const invoiced = rows.reduce((sum, r) => sum + r.invoiced, 0);
  const costs = rows.reduce((sum, r) => sum + r.costs, 0);
  return {
    rows,
    total: {
      projects: rows.length,
      invoiced,
      costs,
      profit: invoiced - costs,
      costRatioPct: invoiced > 0 ? (costs / invoiced) * 100 : null,
    },
  };
};

/** What time tracking knows about a project (a slice of `TimeTotals["byProject"]`). */
export type LabourTotals = Readonly<Record<string, { seconds: number; cost: number | null }>>;

/**
 * Is any of the listed projects' labour cost withheld from this user? True when a project has
 * tracked time and its `cost` is null (the server sends null where the user may not see costs).
 * `byProject` is null when time tracking is off: nothing is withheld then.
 */
export const isLabourCostHidden = (projectIds: Iterable<string>, byProject: LabourTotals | null): boolean => {
  if (!byProject) return false;
  for (const id of projectIds) {
    const entry = byProject[id];
    if (entry && entry.seconds > 0 && entry.cost === null) return true;
  }
  return false;
};

/* ------------------------------------------------------------------ input builders */

export interface ProjectInvoicedInput {
  project: Project;
  projectType?: ProjectType;
  /** The lead the project is paired with. */
  lead?: Lead;
  defaultCurrency: string;
  financialRecords: readonly FinancialRecord[];
  invoicesOffers: readonly InvoiceOffer[];
  invoiceStatuses: readonly OfferStatusDef[];
  siblingProjects?: readonly Project[];
  projectTypes?: readonly ProjectType[];
  netMode?: boolean;
}

/**
 * What has been invoiced for a project: the project Finances tab's figure (`projectBilling(...).invoiced`)
 * when the ledger has records, otherwise the live invoices of the project's lead.
 */
export const projectInvoicedAmount = ({
  project,
  projectType,
  lead,
  defaultCurrency,
  financialRecords,
  invoicesOffers,
  invoiceStatuses,
  siblingProjects,
  projectTypes,
  netMode,
}: ProjectInvoicedInput): number => {
  if (financialRecords.length > 0) {
    const value = resolveProjectValue(project, projectType, lead, defaultCurrency, {
      siblingProjects,
      projectTypes,
      netMode,
      invoicesOffers,
    }).value;
    return projectBilling(value, financialRecords as FinancialRecord[], project.id).invoiced;
  }
  if (!project.leadId) return 0;
  return invoicesOffers
    .filter((io) => io.leadId === project.leadId && io.type === "invoice" && isLiveInvoiceStatus(io.status, invoiceStatuses))
    .reduce((sum, io) => sum + effectiveDocumentAmount(io, Boolean(netMode)), 0);
};

/**
 * The project's expense records summed. `real` is what has moved (`movementAmounts(...).real`, the
 * rule of the project detail's "real expenses"); `all` also counts what is still expected: every
 * non-cancelled expense at its real amount once paid and its planned amount until then.
 */
export const projectExpenseCosts = (records: readonly FinancialRecord[], projectId: string, mode: "real" | "all"): number => {
  let sum = 0;
  for (const rec of records) {
    if (rec.projectId !== projectId || rec.type !== "expense") continue;
    const { real, estimated } = movementAmounts(rec);
    sum += mode === "real" ? real : real + estimated;
  }
  return sum;
};

/** Did the project get an expense (a real movement, not cancelled) in the last `days` days, today included? */
export const projectHasRecentExpense = (records: readonly FinancialRecord[], projectId: string, today: Date, days = RECENT_DAYS): boolean =>
  records.some((rec) => {
    if (rec.projectId !== projectId || rec.type !== "expense" || rec.isRecurring || rec.status === "cancelled") return false;
    const date = parseAppDate(rec.paidDate || rec.issueDate);
    if (!date) return false;
    const age = dayDiff(date, today);
    return age >= 0 && age <= days;
  });

/**
 * The projects that got worked time in the last `days` days, today included (by the entry's
 * company-timezone day). Labour is a cost too, so such a project stays listed while inactive.
 * One pass over the entries; a running entry has no worked time yet and does not count.
 */
export const projectsWithRecentLabour = (entries: readonly TimeEntry[], today: Date, days = RECENT_DAYS): Set<string> => {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.projectId || entryWorkedMs(entry) <= 0) continue;
    const date = parseAppDate((entry.entryDate ?? "").slice(0, 10));
    if (!date) continue;
    const age = dayDiff(date, today);
    if (age >= 0 && age <= days) ids.add(entry.projectId);
  }
  return ids;
};
