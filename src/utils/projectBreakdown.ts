/**
 * Pure domain calculation engine & column catalogue for the #projects Breakdown view
 * (Client -> Project -> Employee). Zero React / DOM dependencies so every formula
 * can be unit-tested directly.
 */

import type {
  Employee,
  EmployeeSalary,
  FinancialRecord,
  Lead,
  Project,
  ProjectType,
  SupportContract,
  Task,
  Ticket,
  TicketStatusDef,
  UserProfile,
} from "../types";
import type { ProjectStatusDef } from "./projects.ts";
import { movementAmounts } from "./financialOverviewTable.ts";
import { projectBilling, resolveProjectValue } from "./projectBilling.ts";
import { isDoneTaskState } from "./projectTasks.ts";
import {
  evaluateProjectDeadline,
  projectDisplayName,
  projectNeedsDelayReason,
  type ProjectDeadlineStatus,
} from "./projects.ts";
import { moveRelative, type DropPosition } from "./reorder.ts";
import { computeProjectRetainerUsage, evaluateTicketSla, isClosedTicketStatus } from "./tickets.ts";

export type BreakdownColumnKey =
  | "entity"
  | "value"
  | "invoicable"
  | "stillToBePaid"
  | "timeWorked"
  | "laborAndSalary"
  | "margin"
  | "effectiveRate"
  | "tasksCount"
  | "tasksReopened"
  | "tasksWait"
  | "deadlineHealth"
  | "ticketsCount"
  | "ticketsReopened"
  | "ticketsWait";

export type BreakdownSortKey =
  | "name"
  | "value"
  | "invoicable"
  | "stillToBePaid"
  | "timeWorked"
  | "laborCost"
  | "margin"
  | "effectiveRate"
  | "tasksOpen"
  | "tasksReopened"
  | "tasksWait"
  | "ticketsOpen"
  | "ticketsWait";

export type BreakdownHealthFilter =
  | "all"
  | "at_risk"
  | "unbilled"
  | "overdue"
  | "bottlenecks";

export type BreakdownPeriodPreset =
  | "all"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year";

export type BreakdownPresetId = "all" | "financial" | "delivery";

export interface BreakdownColumnDef {
  key: BreakdownColumnKey;
  labels: [string, string, string]; // [en, sk, hu]
  align: "left" | "right" | "center";
  requiresCosts?: boolean;
  requiresFinance?: boolean;
  locked?: boolean;
}

export const BREAKDOWN_COLUMNS: readonly BreakdownColumnDef[] = [
  { key: "entity", labels: ["Client / Project / Employee", "Klient / Projekt / Zamestnanec", "Ügyfél / Projekt / Alkalmazott"], align: "left", locked: true },
  { key: "value", labels: ["Total Value", "Celková hodnota", "Teljes érték"], align: "right" },
  { key: "invoicable", labels: ["Remaining Invoiceable", "Zostáva vyfakturovať", "Számlázható"], align: "right" },
  { key: "stillToBePaid", labels: ["Yet to be Paid", "Zostáva uhradiť", "Még fizetendő"], align: "right" },
  { key: "timeWorked", labels: ["Time Worked", "Odpracovaný čas", "Ledolgozott idő"], align: "right" },
  { key: "laborAndSalary", labels: ["Labor Cost / Salary", "Náklady práce / Mzda", "Bérköltség / Bér"], align: "right", requiresCosts: true },
  { key: "margin", labels: ["Gross Margin", "Hrubá marža", "Bruttó árrés"], align: "right", requiresCosts: true, requiresFinance: true },
  { key: "effectiveRate", labels: ["Effective Rate", "Efektívna sadzba", "Effektív óradíj"], align: "right" },
  { key: "tasksCount", labels: ["Tasks", "Úlohy", "Feladatok"], align: "center" },
  { key: "tasksReopened", labels: ["Reopened Tasks", "Znovu otvorené úlohy", "Újranyitott feladatok"], align: "center" },
  { key: "tasksWait", labels: ["Task Queue Wait", "Čakanie úloh", "Feladat várakozás"], align: "right" },
  { key: "deadlineHealth", labels: ["Schedule & Slips", "Termíny a posuny", "Határidők és csúszások"], align: "center" },
  { key: "ticketsCount", labels: ["Tickets", "Tikety", "Jegyek"], align: "center" },
  { key: "ticketsReopened", labels: ["Reopened Tickets", "Znovu otvorené tikety", "Újranyitott jegyek"], align: "center" },
  { key: "ticketsWait", labels: ["Ticket Queue Wait", "Čakanie tiketov", "Jegy várakozás"], align: "right" },
];

export interface BreakdownColumnConfig {
  key: BreakdownColumnKey;
  visible: boolean;
}

export interface BreakdownRights {
  canSeeCosts: boolean;
  canSeeFinance: boolean;
  canSeeSalaries: boolean;
}

export const isBreakdownColumnAllowed = (def: BreakdownColumnDef, rights: BreakdownRights): boolean => {
  if (def.requiresCosts && !rights.canSeeCosts) return false;
  if (def.requiresFinance && !rights.canSeeFinance) return false;
  return true;
};

export function reconcileBreakdownColumns(
  saved: readonly { key: string; visible: boolean }[] | null | undefined,
  rights: BreakdownRights,
): BreakdownColumnConfig[] {
  const allowedDefs = BREAKDOWN_COLUMNS.filter((d) => isBreakdownColumnAllowed(d, rights));
  const allowedByKey = new Map(allowedDefs.map((d) => [d.key, d]));
  const result: BreakdownColumnConfig[] = [{ key: "entity", visible: true }];
  const seen = new Set<BreakdownColumnKey>(["entity"]);

  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (!item || typeof item.key !== "string") continue;
      const key = item.key as BreakdownColumnKey;
      if (key === "entity" || seen.has(key) || !allowedByKey.has(key)) continue;
      seen.add(key);
      result.push({ key, visible: Boolean(item.visible) });
    }
  }

  for (const def of allowedDefs) {
    if (seen.has(def.key)) continue;
    seen.add(def.key);
    result.push({ key: def.key, visible: true });
  }

  return result;
}

const PRESET_VISIBLE_KEYS: Record<BreakdownPresetId, ReadonlySet<BreakdownColumnKey>> = {
  all: new Set(BREAKDOWN_COLUMNS.map((c) => c.key)),
  financial: new Set(["entity", "value", "invoicable", "stillToBePaid", "timeWorked", "laborAndSalary", "margin", "effectiveRate"]),
  delivery: new Set(["entity", "timeWorked", "tasksCount", "tasksReopened", "tasksWait", "deadlineHealth", "ticketsCount", "ticketsReopened", "ticketsWait"]),
};

export function applyBreakdownPreset(
  preset: BreakdownPresetId,
  rights: BreakdownRights,
): BreakdownColumnConfig[] {
  const visibleSet = PRESET_VISIBLE_KEYS[preset];
  return BREAKDOWN_COLUMNS
    .filter((d) => isBreakdownColumnAllowed(d, rights))
    .map((d) => ({ key: d.key, visible: d.locked ? true : visibleSet.has(d.key) }));
}

export function moveBreakdownColumn(
  columns: readonly BreakdownColumnConfig[],
  dragKey: string,
  targetKey: string,
  position: DropPosition,
): BreakdownColumnConfig[] {
  if (dragKey === "entity" || targetKey === "entity") return [...columns];
  const moved = moveRelative(columns, c => c.key, dragKey, targetKey, position);
  const entityIdx = moved.findIndex(c => c.key === "entity");
  if (entityIdx > 0) {
    const [entityCol] = moved.splice(entityIdx, 1);
    moved.unshift({ ...entityCol, visible: true });
  } else if (entityIdx === 0) {
    moved[0] = { ...moved[0], visible: true };
  }
  return moved;
}

/* -------------------------------------------------------------------------- */
/* Period helpers                                                              */
/* -------------------------------------------------------------------------- */

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function periodRangeForPreset(
  preset: BreakdownPeriodPreset,
  refDate: Date = new Date(),
): { from?: string; to?: string } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  switch (preset) {
    case "this_month":
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return { from: isoDate(new Date(y, qStart, 1)), to: isoDate(new Date(y, qStart + 3, 0)) };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* Queue wait & timestamp helpers                                              */
/* -------------------------------------------------------------------------- */

export interface BreakdownTimePerson {
  userId: string;
  employeeId: string | null;
  seconds: number;
  billableSeconds: number;
  cost?: number | null;
}

export interface BreakdownTimeProject {
  seconds: number;
  billableSeconds: number;
  cost: number | null;
  people: BreakdownTimePerson[];
}

export interface BreakdownTimeData {
  canSeeAllCosts: boolean;
  byProject: Record<string, BreakdownTimeProject>;
  firstEntryAtByTask: Record<string, string>;
  firstEntryAtByTicket: Record<string, string>;
}

export const EMPTY_BREAKDOWN_TIME: BreakdownTimeData = {
  canSeeAllCosts: false,
  byProject: {},
  firstEntryAtByTask: {},
  firstEntryAtByTicket: {},
};

export function parseTimestampMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const ms = new Date(`${s}T00:00:00`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const INITIAL_TASK_STATES = new Set(["", "todo", "new", "nová", "nova", "nové", "nove", "új", "uj"]);

export function isInitialTaskState(status: string | null | undefined, taskStates: readonly string[] = []): boolean {
  const norm = String(status || "").trim().toLowerCase();
  if (INITIAL_TASK_STATES.has(norm)) return true;
  if (taskStates.length > 0 && norm === String(taskStates[0] || "").trim().toLowerCase()) return true;
  return false;
}

export interface QueueWaitSample {
  waitSeconds: number | null;
  isWaitingNow: boolean;
}

export function computeTaskQueueWaitSeconds(
  task: Pick<Task, "id" | "status" | "archived" | "createdAt" | "firstStartedAt" | "completedAt">,
  taskStates: string[],
  firstEntryAt: string | null | undefined,
  nowMs: number,
): QueueWaitSample {
  const createdMs = parseTimestampMs(task.createdAt);
  if (createdMs === null) return { waitSeconds: null, isWaitingNow: false };

  const candidates: number[] = [];
  for (const stamp of [task.firstStartedAt, firstEntryAt, task.completedAt]) {
    const ms = parseTimestampMs(stamp);
    if (ms !== null) candidates.push(ms);
  }
  if (candidates.length > 0) {
    const startedMs = Math.min(...candidates);
    return { waitSeconds: Math.max(0, Math.round((startedMs - createdMs) / 1000)), isWaitingNow: false };
  }

  const done = isDoneTaskState(task.status, taskStates);
  if (!done && !task.archived && isInitialTaskState(task.status, taskStates)) {
    return { waitSeconds: Math.max(0, Math.round((nowMs - createdMs) / 1000)), isWaitingNow: true };
  }
  return { waitSeconds: null, isWaitingNow: false };
}

export function computeTicketQueueWaitSeconds(
  ticket: Pick<Ticket, "id" | "status" | "archived" | "isArchived" | "createdAt" | "firstRespondedAt" | "slaFirstRespondedAt" | "resolvedAt" | "closedAt" | "messages">,
  ticketStatuses: TicketStatusDef[],
  firstEntryAt: string | null | undefined,
  nowMs: number,
): QueueWaitSample {
  const createdMs = parseTimestampMs(ticket.createdAt);
  if (createdMs === null) return { waitSeconds: null, isWaitingNow: false };

  const candidates: number[] = [];
  for (const stamp of [ticket.slaFirstRespondedAt, ticket.firstRespondedAt, firstEntryAt, ticket.resolvedAt, ticket.closedAt]) {
    const ms = parseTimestampMs(stamp);
    if (ms !== null) candidates.push(ms);
  }
  for (const msg of ticket.messages || []) {
    if (!msg) continue;
    if (msg.authorType === "agent" || msg.eventType === "status_changed") {
      const ms = parseTimestampMs(msg.createdAt);
      if (ms !== null) candidates.push(ms);
    }
  }
  if (candidates.length > 0) {
    const startedMs = Math.min(...candidates);
    return { waitSeconds: Math.max(0, Math.round((startedMs - createdMs) / 1000)), isWaitingNow: false };
  }

  const statusDef = ticketStatuses.find(s => s.id === ticket.status || s.key === ticket.status);
  const cat = statusDef?.category || statusDef?.group || (ticket.status === "new" ? "new" : "open");
  const isArch = Boolean(ticket.archived || ticket.isArchived);
  if (!isArch && !isClosedTicketStatus(ticket.status, ticketStatuses) && cat === "new") {
    return { waitSeconds: Math.max(0, Math.round((nowMs - createdMs) / 1000)), isWaitingNow: true };
  }
  return { waitSeconds: null, isWaitingNow: false };
}

export function formatWaitDuration(seconds: number | null | undefined, lang: string = "en"): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return "<1m";
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins}m`;
  const hours = s / 3600;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = hours / 24;
  const dUnit = lang === "sk" ? "d" : lang === "hu" ? "n" : "d";
  return days >= 10 ? `${Math.round(days)}${dUnit}` : `${days.toFixed(1)}${dUnit}`;
}

export function formatHoursShort(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return "0h";
  const totalMins = Math.round(s / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${pad2(m)}m` : `${h}h`;
}

/* -------------------------------------------------------------------------- */
/* Breakdown data tree                                                         */
/* -------------------------------------------------------------------------- */

export type MoneyMap = Record<string, number>;

export interface BreakdownWaitStats {
  avgSeconds: number | null;
  maxSeconds: number | null;
  waitingNowCount: number;
  sampleCount: number;
}

export interface BreakdownTaskStats {
  total: number;
  open: number;
  done: number;
  overdue: number;
  reopened: number;
  deadlineMoves: number;
  wait: BreakdownWaitStats;
}

export interface BreakdownTicketStats {
  total: number;
  open: number;
  closed: number;
  slaBreached: number;
  reopened: number;
  wait: BreakdownWaitStats;
}

export interface BreakdownEmployeeRow {
  key: string;
  userId: string | null;
  employeeId: string | null;
  name: string;
  kind: "employee" | "contractor" | "ledger" | "user";
  seconds: number;
  billableSeconds: number;
  sharePercent: number;
  /** Allocated labor cost on this project (null if hidden by RBAC or unrated). */
  laborCost: number | null;
  costVisible: boolean;
  /** Contract base salary amount and cadence from Employee profile. */
  contractSalaryAmount: number | null;
  contractSalaryType: "monthly" | "daily" | "hourly" | null;
  /** Most recent recorded payslip totalSalary + periodKey. */
  lastSalaryAmount: number | null;
  lastSalaryPeriod: string | null;
  salaryVisible: boolean;
  effectiveCostRatePerHour: number | null;
  tasks: BreakdownTaskStats;
  ticketsCount: number;
  ticketsOpen: number;
  ticketsReopened: number;
}

export interface BreakdownProjectRow {
  project: Project;
  projectType?: ProjectType;
  name: string;
  currency: string;
  hasValue: boolean;
  value: number;
  invoiced: number;
  received: number;
  invoicedOpen: number;
  invoicable: number;
  stillToBePaid: number;
  directExpenses: number;
  laborCost: number | null;
  totalCost: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  seconds: number;
  billableSeconds: number;
  hoursBudget: number | null;
  retainerMonthlyHours: number | null;
  retainerUsedHours: number | null;
  retainerOverageMinutes: number;
  effectiveHourlyRate: number | null;
  deadlineStatus: ProjectDeadlineStatus | null;
  needsDelayReason: boolean;
  tasks: BreakdownTaskStats;
  tickets: BreakdownTicketStats;
  employees: BreakdownEmployeeRow[];
  healthFlags: {
    atRisk: boolean;
    unbilled: boolean;
    overdue: boolean;
    bottlenecks: boolean;
  };
}

export interface BreakdownClientRow {
  key: string;
  name: string;
  record?: Lead;
  isUnassigned: boolean;
  projectCount: number;
  projects: BreakdownProjectRow[];
  valueByCurrency: MoneyMap;
  invoicableByCurrency: MoneyMap;
  stillToBePaidByCurrency: MoneyMap;
  directExpensesByCurrency: MoneyMap;
  laborCost: number | null;
  marginByCurrency: MoneyMap | null;
  marginPercent: number | null;
  seconds: number;
  billableSeconds: number;
  effectiveHourlyRateByCurrency: MoneyMap;
  overdueProjectsCount: number;
  unexplainedDelayCount: number;
  tasks: BreakdownTaskStats;
  tickets: BreakdownTicketStats;
  healthFlags: {
    atRisk: boolean;
    unbilled: boolean;
    overdue: boolean;
    bottlenecks: boolean;
  };
}

export interface BreakdownPortfolioSummary {
  clientCount: number;
  projectCount: number;
  valueByCurrency: MoneyMap;
  receivedByCurrency: MoneyMap;
  invoicableByCurrency: MoneyMap;
  stillToBePaidByCurrency: MoneyMap;
  laborCost: number | null;
  directExpensesByCurrency: MoneyMap;
  marginByCurrency: MoneyMap | null;
  marginPercent: number | null;
  totalSeconds: number;
  billableSeconds: number;
  effectiveHourlyRateByCurrency: MoneyMap;
  atRiskProjects: number;
  overdueProjects: number;
  totalTasksOpen: number;
  totalTasksWaitingNow: number;
  totalTasksReopened: number;
  totalTicketsOpen: number;
  totalTicketsWaitingNow: number;
  totalTicketsReopened: number;
  totalTicketsSlaBreached: number;
}

export interface BuildProjectBreakdownInput {
  projects: readonly Project[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatusDef[];
  leads: readonly Lead[];
  financialRecords: readonly FinancialRecord[];
  tasks: readonly Task[];
  taskStates: string[];
  tickets: readonly Ticket[];
  ticketStatuses: TicketStatusDef[];
  supportContracts: readonly SupportContract[];
  users: readonly UserProfile[];
  employees?: readonly Employee[];
  employeeSalaries?: readonly EmployeeSalary[];
  timeData: BreakdownTimeData;
  defaultCurrency: string;
  rights: BreakdownRights;
  healthFilter?: BreakdownHealthFilter;
  sort?: { key: BreakdownSortKey; direction: "asc" | "desc" };
  today: string;
  nowStamp: string;
  nowMs: number;
  unassignedLabel?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function addMoneyMap(target: MoneyMap, currency: string, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  target[currency] = round2((target[currency] ?? 0) + amount);
}

function emptyWaitStats(): BreakdownWaitStats {
  return { avgSeconds: null, maxSeconds: null, waitingNowCount: 0, sampleCount: 0 };
}

function emptyTaskStats(): BreakdownTaskStats {
  return { total: 0, open: 0, done: 0, overdue: 0, reopened: 0, deadlineMoves: 0, wait: emptyWaitStats() };
}

function emptyTicketStats(): BreakdownTicketStats {
  return { total: 0, open: 0, closed: 0, slaBreached: 0, reopened: 0, wait: emptyWaitStats() };
}

class WaitAccumulator {
  private sum = 0;
  private count = 0;
  private max: number | null = null;
  private waitingNow = 0;

  add(sample: QueueWaitSample): void {
    if (sample.isWaitingNow) this.waitingNow++;
    if (sample.waitSeconds !== null && Number.isFinite(sample.waitSeconds)) {
      this.sum += sample.waitSeconds;
      this.count++;
      this.max = this.max === null ? sample.waitSeconds : Math.max(this.max, sample.waitSeconds);
    }
  }

  merge(other: BreakdownWaitStats): void {
    this.waitingNow += other.waitingNowCount;
    if (other.sampleCount > 0 && other.avgSeconds !== null) {
      this.sum += other.avgSeconds * other.sampleCount;
      this.count += other.sampleCount;
    }
    if (other.maxSeconds !== null) {
      this.max = this.max === null ? other.maxSeconds : Math.max(this.max, other.maxSeconds);
    }
  }

  finish(): BreakdownWaitStats {
    return {
      avgSeconds: this.count > 0 ? Math.round(this.sum / this.count) : null,
      maxSeconds: this.max,
      waitingNowCount: this.waitingNow,
      sampleCount: this.count,
    };
  }
}

export function resolveProjectClientGroup(
  project: Pick<Project, "clientId" | "leadId">,
  leadsById: Map<string, Lead>,
  unassignedLabel: string = "Internal / Unassigned",
): { key: string; name: string; record?: Lead; isUnassigned: boolean } {
  const directLead = (project.clientId && leadsById.get(project.clientId))
    || (project.leadId && leadsById.get(project.leadId))
    || undefined;
  if (!directLead) {
    return { key: "__unassigned__", name: unassignedLabel, isUnassigned: true };
  }
  const canonical = (directLead.clientId && leadsById.get(directLead.clientId)) || directLead;
  return {
    key: canonical.id,
    name: canonical.name || directLead.name || unassignedLabel,
    record: canonical,
    isUnassigned: false,
  };
}

function isTaskOverdueAt(task: Pick<Task, "status" | "deadline" | "deadlineTime">, taskStates: string[], nowStamp: string): boolean {
  if (isDoneTaskState(task.status, taskStates) || !task.deadline) return false;
  const [curDate = "", curTime = "00:00"] = nowStamp.split(" ");
  if (task.deadline < curDate) return true;
  if (task.deadline === curDate) return (task.deadlineTime || "23:59") < curTime;
  return false;
}

const normName = (s: string | null | undefined) => String(s || "").trim().toLowerCase();

function primaryCurrencyValue(map: MoneyMap, defaultCurrency: string): number {
  if (defaultCurrency in map) return map[defaultCurrency];
  const vals = Object.values(map);
  return vals.reduce((s, v) => s + v, 0);
}

export function buildProjectBreakdown(input: BuildProjectBreakdownInput): {
  clients: BreakdownClientRow[];
  summary: BreakdownPortfolioSummary;
} {
  const {
    projects,
    projectTypes,
    projectStatuses,
    leads,
    financialRecords,
    tasks,
    taskStates,
    tickets,
    ticketStatuses,
    supportContracts,
    users,
    employees = [],
    employeeSalaries = [],
    timeData,
    defaultCurrency,
    rights,
    healthFilter = "all",
    sort = { key: "value", direction: "desc" },
    today,
    nowStamp,
    nowMs,
    unassignedLabel = "Internal / Unassigned",
  } = input;

  const leadsById = new Map(leads.map(l => [l.id, l]));
  const typesById = new Map(projectTypes.map(pt => [pt.id, pt]));
  const usersById = new Map(users.map(u => [u.id, u]));
  const usersByName = new Map(users.map(u => [normName(u.name), u]));
  const employeesById = new Map(employees.map(e => [e.id, e]));
  const employeesByUserId = new Map(employees.filter(e => e.userId).map(e => [e.userId!, e]));
  const employeesByName = new Map(employees.map(e => [normName(e.name), e]));

  const lastSalaryByEmployee = new Map<string, EmployeeSalary>();
  for (const sal of employeeSalaries) {
    const prev = lastSalaryByEmployee.get(sal.employeeId);
    if (!prev || sal.year > prev.year || (sal.year === prev.year && (sal.periodNumber || 0) > (prev.periodNumber || 0))) {
      lastSalaryByEmployee.set(sal.employeeId, sal);
    }
  }

  // Group direct expenses & tasks & tickets by project id in one linear pass each
  const expensesByProject = new Map<string, number>();
  for (const r of financialRecords) {
    if (!r.projectId || r.type !== "expense") continue;
    const { real, estimated } = movementAmounts(r);
    const amt = real + estimated;
    if (amt > 0) expensesByProject.set(r.projectId, round2((expensesByProject.get(r.projectId) ?? 0) + amt));
  }

  const tasksByProject = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.relatedProjectId || t.archived) continue;
    let arr = tasksByProject.get(t.relatedProjectId);
    if (!arr) { arr = []; tasksByProject.set(t.relatedProjectId, arr); }
    arr.push(t);
  }

  const ticketsByProject = new Map<string, Ticket[]>();
  for (const tk of tickets) {
    if (!tk.projectId || tk.archived || tk.isArchived) continue;
    let arr = ticketsByProject.get(tk.projectId);
    if (!arr) { arr = []; ticketsByProject.set(tk.projectId, arr); }
    arr.push(tk);
  }

  // Build project rows and group by client
  const clientMap = new Map<string, { key: string; name: string; record?: Lead; isUnassigned: boolean; projects: BreakdownProjectRow[] }>();

  for (const p of projects) {
    const pType = typesById.get(p.projectTypeId);
    const pairedLead = (p.leadId && leadsById.get(p.leadId)) || (p.clientId && leadsById.get(p.clientId)) || undefined;
    const contract = resolveProjectValue(p, pType, pairedLead, defaultCurrency);
    const billing = projectBilling(contract.value, financialRecords as FinancialRecord[], p.id);
    const directExpenses = expensesByProject.get(p.id) ?? 0;

    const pTime = timeData.byProject[p.id];
    const seconds = pTime?.seconds ?? 0;
    const billableSeconds = pTime?.billableSeconds ?? 0;
    const laborCost = rights.canSeeCosts ? (pTime?.cost ?? (seconds === 0 ? 0 : null)) : null;

    const totalCost = laborCost !== null ? round2(laborCost + directExpenses) : null;
    const hasRevenueOrCost = contract.value > 0 || (totalCost !== null && totalCost > 0);
    const marginAmount = (rights.canSeeFinance && rights.canSeeCosts && totalCost !== null && hasRevenueOrCost)
      ? round2(contract.value - totalCost)
      : null;
    const marginPercent = (marginAmount !== null && contract.value > 0)
      ? round2((marginAmount / contract.value) * 100)
      : null;
    const effectiveHourlyRate = (contract.value > 0 && seconds > 0)
      ? round2(contract.value / (seconds / 3600))
      : null;

    const dl = evaluateProjectDeadline(p, pType, today, projectStatuses);
    const needsDelayReason = projectNeedsDelayReason(p, dl);

    // Tasks stats + per-person attribution
    const projTasks = tasksByProject.get(p.id) ?? [];
    const taskStats = emptyTaskStats();
    const taskWaitAcc = new WaitAccumulator();
    const taskStatsByPersonKey = new Map<string, { stats: BreakdownTaskStats; wait: WaitAccumulator }>();

    const resolvePersonIdentity = (rawNameOrId: string): { key: string; userId: string | null; employeeId: string | null; name: string; emp?: Employee } => {
      const byUid = usersById.get(rawNameOrId);
      const user = byUid || usersByName.get(normName(rawNameOrId));
      const emp = (user?.id ? employeesByUserId.get(user.id) : undefined)
        || employeesById.get(rawNameOrId)
        || employeesByName.get(normName(user?.name || rawNameOrId));
      const userId = user?.id ?? emp?.userId ?? null;
      const employeeId = emp?.id ?? null;
      const key = emp ? `emp:${emp.id}` : userId ? `user:${userId}` : `name:${normName(rawNameOrId)}`;
      const name = emp?.name || user?.name || rawNameOrId;
      return { key, userId, employeeId, name, emp };
    };

    const ensurePersonTaskBucket = (personKey: string) => {
      let b = taskStatsByPersonKey.get(personKey);
      if (!b) {
        b = { stats: emptyTaskStats(), wait: new WaitAccumulator() };
        taskStatsByPersonKey.set(personKey, b);
      }
      return b;
    };

    for (const t of projTasks) {
      const done = isDoneTaskState(t.status, taskStates);
      const overdue = isTaskOverdueAt(t, taskStates, nowStamp);
      const reopened = Math.max(0, Number(t.reopenedCount) || 0);
      const moves = Math.max(0, Number(t.deadlineMoves) || 0);
      const waitSample = computeTaskQueueWaitSeconds(t, taskStates, timeData.firstEntryAtByTask[t.id], nowMs);

      taskStats.total++;
      if (done) taskStats.done++;
      else taskStats.open++;
      if (overdue) taskStats.overdue++;
      taskStats.reopened += reopened;
      taskStats.deadlineMoves += moves;
      taskWaitAcc.add(waitSample);

      const assignees = Array.from(new Set([...(t.assignedUsers || []), ...(t.owner ? [t.owner] : [])].filter(Boolean)));
      for (const a of assignees) {
        const id = resolvePersonIdentity(a);
        const pb = ensurePersonTaskBucket(id.key);
        pb.stats.total++;
        if (done) pb.stats.done++;
        else pb.stats.open++;
        if (overdue) pb.stats.overdue++;
        pb.stats.reopened += reopened;
        pb.stats.deadlineMoves += moves;
        pb.wait.add(waitSample);
      }
    }
    taskStats.wait = taskWaitAcc.finish();

    // Ticket stats + per-person attribution + retainer usage
    const projTickets = ticketsByProject.get(p.id) ?? [];
    const ticketStats = emptyTicketStats();
    const ticketWaitAcc = new WaitAccumulator();
    const ticketStatsByPersonKey = new Map<string, { total: number; open: number; reopened: number }>();

    for (const tk of projTickets) {
      const closed = isClosedTicketStatus(tk.status, ticketStatuses);
      const sla = evaluateTicketSla(tk, ticketStatuses);
      const reopened = Math.max(0, Number(tk.reopenedCount) || 0);
      const waitSample = computeTicketQueueWaitSeconds(tk, ticketStatuses, timeData.firstEntryAtByTicket[tk.id], nowMs);

      ticketStats.total++;
      if (closed) ticketStats.closed++;
      else ticketStats.open++;
      if (sla.status === "breached") ticketStats.slaBreached++;
      ticketStats.reopened += reopened;
      ticketWaitAcc.add(waitSample);

      const assignees = Array.from(new Set([
        ...(tk.assignedUsers || []),
        ...(tk.assignedUser ? [tk.assignedUser] : []),
      ].filter(Boolean)));
      for (const a of assignees) {
        const id = resolvePersonIdentity(a);
        const cur = ticketStatsByPersonKey.get(id.key) ?? { total: 0, open: 0, reopened: 0 };
        cur.total++;
        if (!closed) cur.open++;
        cur.reopened += reopened;
        ticketStatsByPersonKey.set(id.key, cur);
      }
    }
    ticketStats.wait = ticketWaitAcc.finish();

    const retainer = computeProjectRetainerUsage(p, projTickets, supportContracts);

    // Level 3: union of people with logged time on the project + task/ticket assignees
    const employeeAccum = new Map<string, {
      key: string;
      userId: string | null;
      employeeId: string | null;
      name: string;
      emp?: Employee;
      seconds: number;
      billableSeconds: number;
      costSum: number;
      costKnown: boolean;
      costVisible: boolean;
    }>();

    for (const tp of pTime?.people ?? []) {
      const emp = (tp.employeeId && employeesById.get(tp.employeeId))
        || (tp.userId && employeesByUserId.get(tp.userId))
        || undefined;
      const user = tp.userId ? usersById.get(tp.userId) : undefined;
      const key = emp ? `emp:${emp.id}` : tp.userId ? `user:${tp.userId}` : `name:${tp.employeeId || "unknown"}`;
      const name = emp?.name || user?.name || tp.userId || "Unknown";

      let cur = employeeAccum.get(key);
      if (!cur) {
        cur = {
          key,
          userId: tp.userId || emp?.userId || null,
          employeeId: emp?.id ?? tp.employeeId ?? null,
          name,
          emp,
          seconds: 0,
          billableSeconds: 0,
          costSum: 0,
          costKnown: true,
          costVisible: "cost" in tp && rights.canSeeCosts,
        };
        employeeAccum.set(key, cur);
      }
      cur.seconds += tp.seconds;
      cur.billableSeconds += tp.billableSeconds;
      if ("cost" in tp && rights.canSeeCosts) {
        cur.costVisible = true;
        if (typeof tp.cost === "number") cur.costSum += tp.cost;
        else cur.costKnown = false;
      } else {
        cur.costKnown = false;
      }
    }

    // Add task/ticket assignees who have 0 logged hours on this project
    const ensureAssignedPerson = (rawName: string) => {
      const id = resolvePersonIdentity(rawName);
      if (!employeeAccum.has(id.key)) {
        employeeAccum.set(id.key, {
          key: id.key,
          userId: id.userId,
          employeeId: id.employeeId,
          name: id.name,
          emp: id.emp,
          seconds: 0,
          billableSeconds: 0,
          costSum: 0,
          costKnown: true,
          costVisible: rights.canSeeCosts,
        });
      }
    };
    for (const t of projTasks) {
      for (const a of [...(t.assignedUsers || []), ...(t.owner ? [t.owner] : [])]) {
        if (a) ensureAssignedPerson(a);
      }
    }
    for (const tk of projTickets) {
      for (const a of [...(tk.assignedUsers || []), ...(tk.assignedUser ? [tk.assignedUser] : [])]) {
        if (a) ensureAssignedPerson(a);
      }
    }

    const employeeRows: BreakdownEmployeeRow[] = [...employeeAccum.values()]
      .map((acc) => {
        const tb = taskStatsByPersonKey.get(acc.key);
        const tStats = tb ? { ...tb.stats, wait: tb.wait.finish() } : emptyTaskStats();
        const tkb = ticketStatsByPersonKey.get(acc.key) ?? { total: 0, open: 0, reopened: 0 };
        const laborCostVal = acc.costVisible && acc.costKnown
          ? (acc.seconds === 0 ? 0 : round2(acc.costSum))
          : null;
        const lastSal = acc.emp ? lastSalaryByEmployee.get(acc.emp.id) : undefined;
        const rawKind = acc.emp?.kind;
        const empKind: BreakdownEmployeeRow["kind"] =
          rawKind === "employee" || rawKind === "contractor" || rawKind === "ledger" ? rawKind : "user";
        return {
          key: acc.key,
          userId: acc.userId,
          employeeId: acc.employeeId,
          name: acc.name,
          kind: empKind,
          seconds: acc.seconds,
          billableSeconds: acc.billableSeconds,
          sharePercent: seconds > 0 ? Math.round((acc.seconds / seconds) * 100) : 0,
          laborCost: laborCostVal,
          costVisible: acc.costVisible,
          contractSalaryAmount: rights.canSeeSalaries && acc.emp ? Number(acc.emp.salaryAmount) || 0 : null,
          contractSalaryType: rights.canSeeSalaries && acc.emp ? (acc.emp.salaryType ?? null) : null,
          lastSalaryAmount: rights.canSeeSalaries && lastSal ? Number(lastSal.totalSalary) : null,
          lastSalaryPeriod: rights.canSeeSalaries && lastSal ? lastSal.periodKey : null,
          salaryVisible: rights.canSeeSalaries,
          effectiveCostRatePerHour: laborCostVal !== null && acc.seconds > 0 ? round2(laborCostVal / (acc.seconds / 3600)) : null,
          tasks: tStats,
          ticketsCount: tkb.total,
          ticketsOpen: tkb.open,
          ticketsReopened: tkb.reopened,
        };
      })
      .sort((a, b) => b.seconds - a.seconds || b.tasks.open - a.tasks.open || a.name.localeCompare(b.name));

    const atRisk = Boolean(
      (marginPercent !== null && marginPercent < 15)
      || dl?.isOverdue
      || needsDelayReason
      || ticketStats.slaBreached > 0
      || retainer.overageMinutes > 0,
    );
    const unbilled = billing.notInvoiced > 0;
    const overdue = Boolean(dl?.isOverdue || taskStats.overdue > 0 || taskStats.deadlineMoves > 0);
    const bottlenecks = Boolean(
      taskStats.reopened > 0
      || ticketStats.reopened > 0
      || taskStats.wait.waitingNowCount > 0
      || ticketStats.wait.waitingNowCount > 0,
    );

    const projectRow: BreakdownProjectRow = {
      project: p,
      projectType: pType,
      name: projectDisplayName(p, pairedLead ? [pairedLead] : [], p.name || p.id),
      currency: contract.currency,
      hasValue: contract.value > 0,
      value: contract.value,
      invoiced: billing.invoiced,
      received: billing.received,
      invoicedOpen: billing.invoicedOpen,
      invoicable: billing.notInvoiced,
      stillToBePaid: billing.stillToBePaid,
      directExpenses,
      laborCost,
      totalCost,
      marginAmount,
      marginPercent,
      seconds,
      billableSeconds,
      hoursBudget: p.hoursBudget ?? null,
      retainerMonthlyHours: retainer.enabled ? retainer.monthlyHours : null,
      retainerUsedHours: retainer.enabled ? retainer.usedHours : null,
      retainerOverageMinutes: retainer.enabled ? retainer.overageMinutes : 0,
      effectiveHourlyRate,
      deadlineStatus: dl,
      needsDelayReason,
      tasks: taskStats,
      tickets: ticketStats,
      employees: employeeRows,
      healthFlags: { atRisk, unbilled, overdue, bottlenecks },
    };

    const matchesHealth =
      healthFilter === "all"
      || (healthFilter === "at_risk" && projectRow.healthFlags.atRisk)
      || (healthFilter === "unbilled" && projectRow.healthFlags.unbilled)
      || (healthFilter === "overdue" && projectRow.healthFlags.overdue)
      || (healthFilter === "bottlenecks" && projectRow.healthFlags.bottlenecks);

    if (!matchesHealth) continue;

    const grp = resolveProjectClientGroup(p, leadsById, unassignedLabel);
    let clientBucket = clientMap.get(grp.key);
    if (!clientBucket) {
      clientBucket = { ...grp, projects: [] };
      clientMap.set(grp.key, clientBucket);
    }
    clientBucket.projects.push(projectRow);
  }

  // Sort helper for project rows
  const dir = sort.direction === "asc" ? 1 : -1;
  const projectMetric = (r: BreakdownProjectRow): number | string => {
    switch (sort.key) {
      case "name": return r.name;
      case "value": return r.value;
      case "invoicable": return r.invoicable;
      case "stillToBePaid": return r.stillToBePaid;
      case "timeWorked": return r.seconds;
      case "laborCost": return r.laborCost ?? -Infinity;
      case "margin": return r.marginAmount ?? -Infinity;
      case "effectiveRate": return r.effectiveHourlyRate ?? -Infinity;
      case "tasksOpen": return r.tasks.open;
      case "tasksReopened": return r.tasks.reopened;
      case "tasksWait": return r.tasks.wait.avgSeconds ?? -1;
      case "ticketsOpen": return r.tickets.open;
      case "ticketsWait": return r.tickets.wait.avgSeconds ?? -1;
      default: return r.value;
    }
  };

  // Portfolio accumulators
  const pVal: MoneyMap = {};
  const pRec: MoneyMap = {};
  const pInv: MoneyMap = {};
  const pPay: MoneyMap = {};
  const pExp: MoneyMap = {};
  const pMargin: MoneyMap = {};
  let pLaborSum = 0;
  let pLaborComplete = rights.canSeeCosts;
  let pMarginComplete = rights.canSeeCosts && rights.canSeeFinance;
  let pTotalSec = 0;
  let pBillSec = 0;
  let pAtRisk = 0;
  let pOverdue = 0;
  let pTasksOpen = 0;
  let pTasksWaiting = 0;
  let pTasksReopened = 0;
  let pTicketsOpen = 0;
  let pTicketsWaiting = 0;
  let pTicketsReopened = 0;
  let pTicketsBreached = 0;
  let projectCount = 0;

  const clientRows: BreakdownClientRow[] = [];

  for (const grp of clientMap.values()) {
    const projs = [...grp.projects].sort((a, b) => {
      const av = projectMetric(a);
      const bv = projectMetric(b);
      if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
      return dir * ((av as number) - (bv as number)) || a.name.localeCompare(b.name);
    });

    const cVal: MoneyMap = {};
    const cInv: MoneyMap = {};
    const cPay: MoneyMap = {};
    const cExp: MoneyMap = {};
    const cMargin: MoneyMap = {};
    let cLaborSum = 0;
    let cLaborComplete = rights.canSeeCosts;
    let cMarginComplete = rights.canSeeCosts && rights.canSeeFinance;
    let cSec = 0;
    let cBillSec = 0;
    let cOverdue = 0;
    let cUnexplained = 0;
    const cTasks = emptyTaskStats();
    const cTasksWait = new WaitAccumulator();
    const cTickets = emptyTicketStats();
    const cTicketsWait = new WaitAccumulator();

    let anyAtRisk = false;
    let anyUnbilled = false;
    let anyOverdue = false;
    let anyBottleneck = false;

    for (const pr of projs) {
      projectCount++;
      addMoneyMap(cVal, pr.currency, pr.value);
      addMoneyMap(cInv, pr.currency, pr.invoicable);
      addMoneyMap(cPay, pr.currency, pr.stillToBePaid);
      addMoneyMap(cExp, pr.currency, pr.directExpenses);

      addMoneyMap(pVal, pr.currency, pr.value);
      addMoneyMap(pRec, pr.currency, pr.received);
      addMoneyMap(pInv, pr.currency, pr.invoicable);
      addMoneyMap(pPay, pr.currency, pr.stillToBePaid);
      addMoneyMap(pExp, pr.currency, pr.directExpenses);

      if (pr.laborCost !== null) {
        cLaborSum += pr.laborCost;
        pLaborSum += pr.laborCost;
      } else {
        cLaborComplete = false;
        pLaborComplete = false;
      }

      if (pr.marginAmount !== null) {
        addMoneyMap(cMargin, pr.currency, pr.marginAmount);
        addMoneyMap(pMargin, pr.currency, pr.marginAmount);
      } else if (rights.canSeeCosts && rights.canSeeFinance) {
        cMarginComplete = false;
        pMarginComplete = false;
      }

      cSec += pr.seconds;
      cBillSec += pr.billableSeconds;
      pTotalSec += pr.seconds;
      pBillSec += pr.billableSeconds;

      if (pr.deadlineStatus?.isOverdue) { cOverdue++; pOverdue++; }
      if (pr.needsDelayReason) cUnexplained++;
      if (pr.healthFlags.atRisk) { anyAtRisk = true; pAtRisk++; }
      if (pr.healthFlags.unbilled) anyUnbilled = true;
      if (pr.healthFlags.overdue) anyOverdue = true;
      if (pr.healthFlags.bottlenecks) anyBottleneck = true;

      cTasks.total += pr.tasks.total;
      cTasks.open += pr.tasks.open;
      cTasks.done += pr.tasks.done;
      cTasks.overdue += pr.tasks.overdue;
      cTasks.reopened += pr.tasks.reopened;
      cTasks.deadlineMoves += pr.tasks.deadlineMoves;
      cTasksWait.merge(pr.tasks.wait);

      cTickets.total += pr.tickets.total;
      cTickets.open += pr.tickets.open;
      cTickets.closed += pr.tickets.closed;
      cTickets.slaBreached += pr.tickets.slaBreached;
      cTickets.reopened += pr.tickets.reopened;
      cTicketsWait.merge(pr.tickets.wait);

      pTasksOpen += pr.tasks.open;
      pTasksWaiting += pr.tasks.wait.waitingNowCount;
      pTasksReopened += pr.tasks.reopened;
      pTicketsOpen += pr.tickets.open;
      pTicketsWaiting += pr.tickets.wait.waitingNowCount;
      pTicketsReopened += pr.tickets.reopened;
      pTicketsBreached += pr.tickets.slaBreached;
    }

    cTasks.wait = cTasksWait.finish();
    cTickets.wait = cTicketsWait.finish();

    const cEffRate: MoneyMap = {};
    if (cSec > 0) {
      const hours = cSec / 3600;
      for (const [curr, amt] of Object.entries(cVal)) {
        if (amt > 0) cEffRate[curr] = round2(amt / hours);
      }
    }

    const totalClientVal = primaryCurrencyValue(cVal, defaultCurrency);
    const totalClientMargin = cMarginComplete ? primaryCurrencyValue(cMargin, defaultCurrency) : null;
    const cMarginPct = (totalClientMargin !== null && totalClientVal > 0)
      ? round2((totalClientMargin / totalClientVal) * 100)
      : null;

    clientRows.push({
      key: grp.key,
      name: grp.name,
      record: grp.record,
      isUnassigned: grp.isUnassigned,
      projectCount: projs.length,
      projects: projs,
      valueByCurrency: cVal,
      invoicableByCurrency: cInv,
      stillToBePaidByCurrency: cPay,
      directExpensesByCurrency: cExp,
      laborCost: cLaborComplete ? round2(cLaborSum) : null,
      marginByCurrency: cMarginComplete ? cMargin : null,
      marginPercent: cMarginPct,
      seconds: cSec,
      billableSeconds: cBillSec,
      effectiveHourlyRateByCurrency: cEffRate,
      overdueProjectsCount: cOverdue,
      unexplainedDelayCount: cUnexplained,
      tasks: cTasks,
      tickets: cTickets,
      healthFlags: {
        atRisk: anyAtRisk,
        unbilled: anyUnbilled,
        overdue: anyOverdue,
        bottlenecks: anyBottleneck,
      },
    });
  }

  const clientMetric = (r: BreakdownClientRow): number | string => {
    switch (sort.key) {
      case "name": return r.name;
      case "value": return primaryCurrencyValue(r.valueByCurrency, defaultCurrency);
      case "invoicable": return primaryCurrencyValue(r.invoicableByCurrency, defaultCurrency);
      case "stillToBePaid": return primaryCurrencyValue(r.stillToBePaidByCurrency, defaultCurrency);
      case "timeWorked": return r.seconds;
      case "laborCost": return r.laborCost ?? -Infinity;
      case "margin": return r.marginByCurrency ? primaryCurrencyValue(r.marginByCurrency, defaultCurrency) : -Infinity;
      case "effectiveRate": return primaryCurrencyValue(r.effectiveHourlyRateByCurrency, defaultCurrency);
      case "tasksOpen": return r.tasks.open;
      case "tasksReopened": return r.tasks.reopened;
      case "tasksWait": return r.tasks.wait.avgSeconds ?? -1;
      case "ticketsOpen": return r.tickets.open;
      case "ticketsWait": return r.tickets.wait.avgSeconds ?? -1;
      default: return primaryCurrencyValue(r.valueByCurrency, defaultCurrency);
    }
  };

  // Always keep Internal/Unassigned last unless explicitly sorting by name ascending? Keep unassigned at bottom for portfolio clarity.
  clientRows.sort((a, b) => {
    if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
    const av = clientMetric(a);
    const bv = clientMetric(b);
    if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
    return dir * ((av as number) - (bv as number)) || a.name.localeCompare(b.name);
  });

  const pEffRate: MoneyMap = {};
  if (pTotalSec > 0) {
    const hours = pTotalSec / 3600;
    for (const [curr, amt] of Object.entries(pVal)) {
      if (amt > 0) pEffRate[curr] = round2(amt / hours);
    }
  }
  const pValPrimary = primaryCurrencyValue(pVal, defaultCurrency);
  const pMarginPrimary = pMarginComplete ? primaryCurrencyValue(pMargin, defaultCurrency) : null;

  return {
    clients: clientRows,
    summary: {
      clientCount: clientRows.length,
      projectCount,
      valueByCurrency: pVal,
      receivedByCurrency: pRec,
      invoicableByCurrency: pInv,
      stillToBePaidByCurrency: pPay,
      laborCost: pLaborComplete ? round2(pLaborSum) : null,
      directExpensesByCurrency: pExp,
      marginByCurrency: pMarginComplete ? pMargin : null,
      marginPercent: pMarginPrimary !== null && pValPrimary > 0 ? round2((pMarginPrimary / pValPrimary) * 100) : null,
      totalSeconds: pTotalSec,
      billableSeconds: pBillSec,
      effectiveHourlyRateByCurrency: pEffRate,
      atRiskProjects: pAtRisk,
      overdueProjects: pOverdue,
      totalTasksOpen: pTasksOpen,
      totalTasksWaitingNow: pTasksWaiting,
      totalTasksReopened: pTasksReopened,
      totalTicketsOpen: pTicketsOpen,
      totalTicketsWaitingNow: pTicketsWaiting,
      totalTicketsReopened: pTicketsReopened,
      totalTicketsSlaBreached: pTicketsBreached,
    },
  };
}
