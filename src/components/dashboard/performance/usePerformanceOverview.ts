/**
 * Assembles the data of the "Výkonnostný prehľad" tab from the dashboard's raw collections.
 *
 * Pure wiring: every figure comes from a function in `src/utils/performance/` or from an existing
 * app helper. Nothing here sums, divides or compares dates; if that is needed it belongs in the
 * utils with a unit test. Each section is memoised on the collections it reads.
 *
 * Without `canSeeFinancials` the Financie section and the project profitability are not computed
 * at all (they stay empty); the widgets hide them anyway.
 */

import { useMemo } from "react";
import type {
  Employee,
  FinancialRecord,
  InvoiceOffer,
  Lead,
  Project,
  ProjectType,
  Task,
  Ticket,
  TicketSettingsConfig,
  TicketStatusDef,
} from "../../../types";
import type { Language } from "../../../utils/translations";
import type { StatusStatGroup } from "../../GroupedStatusValueEquationStats";
import type { FinanceInput } from "../../../utils/marketingRoi";
import { DEFAULT_INVOICE_STATUS_DEFS, DEFAULT_OFFER_STATUS_DEFS, type OfferStatusDef } from "../../../utils/offerStatuses";
import { resolveLinkedClient } from "../../../utils/leadClient";
import { openProjectStatuses, projectDisplayName, type ProjectStatusDef } from "../../../utils/projects";
import { resolveTicketSlaTargetMinutes } from "../../../utils/tickets";
import { useTimeTracking } from "../../../hooks/useTimeTracking";
import { computeCashflow } from "../../../utils/performance/cashflow";
import { computeDeployments } from "../../../utils/performance/deployments";
import { computeDeadlines } from "../../../utils/performance/deadlines";
import { computeDso } from "../../../utils/performance/dso";
import { buildInvoicingData } from "../../../utils/performance/invoicing";
import { periodLabels } from "../../../utils/performance/labels";
import { buildKpiStrip, computeLeadKpis } from "../../../utils/performance/leadKpis";
import { computeOfferSuccess } from "../../../utils/performance/offers";
import { buildPeriod, periodPresetFromName } from "../../../utils/performance/period";
import {
  computeProfitability,
  projectExpenseCosts,
  projectHasRecentExpense,
  projectInvoicedAmount,
  projectsWithRecentLabour,
  isLabourCostHidden,
} from "../../../utils/performance/profitability";
import { computeRecurringIncome } from "../../../utils/performance/recurringIncome";
import { computeReworkCount, computeReworkRatio } from "../../../utils/performance/rework";
import { computeScopeCreep } from "../../../utils/performance/scopeCreep";
import { computeAssignedTasks, computeThroughput } from "../../../utils/performance/tasks";
import { computeUtilization } from "../../../utils/performance/utilization";
import { computeResponseTime, computeTicketsByStatus, firstResponseWithinSla } from "../../../utils/performance/tickets";
import { useOverviewPushes } from "./useOverviewPushes";
import { useOverviewTimeEntries } from "./useOverviewTimeEntries";
import type {
  CashflowData,
  DeploymentsState,
  DsoData,
  PerformanceOverviewData,
  ProfitabilityData,
  RecurringIncomeData,
  UtilizationState,
} from "./types";

export interface PerformanceOverviewInput {
  /** The one clock of this render pass. */
  today: Date;
  /** The tab is shown: only then are the time entries of the team fetched. */
  active: boolean;
  language: Language;
  /** The dashboard's preset name ("This month", "Custom Range", "All Time") and its bounds. */
  presetName: string;
  startDate: Date | null;
  endDate: Date | null;
  canSeeFinancials: boolean;

  leads: readonly Lead[];
  leadStageGroups: Record<string, string>;
  leadStateParents: Record<string, string>;

  invoicesOffers: readonly InvoiceOffer[];
  /** Settings → Invoice / Offer statuses; undefined falls back to the defaults, as everywhere else. */
  invoiceStatuses?: readonly OfferStatusDef[];
  offerStatuses?: readonly OfferStatusDef[];

  financeInput: FinanceInput;
  financialRecords: readonly FinancialRecord[];
  /** The translated "Uncategorized" label of the Finance tab. */
  uncategorizedLabel: string;

  /** The groups behind "Na fakturovanie" and the per-user list of unticked `<group>:<status>` keys. */
  invoicingGroups: readonly StatusStatGroup[];
  excludedStatusKeys: readonly string[];

  projects: readonly Project[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatusDef[];
  defaultCurrency: string;
  netMode?: boolean;

  tasks: readonly Task[];
  taskStates: string[];
  employees: readonly Employee[];

  tickets: readonly Ticket[];
  ticketStatuses: readonly TicketStatusDef[];
  ticketSettings: TicketSettingsConfig | null | undefined;
}

const EMPTY_CASHFLOW: CashflowData = { periodIncome: 0, periodExpenses: 0, months: [], scaleMax: 0 };
const EMPTY_RECURRING: RecurringIncomeData = { monthly: 0, deltaMonthly: null, yearly: 0, shareOfIncomePct: null, breakdown: [] };
const EMPTY_DSO: DsoData = { averageDays: null, deltaDays: null, paymentTermDays: null, worst: [], best: [] };
const EMPTY_PROFITABILITY: ProfitabilityData = {
  rows: [],
  total: { projects: 0, invoiced: 0, costs: 0, profit: 0, costRatioPct: null },
};

export const usePerformanceOverview = (input: PerformanceOverviewInput): PerformanceOverviewData => {
  const {
    today, active, language, presetName, startDate, endDate, canSeeFinancials,
    leads, leadStageGroups, leadStateParents,
    invoicesOffers,
    financeInput, financialRecords, uncategorizedLabel,
    invoicingGroups, excludedStatusKeys,
    projects, projectTypes, projectStatuses, defaultCurrency, netMode,
    tasks, taskStates, employees,
    tickets, ticketStatuses, ticketSettings,
  } = input;

  const invoiceStatuses = input.invoiceStatuses ?? DEFAULT_INVOICE_STATUS_DEFS;
  const offerStatuses = input.offerStatuses ?? DEFAULT_OFFER_STATUS_DEFS;
  const timeTracking = useTimeTracking();
  const labourByProject = timeTracking.enabled ? timeTracking.totals.byProject : null;

  const period = useMemo(
    () => buildPeriod(periodPresetFromName(presetName), startDate, endDate, today),
    [presetName, startDate, endDate, today],
  );
  const labels = useMemo(() => periodLabels(period, language, today), [period, language, today]);

  // Worked time of the whole team: Utilizácia and the recent labour of inactive projects.
  const timeEntries = useOverviewTimeEntries(active, period, today);
  const recentLabourProjectIds = useMemo(() => projectsWithRecentLabour(timeEntries.entries, today), [timeEntries.entries, today]);

  const kpiStrip = useMemo(() => {
    const current = computeLeadKpis(leads, { start: period.start, end: period.end }, leadStageGroups, leadStateParents);
    const previous =
      period.previousStart && period.previousEnd
        ? computeLeadKpis(leads, { start: period.previousStart, end: period.previousEnd }, leadStageGroups, leadStateParents)
        : null;
    const offerSuccess = computeOfferSuccess(invoicesOffers, offerStatuses, period, today);
    return buildKpiStrip({ current, previous, offerSuccess, period });
  }, [leads, leadStageGroups, leadStateParents, invoicesOffers, offerStatuses, period, today]);

  const invoicing = useMemo(
    () => buildInvoicingData(invoicingGroups, excludedStatusKeys),
    [invoicingGroups, excludedStatusKeys],
  );

  const cashflow = useMemo(
    () => (canSeeFinancials ? computeCashflow(financeInput, period, today) : EMPTY_CASHFLOW),
    [canSeeFinancials, financeInput, period, today],
  );
  const recurringIncome = useMemo(
    () => (canSeeFinancials ? computeRecurringIncome(financeInput, period, today, { uncategorizedLabel }) : EMPTY_RECURRING),
    [canSeeFinancials, financeInput, period, today, uncategorizedLabel],
  );
  const dso = useMemo(
    () => (canSeeFinancials ? computeDso({ invoices: invoicesOffers, financialRecords, leads, projects, invoiceStatuses, period }) : EMPTY_DSO),
    [canSeeFinancials, invoicesOffers, financialRecords, leads, projects, invoiceStatuses, period],
  );

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const isActive = useMemo(() => {
    const open = openProjectStatuses(projectStatuses);
    return (project: Project) => open.includes(project.status);
  }, [projectStatuses]);
  /** What the widgets call a project: its own name, else the paired lead's, else its id. */
  const nameOf = useMemo(() => (project: Project): string => projectDisplayName(project, leads as Lead[], project.id), [leads]);
  /** The project's client: its own `clientId`, else the client its lead is linked to, else the lead. */
  const clientNameOf = useMemo(
    () => (project: Project): string => {
      const direct = project.clientId ? leadById.get(project.clientId) : undefined;
      if (direct) return direct.name;
      const lead = project.leadId ? leadById.get(project.leadId) : undefined;
      if (!lead) return "";
      return (resolveLinkedClient(lead, leads as Lead[]) ?? lead).name;
    },
    [leadById, leads],
  );

  const profitability = useMemo(() => {
    if (!canSeeFinancials) return EMPTY_PROFITABILITY;
    const recordsByProject = new Map<string, FinancialRecord[]>();
    for (const record of financialRecords) {
      if (!record.projectId) continue;
      const list = recordsByProject.get(record.projectId);
      if (list) list.push(record);
      else recordsByProject.set(record.projectId, [record]);
    }
    const invoicedByProject = new Map<string, number>();
    const costsByProject = new Map<string, number>();
    const recentCostProjectIds = new Set<string>();
    for (const project of projects) {
      if (project.archived) continue;
      const own = recordsByProject.get(project.id) ?? [];
      const active = isActive(project);
      if (!active) {
        if (!projectHasRecentExpense(own, project.id, today) && !recentLabourProjectIds.has(project.id)) continue;
        recentCostProjectIds.add(project.id);
      }
      invoicedByProject.set(
        project.id,
        projectInvoicedAmount({
          project,
          projectType: projectTypes.find((type) => type.id === project.projectTypeId),
          lead: project.leadId ? leadById.get(project.leadId) : undefined,
          defaultCurrency,
          financialRecords,
          invoicesOffers,
          invoiceStatuses,
          siblingProjects: projects,
          projectTypes,
          netMode,
        }),
      );
      costsByProject.set(project.id, projectExpenseCosts(own, project.id, "real") + (labourByProject?.[project.id]?.cost ?? 0));
    }
    const data = computeProfitability({ projects, isActive, invoicedByProject, costsByProject, recentCostProjectIds, clientNameOf, nameOf });
    return { ...data, labourCostHidden: isLabourCostHidden(data.rows.map((row) => row.projectId), labourByProject) };
  }, [
    canSeeFinancials, projects, projectTypes, isActive, financialRecords, invoicesOffers, invoiceStatuses,
    defaultCurrency, netMode, leadById, clientNameOf, nameOf, labourByProject, recentLabourProjectIds, today,
  ]);

  const deadlines = useMemo(
    () => computeDeadlines({ projects, isActive, clientNameOf, nameOf, today, soonDays: 14, limit: 7 }),
    [projects, isActive, clientNameOf, nameOf, today],
  );

  // GitHub pushes: fetched only while the tab is shown and at least one project is paired.
  const pairedProjects = useMemo(() => projects.filter((project) => !project.archived && Boolean(project.githubRepo)), [projects]);
  const pushes = useOverviewPushes(active && pairedProjects.length > 0, period);
  const deploymentsState: DeploymentsState =
    pushes.status === "ready" ? "ready" : pushes.status === "failed" ? "failed" : pushes.status === "forbidden" ? "forbidden" : "loading";
  const deployments = useMemo(
    () => (pushes.summary && deploymentsState === "ready" && pairedProjects.length > 0
      ? computeDeployments({ summary: pushes.summary, projects: projects.filter((project) => !project.archived), now: today, nameOf })
      : null),
    [pushes.summary, deploymentsState, pairedProjects, projects, today, nameOf],
  );

  const scopeCreep = useMemo(() => computeScopeCreep({ projects, period, nameOf }), [projects, period, nameOf]);

  const throughput = useMemo(
    () => computeThroughput({ tasks, projects, taskStates, period, nameOf }),
    [tasks, projects, taskStates, period, nameOf],
  );
  const assignedTasks = useMemo(
    () => computeAssignedTasks({ tasks, employees, taskStates, today }),
    [tasks, employees, taskStates, today],
  );

  const reworkRatio = useMemo(
    () => computeReworkRatio({ tasks, employees, taskStates, period }),
    [tasks, employees, taskStates, period],
  );
  const reworkCount = useMemo(() => computeReworkCount({ tasks, projects, period, nameOf }), [tasks, projects, period, nameOf]);

  const utilizationState: UtilizationState =
    timeEntries.status === "ready" ? "ready"
    : timeEntries.status === "forbidden" ? "time-tracking"
    : timeEntries.status === "failed" ? "failed"
    : "loading";
  const utilization = useMemo(
    () => (utilizationState === "ready" ? computeUtilization({ entries: timeEntries.entries, tasks, employees, period }) : null),
    [utilizationState, timeEntries.entries, tasks, employees, period],
  );

  const ticketsByStatus = useMemo(
    () => computeTicketsByStatus({ tickets, ticketStatuses, period }),
    [tickets, ticketStatuses, period],
  );
  const responseTime = useMemo(
    () =>
      computeResponseTime({
        tickets,
        period,
        today,
        slaMs: resolveTicketSlaTargetMinutes("normal", ticketSettings).firstResponseMins * 60_000,
        isWithinSla: firstResponseWithinSla,
      }),
    [tickets, period, today, ticketSettings],
  );

  return useMemo<PerformanceOverviewData>(
    () => ({
      period,
      labels,
      kpis: kpiStrip,
      invoicing,
      cashflow,
      recurringIncome,
      dso,
      profitability,
      deadlines,
      scopeCreep,
      deployments,
      // No paired project: nothing to load, the card shows its "not connected" state.
      deploymentsState: pairedProjects.length > 0 ? deploymentsState : undefined,
      throughput,
      utilization,
      utilizationState,
      utilizationTruncated: timeEntries.truncated,
      assignedTasks,
      reworkRatio,
      reworkCount,
      ticketsByStatus,
      responseTime,
    }),
    [
      period, labels, kpiStrip, invoicing, cashflow, recurringIncome, dso, profitability, deadlines, scopeCreep,
      deployments, deploymentsState, pairedProjects.length, throughput, utilization, utilizationState, timeEntries.truncated, assignedTasks, reworkRatio, reworkCount, ticketsByStatus, responseTime,
    ],
  );
};
