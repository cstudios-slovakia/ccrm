import { normalizeSystemTitleOverride } from "./brand";
import { listIdsSignature, normalizeListIds } from "./listIds";
import { normalizeLeadStateSla } from "./leadSla";
import { normalizeLeadAssignment } from "./leadAssignment";
import { normalizeLeadAttributes } from "./leadAttributes";
import { normalizeProjectAutoCreate } from "./projectAutoCreate";
import { normalizeTaskSettings } from "./taskConclusion";
import { sanitizeTimerActions } from "./taskStateTimerActions";
import { normalizeProjectStatusDefs } from "./projects";
import { normalizeInvoiceStatusDefs, normalizeOfferStatusDefs } from "./offerStatuses";
import { normalizePriceLevels } from "./priceLevels";
import { normalizeOrderStatusDefs } from "./orders";
import { normalizeTicketStatuses, normalizeTicketSettings } from "./tickets";

/**
 * Stable, order-fixed fingerprint of the settings block. Used to tell a genuine
 * user edit apart from merely re-receiving the server's own settings, so the
 * settings-sync effect never echoes server data back.
 */
export const computeSettingsSig = (s: any): string => {
  if (!s || typeof s !== "object") return "null";
  return JSON.stringify([
    normalizeSystemTitleOverride(s.systemName),
    s.systemLanguage ?? "",
    s.systemCurrency ?? "",
    s.leadStates ?? [],
    s.leadSources ?? [],
    s.leadCategories ?? [],
    s.divisions ?? [],
    listIdsSignature(normalizeListIds(s.leadSources ?? [], s.leadSourceIds)),
    listIdsSignature(normalizeListIds(s.leadCategories ?? [], s.leadCategoryIds)),
    s.leadStateColors && Object.keys(s.leadStateColors).length ? s.leadStateColors : null,
    s.leadSourceColors && Object.keys(s.leadSourceColors).length ? s.leadSourceColors : null,
    s.leadCategoryColors && Object.keys(s.leadCategoryColors).length ? s.leadCategoryColors : null,
    s.divisionColors && Object.keys(s.divisionColors).length ? s.divisionColors : null,
    s.leadStageGroups && Object.keys(s.leadStageGroups).length ? s.leadStageGroups : null,
    s.leadStateParents && Object.keys(s.leadStateParents).length ? s.leadStateParents : null,
    s.leadStateFollowUp && Object.keys(s.leadStateFollowUp).length ? s.leadStateFollowUp : null,
    s.leadStatePipelineHidden && Object.keys(s.leadStatePipelineHidden).length ? s.leadStatePipelineHidden : null,
    normalizeLeadStateSla(s.leadStateSla),
    normalizeLeadAssignment(s.leadAssignment),
    normalizeLeadAttributes(s.leadAttributes),
    normalizeProjectAutoCreate(s.projectAutoCreate),
    s.taskStates ?? [],
    s.taskStateColors && Object.keys(s.taskStateColors).length ? s.taskStateColors : null,
    sanitizeTimerActions(s.taskStateTimerActions),
    normalizeTaskSettings(s.taskSettings),
    normalizeProjectStatusDefs(s.projectStatuses),
    normalizeOfferStatusDefs(s.offerStatuses),
    normalizeInvoiceStatusDefs(s.invoiceStatuses),
    normalizePriceLevels(s.priceLevels),
    normalizeOrderStatusDefs(s.orderStatuses),
    normalizeTicketStatuses(s.ticketStatuses),
    normalizeTicketSettings(s.ticketSettings),
    s.integrationsConfig ?? null,
    s.companyBillingSettings ?? null,
    s.invoicingIntegrations ?? null,
    s.financialMode ?? "connected",
    s.financialSimplifiedTable ?? null,
  ]);
};

/** Signature of an entire sync.php push payload (minus baseSyncedAt). */
export const computePushSig = (p: {
  leads?: unknown; tasks?: unknown; recurringTasks?: unknown; users?: unknown; roles?: unknown;
  meetingNotes?: unknown; unifiedEntries?: unknown; unifiedEntriesData?: unknown;
  customDashboards?: unknown; projectTypes?: unknown; projects?: unknown;
  warehouses?: unknown; suppliers?: unknown; warehouseItems?: unknown;
  warehouseStock?: unknown; warehouseBatches?: unknown; warehouseMovements?: unknown;
  financialCategories?: unknown; financialRecords?: unknown;
  financialMode?: unknown; financialSimplifiedTable?: unknown;
  invoicesOffers?: unknown; aiCustomTemplates?: unknown; clientCategories?: unknown; offerCategories?: unknown;
  employees?: unknown; employeeSalaries?: unknown; employeeVacations?: unknown; employeeSettings?: unknown;
  orders?: unknown;
  tickets?: unknown; supportContracts?: unknown;
  settings?: any;
}): string => JSON.stringify([
  p.leads, p.tasks, p.recurringTasks, p.users, p.roles, p.meetingNotes, p.unifiedEntries,
  p.unifiedEntriesData, p.customDashboards, p.projectTypes, p.projects,
  p.warehouses, p.suppliers, p.warehouseItems, p.warehouseStock, p.warehouseBatches, p.warehouseMovements,
  p.financialCategories, p.financialRecords,
  p.financialMode, p.financialSimplifiedTable,
  p.invoicesOffers, p.aiCustomTemplates, p.clientCategories, p.offerCategories,
  p.employees, p.employeeSalaries, p.employeeVacations, p.employeeSettings,
  p.orders,
  p.tickets, p.supportContracts,
  computeSettingsSig(p.settings),
]);
