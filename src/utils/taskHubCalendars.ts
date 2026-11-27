/**
 * Pure calendar data builders for the #tasks Multi-Calendar Hub.
 *
 * Every date comparison and bucket uses plain local YYYY-MM-DD strings so
 * daylight-saving or timezone offsets never shift items across day cells.
 */
import type {
  CustomCalendar,
  CustomCalendarEvent,
  Employee,
  EmployeeSalary,
  EmployeeVacation,
  FinancialRecord,
  InvoiceOffer,
  Lead,
  Order,
  Project,
  ProjectType,
  SupportContract,
  Task,
  Ticket,
  UnifiedEntryRegistry,
  UnifiedEntryRow,
  WarehouseBatch,
} from "../types";
import type { MeetingNote } from "../components/MeetingRoomView";
import {
  DEFAULT_PROJECT_STATUS_DEFS,
  evaluateProjectDeadline,
  isClosedProjectStatus,
  projectDisplayName,
  projectStartDate,
  projectTypeHasInvoiceDate,
  type ProjectStatusDef,
} from "./projects.ts";
import {
  DEFAULT_INVOICE_STATUS_DEFS,
  isLiveInvoiceStatus,
  type OfferStatusDef,
} from "./offerStatuses.ts";
import { invoiceMovementId } from "./invoiceFinanceBridge.ts";
import { movementAmounts } from "./financialOverviewTable.ts";
import { recurringCharges, shiftIsoDate } from "./recurringExpenses.ts";
import { addDays, builtinHolidays } from "./holidays.ts";

export type BuiltInCalendarLensId =
  | "tasks"
  | "work"
  | "payments"
  | "team"
  | "sales"
  | "deadlines"
  | "logistics"
  | "marketing";

export type CalendarLensId = BuiltInCalendarLensId | `custom:${string}`;

export interface HubCalendarRbac {
  projects?: boolean;
  financial?: boolean;
  invoices?: boolean;
  employees?: boolean;
  leads?: boolean;
  meetings?: boolean;
  orders?: boolean;
  warehouse?: boolean;
  newsletter?: boolean;
  social?: boolean;
  tickets?: boolean;
}

export interface BuiltInCalendarMeta {
  id: BuiltInCalendarLensId;
  label: { en: string; sk: string; hu: string };
  canView: (rbac: HubCalendarRbac) => boolean;
}

export const BUILTIN_CALENDAR_LENSES: readonly BuiltInCalendarMeta[] = [
  { id: "tasks", label: { en: "Tasks", sk: "Úlohy", hu: "Feladatok" }, canView: () => true },
  { id: "work", label: { en: "Work", sk: "Práce", hu: "Munka" }, canView: (r) => r.projects !== false },
  {
    id: "payments",
    label: { en: "Payments", sk: "Platby", hu: "Fizetések" },
    canView: (r) => Boolean(r.financial || r.invoices),
  },
  { id: "team", label: { en: "Team & Holidays", sk: "Tím a sviatky", hu: "Csapat és ünnepek" }, canView: (r) => Boolean(r.employees) },
  { id: "sales", label: { en: "Sales & Quotes", sk: "Obchod a ponuky", hu: "Értékesítés és ajánlatok" }, canView: (r) => Boolean(r.leads || r.meetings || r.invoices) },
  { id: "deadlines", label: { en: "Expirations & SLA", sk: "Termíny a SLA", hu: "Lejáratok és SLA" }, canView: () => true },
  { id: "logistics", label: { en: "Orders & Stock", sk: "Objednávky a sklad", hu: "Rendelések és készlet" }, canView: (r) => Boolean(r.orders || r.warehouse) },
  { id: "marketing", label: { en: "Marketing", sk: "Marketing", hu: "Marketing" }, canView: (r) => Boolean(r.newsletter || r.social) },
];

export interface HubCalendarItem {
  id: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD for multi-day items
  startTime?: string | null;
  endTime?: string | null;
  title: string;
  subtitle?: string;
  badge?: string;
  amount?: number;
  currency?: string;
  color: string;
  tone?: "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet" | "slate";
  dashed?: boolean;
  overdue?: boolean;
  category?: string;
  href?: string;
  taskId?: string;
  customEvent?: CustomCalendarEvent;
}

export interface WeeklyPaymentRollup {
  weekStart: string; // Monday YYYY-MM-DD
  weekEnd: string;   // Sunday YYYY-MM-DD
  byCurrency: Record<
    string,
    {
      plannedInvoicing: number;
      invoicesDue: number;
      overdueReceivables: number;
      expenses: number;
      net: number;
    }
  >;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toIso = (raw: unknown): string => {
  const s = String(raw ?? "").trim().slice(0, 10);
  return ISO_DATE.test(s) ? s : "";
};

/** Monday `YYYY-MM-DD` of the ISO week containing `iso`. */
export function mondayOfIso(iso: string): string {
  if (!ISO_DATE.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const offset = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - offset);
  return dt.toISOString().slice(0, 10);
}

const expandSpanIntoRange = (
  startIso: string,
  endIso: string,
  rangeStart: string,
  rangeEnd: string,
  cb: (dayIso: string) => void
) => {
  const effectiveEnd = endIso >= startIso ? endIso : startIso;
  let cur = startIso > rangeStart ? startIso : rangeStart;
  const limit = effectiveEnd < rangeEnd ? effectiveEnd : rangeEnd;
  let guard = 0;
  while (cur <= limit && guard < 400) {
    cb(cur);
    cur = addDays(cur, 1);
    guard++;
  }
};

// ---------------------------------------------------------------------------
// 2. WORK CALENDAR (Projects, Gantt Phases & Project Tasks)
// ---------------------------------------------------------------------------

export function buildWorkCalendarData(params: {
  projects: Project[];
  projectTypes: ProjectType[];
  projectStatuses?: readonly ProjectStatusDef[];
  tasks: Task[];
  leads: Lead[];
  rangeStart: string;
  rangeEnd: string;
  todayIso: string;
  scope?: "mine" | "all";
  currentUserName?: string;
  projectTypeFilter?: string;
  includeClosed?: boolean;
}): { byDate: Map<string, HubCalendarItem[]> } {
  const {
    projects,
    projectTypes,
    projectStatuses = DEFAULT_PROJECT_STATUS_DEFS,
    tasks,
    leads,
    rangeStart,
    rangeEnd,
    todayIso,
    scope = "all",
    currentUserName = "",
    projectTypeFilter = "all",
    includeClosed = false,
  } = params;

  const byDate = new Map<string, HubCalendarItem[]>();
  const push = (item: HubCalendarItem) => {
    const arr = byDate.get(item.date) || [];
    arr.push(item);
    byDate.set(item.date, arr);
  };

  const typesById = new Map(projectTypes.map((pt) => [pt.id, pt]));
  const userLower = currentUserName.trim().toLowerCase();
  const visibleProjectIds = new Set<string>();

  for (const project of projects) {
    if (project.archived) continue;
    if (!includeClosed && isClosedProjectStatus(project.status, projectStatuses)) continue;
    if (projectTypeFilter !== "all" && project.projectTypeId !== projectTypeFilter) continue;

    if (scope === "mine" && userLower) {
      const isManager = (project.managers || []).some((m) => m.trim().toLowerCase() === userLower);
      const hasTask = tasks.some(
        (tk) =>
          tk.relatedProjectId === project.id &&
          !tk.archived &&
          (tk.owner?.trim().toLowerCase() === userLower ||
            (tk.assignedUsers || []).some((u) => u.trim().toLowerCase() === userLower))
      );
      if (!isManager && !hasTask) continue;
    }

    visibleProjectIds.add(project.id);
    const pType = typesById.get(project.projectTypeId);
    const title = projectDisplayName(project, leads, "—");
    const color = pType?.color || "#6366f1";
    const start = projectStartDate(project);
    const dl = evaluateProjectDeadline(project, pType, todayIso, projectStatuses);
    const end = dl?.deadline || toIso(project.finishedAt) || toIso(project.completionDeadline) || start;

    if (start && end) {
      expandSpanIntoRange(start, end, rangeStart, rangeEnd, (day) => {
        const isStart = day === start;
        const isDeadline = day === end && end !== start;
        push({
          id: `work:proj:${project.id}:${day}`,
          date: day,
          endDate: end,
          title,
          subtitle: pType?.name,
          badge: isDeadline ? "Deadline" : isStart ? "Start" : undefined,
          color,
          tone: dl?.isOverdue ? "rose" : dl?.isDueSoon ? "amber" : "indigo",
          overdue: Boolean(dl?.isOverdue),
          category: "project",
          href: `#projects/${project.id}`,
        });
      });
    }

    if (pType?.hasGantt && Array.isArray(project.gantt)) {
      for (const row of project.gantt) {
        const gStart = toIso(row.startDate) || toIso(row.endDate);
        const gEnd = toIso(row.endDate) || gStart;
        if (!gStart) continue;
        expandSpanIntoRange(gStart, gEnd, rangeStart, rangeEnd, (day) => {
          push({
            id: `work:gantt:${project.id}:${row.id}:${day}`,
            date: day,
            endDate: gEnd,
            title: `${title} · ${row.title}`,
            badge: `${Math.round(row.progress || 0)}%`,
            color,
            tone: "sky",
            category: "gantt",
            href: `#projects/${project.id}`,
          });
        });
      }
    }
  }

  for (const task of tasks) {
    if (task.archived || !task.relatedProjectId) continue;
    if (!visibleProjectIds.has(task.relatedProjectId)) continue;
    const dl = toIso(task.deadline);
    if (!dl) continue;
    const start = toIso(task.startDate) || dl;
    const proj = projects.find((p) => p.id === task.relatedProjectId);
    const projName = proj ? projectDisplayName(proj, leads, "—") : undefined;
    expandSpanIntoRange(start, dl, rangeStart, rangeEnd, (day) => {
      push({
        id: `work:task:${task.id}:${day}`,
        date: day,
        startTime: task.deadlineTime || null,
        title: task.title,
        subtitle: projName,
        badge: task.status,
        color: task.priority === "high" ? "#f43f5e" : task.priority === "medium" ? "#f59e0b" : "#64748b",
        tone: task.priority === "high" ? "rose" : task.priority === "medium" ? "amber" : "slate",
        category: "task",
        taskId: task.id,
      });
    });
  }

  return { byDate };
}

// ---------------------------------------------------------------------------
// 3. PAYMENT CALENDAR (Invoices Due, Planned Weekly Billing & Expenses)
// ---------------------------------------------------------------------------

export function buildPaymentCalendarData(params: {
  financialRecords: FinancialRecord[];
  invoicesOffers: InvoiceOffer[];
  invoiceStatuses?: readonly OfferStatusDef[];
  projects: Project[];
  projectTypes: ProjectType[];
  projectStatuses?: readonly ProjectStatusDef[];
  employeeSalaries?: EmployeeSalary[];
  employees?: Employee[];
  orders?: Order[];
  leads: Lead[];
  rangeStart: string;
  rangeEnd: string;
  todayIso: string;
  defaultCurrency?: string;
}): {
  byDate: Map<string, HubCalendarItem[]>;
  weeklyRollups: Map<string, WeeklyPaymentRollup>;
} {
  const {
    financialRecords,
    invoicesOffers,
    invoiceStatuses = DEFAULT_INVOICE_STATUS_DEFS,
    projects,
    projectTypes,
    projectStatuses = DEFAULT_PROJECT_STATUS_DEFS,
    employeeSalaries = [],
    employees = [],
    orders = [],
    leads,
    rangeStart,
    rangeEnd,
    todayIso,
    defaultCurrency = "EUR",
  } = params;

  const byDate = new Map<string, HubCalendarItem[]>();
  const weeklyRollups = new Map<string, WeeklyPaymentRollup>();

  const ensureRollup = (date: string, currency: string) => {
    const ws = mondayOfIso(date);
    let week = weeklyRollups.get(ws);
    if (!week) {
      week = { weekStart: ws, weekEnd: addDays(ws, 6), byCurrency: {} };
      weeklyRollups.set(ws, week);
    }
    if (!week.byCurrency[currency]) {
      week.byCurrency[currency] = {
        plannedInvoicing: 0,
        invoicesDue: 0,
        overdueReceivables: 0,
        expenses: 0,
        net: 0,
      };
    }
    return week.byCurrency[currency];
  };

  const push = (item: HubCalendarItem) => {
    if (item.date < rangeStart || item.date > rangeEnd) return;
    const arr = byDate.get(item.date) || [];
    arr.push(item);
    byDate.set(item.date, arr);
  };

  const bridgedIds = new Set(financialRecords.map((r) => r.id));
  const recordedInvNumbers = new Set(
    financialRecords
      .filter((r) => r.type === "income" && r.invoiceNumber)
      .map((r) => String(r.invoiceNumber).trim().toLowerCase())
  );

  // Track already-booked project income so Project.invoiceDate only plans the unbilled remainder.
  const bookedIncomeByProject = new Map<string, number>();
  for (const rec of financialRecords) {
    if (rec.type !== "income" || !rec.projectId || rec.status === "cancelled") continue;
    const { real, estimated } = movementAmounts(rec);
    bookedIncomeByProject.set(rec.projectId, (bookedIncomeByProject.get(rec.projectId) || 0) + real + estimated);
  }

  // 1) Financial records (one-off + recurring rules)
  for (const rec of financialRecords) {
    if (rec.status === "cancelled") continue;
    const currency = rec.currency || defaultCurrency;

    if (rec.isRecurring) {
      const charges = recurringCharges(rec, rangeStart, rangeEnd);
      for (const ch of charges) {
        if (ch.amount <= 0) continue;
        const isInc = rec.type === "income";
        const isForecast = ch.date > todayIso;
        const roll = ensureRollup(ch.date, currency);
        if (isInc) {
          roll.plannedInvoicing += ch.amount;
          roll.net += ch.amount;
        } else {
          roll.expenses += ch.amount;
          roll.net -= ch.amount;
        }
        push({
          id: `pay:rec:${rec.id}:${ch.date}`,
          date: ch.date,
          title: rec.title,
          amount: ch.amount,
          currency,
          color: isInc ? "#6366f1" : "#f43f5e",
          tone: isInc ? "violet" : "rose",
          dashed: isForecast,
          category: isInc ? "planned_invoicing" : "expense",
          href: "#financial/movements",
        });
      }
      continue;
    }

    const { real, estimated } = movementAmounts(rec);
    const amount = estimated > 0 ? estimated : real;
    if (amount <= 0) continue;
    const date =
      rec.status === "paid"
        ? toIso(rec.paidDate) || toIso(rec.dueDate) || toIso(rec.issueDate)
        : toIso(rec.dueDate) || toIso(rec.issueDate);
    if (!date || date < rangeStart || date > rangeEnd) continue;

    const roll = ensureRollup(date, currency);
    if (rec.type === "income") {
      const isPlanned = rec.status === "planned";
      const overdue = !isPlanned && rec.status !== "paid" && date < todayIso;
      if (isPlanned) {
        roll.plannedInvoicing += amount;
      } else {
        roll.invoicesDue += amount;
        if (overdue) roll.overdueReceivables += amount;
      }
      roll.net += amount;
      push({
        id: `pay:fr:${rec.id}`,
        date,
        title: rec.title,
        subtitle: rec.invoiceNumber || undefined,
        amount,
        currency,
        color: isPlanned ? "#6366f1" : overdue ? "#f43f5e" : "#10b981",
        tone: isPlanned ? "indigo" : overdue ? "rose" : "emerald",
        dashed: isPlanned,
        overdue,
        category: isPlanned ? "planned_invoicing" : "invoice_due",
        href: "#financial/movements",
      });
    } else {
      const overdue = rec.status !== "paid" && date < todayIso;
      roll.expenses += amount;
      roll.net -= amount;
      push({
        id: `pay:fr:${rec.id}`,
        date,
        title: rec.title,
        subtitle: rec.invoiceNumber || undefined,
        amount,
        currency,
        color: "#f43f5e",
        tone: "rose",
        overdue,
        category: "expense",
        href: "#financial/movements",
      });
    }
  }

  // 2) Unbridged Invoices & Proformas
  for (const doc of invoicesOffers) {
    if (doc.type !== "invoice" && doc.type !== "proforma") continue;
    if (!isLiveInvoiceStatus(doc.status, invoiceStatuses)) continue;
    if (bridgedIds.has(invoiceMovementId(doc.id))) continue;
    if (doc.documentNumber && recordedInvNumbers.has(doc.documentNumber.trim().toLowerCase())) continue;
    const date = toIso(doc.dueDate) || toIso(doc.issuedAt);
    if (!date || date < rangeStart || date > rangeEnd) continue;
    const amount = Number(doc.totalPrice) || 0;
    if (amount <= 0) continue;
    const currency = doc.currency || defaultCurrency;
    const overdue = date < todayIso;

    const roll = ensureRollup(date, currency);
    roll.invoicesDue += amount;
    if (overdue) roll.overdueReceivables += amount;
    roll.net += amount;

    push({
      id: `pay:inv:${doc.id}`,
      date,
      title: `${doc.documentNumber} — ${doc.clientName}`,
      amount,
      currency,
      color: overdue ? "#f43f5e" : "#10b981",
      tone: overdue ? "rose" : "emerald",
      overdue,
      category: "invoice_due",
      href: "#invoices",
    });
  }

  // 3) Project Planned Invoicing (Project.invoiceDate + unbilled contract value)
  const typesById = new Map(projectTypes.map((pt) => [pt.id, pt]));
  for (const project of projects) {
    if (project.archived || isClosedProjectStatus(project.status, projectStatuses)) continue;
    const pType = typesById.get(project.projectTypeId);
    if (!projectTypeHasInvoiceDate(pType)) continue;
    const date = toIso(project.invoiceDate);
    if (!date || date < rangeStart || date > rangeEnd) continue;
    const val = Number(project.value) || 0;
    const unbilled = Math.max(0, val - (bookedIncomeByProject.get(project.id) || 0));
    if (unbilled <= 0) continue;

    const roll = ensureRollup(date, defaultCurrency);
    roll.plannedInvoicing += unbilled;
    roll.net += unbilled;

    push({
      id: `pay:projinv:${project.id}`,
      date,
      title: projectDisplayName(project, leads, "—"),
      badge: "Plan",
      amount: unbilled,
      currency: defaultCurrency,
      color: "#6366f1",
      tone: "indigo",
      dashed: true,
      category: "planned_invoicing",
      href: `#projects/${project.id}`,
    });
  }

  // 4) Unpaid Employee Salaries without a bridged financialRecordId
  const empMap = new Map(employees.map((e) => [e.id, e]));
  for (const sal of employeeSalaries) {
    if (sal.status === "paid" || sal.financialRecordId) continue;
    const date = toIso(sal.dueDate);
    if (!date || date < rangeStart || date > rangeEnd) continue;
    const remaining = Math.max(0, (Number(sal.totalSalary) || 0) - (Number(sal.totalPaid) || 0));
    if (remaining <= 0) continue;

    const roll = ensureRollup(date, defaultCurrency);
    roll.expenses += remaining;
    roll.net -= remaining;
    const empName = empMap.get(sal.employeeId)?.name || sal.periodKey;

    push({
      id: `pay:sal:${sal.id}`,
      date,
      title: empName,
      subtitle: sal.periodKey,
      amount: remaining,
      currency: defaultCurrency,
      color: "#f43f5e",
      tone: "rose",
      overdue: date < todayIso,
      category: "expense",
      href: "#employees",
    });
  }

  // 5) Unpaid Purchase Orders without a financial invoice link
  for (const ord of orders) {
    if (ord.type !== "purchase" || ord.paymentStatus === "paid" || ord.paymentStatus === "refunded") continue;
    const date = toIso(ord.confirmedDeliveryDate) || toIso(ord.requestedDeliveryDate) || toIso(ord.orderDate);
    if (!date || date < rangeStart || date > rangeEnd) continue;
    const amount = Number(ord.totalGrossAmount) || 0;
    if (amount <= 0) continue;
    const currency = ord.currency || defaultCurrency;

    const roll = ensureRollup(date, currency);
    roll.expenses += amount;
    roll.net -= amount;
    push({
      id: `pay:ord:${ord.id}`,
      date,
      title: ord.orderNumber,
      amount,
      currency,
      color: "#f43f5e",
      tone: "rose",
      category: "expense",
      href: "#orders",
    });
  }

  return { byDate, weeklyRollups };
}

// ---------------------------------------------------------------------------
// 4. TEAM, LEAVE & HOLIDAYS CALENDAR
// ---------------------------------------------------------------------------

export function buildTeamCalendarData(params: {
  employees: Employee[];
  employeeVacations: EmployeeVacation[];
  rangeStart: string;
  rangeEnd: string;
}): { byDate: Map<string, HubCalendarItem[]> } {
  const { employees, employeeVacations, rangeStart, rangeEnd } = params;
  const byDate = new Map<string, HubCalendarItem[]>();
  const push = (item: HubCalendarItem) => {
    const arr = byDate.get(item.date) || [];
    arr.push(item);
    byDate.set(item.date, arr);
  };

  const empMap = new Map(employees.map((e) => [e.id, e]));
  for (const vac of employeeVacations) {
    if (vac.status === "rejected") continue;
    const s = toIso(vac.startDate);
    const e = toIso(vac.endDate) || s;
    if (!s) continue;
    const empName = empMap.get(vac.employeeId)?.name || "Employee";
    expandSpanIntoRange(s, e, rangeStart, rangeEnd, (day) => {
      push({
        id: `team:vac:${vac.id}:${day}`,
        date: day,
        endDate: e,
        title: empName,
        badge: vac.status,
        color: vac.status === "approved" || vac.status === "taken" ? "#10b981" : "#f59e0b",
        tone: vac.status === "approved" || vac.status === "taken" ? "emerald" : "amber",
        href: "#employees",
      });
    });
  }

  for (const emp of employees) {
    for (const lv of emp.leaves || []) {
      if (lv.status === "rejected") continue;
      const s = toIso(lv.startDate);
      const e = toIso(lv.endDate) || s;
      if (!s) continue;
      expandSpanIntoRange(s, e, rangeStart, rangeEnd, (day) => {
        push({
          id: `team:lv:${emp.id}:${lv.id}:${day}`,
          date: day,
          endDate: e,
          title: `${emp.name} (${lv.type})`,
          color: lv.type === "sick" ? "#f43f5e" : "#0ea5e9",
          tone: lv.type === "sick" ? "rose" : "sky",
          href: "#employees",
        });
      });
    }
  }

  const startY = Number(rangeStart.slice(0, 4)) || new Date().getFullYear();
  const endY = Number(rangeEnd.slice(0, 4)) || startY;
  for (let y = startY; y <= endY; y++) {
    for (const country of ["SK", "HU"] as const) {
      for (const hol of builtinHolidays(country, y)) {
        if (hol.date < rangeStart || hol.date > rangeEnd) continue;
        push({
          id: `team:hol:${country}:${hol.date}`,
          date: hol.date,
          title: `${country}: ${hol.localName}`,
          color: "#8b5cf6",
          tone: "violet",
        });
      }
    }
  }

  return { byDate };
}

// ---------------------------------------------------------------------------
// 5. SALES, MEETINGS & QUOTE EXPIRY CALENDAR
// ---------------------------------------------------------------------------

export function buildSalesCalendarData(params: {
  meetingNotes: MeetingNote[];
  invoicesOffers: InvoiceOffer[];
  leads: Lead[];
  rangeStart: string;
  rangeEnd: string;
  todayIso: string;
}): { byDate: Map<string, HubCalendarItem[]> } {
  const { meetingNotes, invoicesOffers, leads, rangeStart, rangeEnd, todayIso } = params;
  const byDate = new Map<string, HubCalendarItem[]>();
  const push = (item: HubCalendarItem) => {
    if (item.date < rangeStart || item.date > rangeEnd) return;
    const arr = byDate.get(item.date) || [];
    arr.push(item);
    byDate.set(item.date, arr);
  };

  for (const m of meetingNotes) {
    const d = toIso(m.date);
    if (!d) continue;
    push({
      id: `sales:mtg:${m.id}`,
      date: d,
      title: m.title,
      badge: "Meeting",
      color: "#6366f1",
      tone: "indigo",
      href: "#meetings",
    });
  }

  for (const doc of invoicesOffers) {
    if (doc.type !== "price_offer") continue;
    if (doc.status === "rejected" || doc.status === "cancelled" || doc.status === "approved" || doc.status === "invoiced") continue;
    const d = toIso(doc.validUntil);
    if (!d) continue;
    push({
      id: `sales:offer:${doc.id}`,
      date: d,
      title: `${doc.documentNumber} — ${doc.clientName}`,
      badge: "Valid until",
      amount: doc.totalPrice,
      currency: doc.currency,
      color: d < todayIso ? "#f43f5e" : "#f59e0b",
      tone: d < todayIso ? "rose" : "amber",
      overdue: d < todayIso,
      href: "#invoices",
    });
  }

  for (const lead of leads) {
    if (lead.archived) continue;
    for (const ev of lead.timeline || []) {
      if (!["meeting", "appointment", "call"].includes(ev.type)) continue;
      const d = toIso(ev.timestamp);
      if (!d) continue;
      const time = String(ev.timestamp || "").slice(11, 16);
      push({
        id: `sales:tl:${lead.id}:${ev.id}`,
        date: d,
        startTime: /^\d{2}:\d{2}$/.test(time) ? time : null,
        title: `${lead.name}: ${ev.title || ev.type}`,
        color: "#0ea5e9",
        tone: "sky",
        href: `#leads/${lead.id}`,
      });
    }
  }

  return { byDate };
}

// ---------------------------------------------------------------------------
// 6. EXPIRATIONS, REGISTRIES & SLA CALENDAR
// ---------------------------------------------------------------------------

export function buildDeadlinesCalendarData(params: {
  unifiedEntries: UnifiedEntryRegistry[];
  unifiedEntriesData: Record<string, UnifiedEntryRow[]>;
  supportContracts: SupportContract[];
  tickets: Ticket[];
  rangeStart: string;
  rangeEnd: string;
  todayIso: string;
}): { byDate: Map<string, HubCalendarItem[]> } {
  const { unifiedEntries, unifiedEntriesData, supportContracts, tickets, rangeStart, rangeEnd, todayIso } = params;
  const byDate = new Map<string, HubCalendarItem[]>();
  const push = (item: HubCalendarItem) => {
    if (item.date < rangeStart || item.date > rangeEnd) return;
    const arr = byDate.get(item.date) || [];
    arr.push(item);
    byDate.set(item.date, arr);
  };

  for (const reg of unifiedEntries) {
    if (reg.archived) continue;
    for (const row of unifiedEntriesData[reg.id] || []) {
      const d = toIso(row.dueDate);
      if (!d) continue;
      const warnDays = row.warningDays ?? reg.warningDays ?? 14;
      const isOverdue = d < todayIso;
      const isSoon = !isOverdue && d <= shiftIsoDate(todayIso, warnDays);
      push({
        id: `dl:ue:${reg.id}:${row.id}`,
        date: d,
        title: `${reg.name}: ${row.title || "Item"}`,
        color: isOverdue ? "#f43f5e" : isSoon ? "#f59e0b" : reg.color || "#6366f1",
        tone: isOverdue ? "rose" : isSoon ? "amber" : "indigo",
        overdue: isOverdue,
        href: `#entries/${reg.id}`,
      });
    }
  }

  for (const sc of supportContracts) {
    if (sc.isActive === false || sc.active === false) continue;
    const d = toIso(sc.validUntil || sc.periodEnd);
    if (!d) continue;
    push({
      id: `dl:sc:${sc.id}`,
      date: d,
      title: sc.name,
      badge: "SLA",
      color: d < todayIso ? "#f43f5e" : "#8b5cf6",
      tone: d < todayIso ? "rose" : "violet",
      overdue: d < todayIso,
      href: "#tickets",
    });
  }

  for (const tk of tickets) {
    if (tk.archived || tk.isArchived || tk.resolvedAt || tk.closedAt) continue;
    const d = toIso(tk.slaResolutionDueAt || tk.resolutionDueAt || tk.slaFirstResponseDueAt || tk.firstResponseDueAt);
    if (!d) continue;
    push({
      id: `dl:tk:${tk.id}`,
      date: d,
      title: `${tk.ticketNumber}: ${tk.subject}`,
      badge: "SLA",
      color: d < todayIso ? "#f43f5e" : "#f59e0b",
      tone: d < todayIso ? "rose" : "amber",
      overdue: d < todayIso,
      href: `#tickets/${tk.id}`,
    });
  }

  return { byDate };
}

// ---------------------------------------------------------------------------
// 7. ORDERS, DELIVERIES & STOCK EXPIRY CALENDAR
// ---------------------------------------------------------------------------

export function buildLogisticsCalendarData(params: {
  orders: Order[];
  warehouseBatches: WarehouseBatch[];
  rangeStart: string;
  rangeEnd: string;
  todayIso: string;
}): { byDate: Map<string, HubCalendarItem[]> } {
  const { orders, warehouseBatches, rangeStart, rangeEnd, todayIso } = params;
  const byDate = new Map<string, HubCalendarItem[]>();
  const push = (item: HubCalendarItem) => {
    if (item.date < rangeStart || item.date > rangeEnd) return;
    const arr = byDate.get(item.date) || [];
    arr.push(item);
    byDate.set(item.date, arr);
  };

  for (const ord of orders) {
    const d = toIso(ord.confirmedDeliveryDate) || toIso(ord.requestedDeliveryDate) || toIso(ord.orderDate);
    if (!d) continue;
    const isPurchase = ord.type === "purchase";
    push({
      id: `log:ord:${ord.id}`,
      date: d,
      title: ord.orderNumber,
      subtitle: ord.status,
      badge: isPurchase ? "Inbound" : "Outbound",
      color: isPurchase ? "#0ea5e9" : "#10b981",
      tone: isPurchase ? "sky" : "emerald",
      href: `#orders/${ord.id}`,
    });
  }

  for (const batch of warehouseBatches) {
    if ((Number(batch.currentQuantity) || 0) <= 0) continue;
    const d = toIso(batch.expirationDate);
    if (!d) continue;
    push({
      id: `log:batch:${batch.id}`,
      date: d,
      title: `Batch ${batch.batchNumber}`,
      badge: `${batch.currentQuantity}`,
      color: d < todayIso ? "#f43f5e" : "#f59e0b",
      tone: d < todayIso ? "rose" : "amber",
      overdue: d < todayIso,
      href: "#warehouse",
    });
  }

  return { byDate };
}

// ---------------------------------------------------------------------------
// 8. MARKETING & CAMPAIGNS CALENDAR
// ---------------------------------------------------------------------------

export function buildMarketingCalendarData(params: {
  campaigns: Array<{ id: string; name: string; status?: string; scheduledAt?: string | null; sentAt?: string | null }>;
  socialPosts: Array<{ id: string; content?: string; title?: string; status?: string; scheduledFor?: string | null; publishedAt?: string | null }>;
  rangeStart: string;
  rangeEnd: string;
}): { byDate: Map<string, HubCalendarItem[]> } {
  const { campaigns, socialPosts, rangeStart, rangeEnd } = params;
  const byDate = new Map<string, HubCalendarItem[]>();
  const push = (item: HubCalendarItem) => {
    if (item.date < rangeStart || item.date > rangeEnd) return;
    const arr = byDate.get(item.date) || [];
    arr.push(item);
    byDate.set(item.date, arr);
  };

  for (const c of campaigns) {
    const d = toIso(c.scheduledAt || c.sentAt);
    if (!d) continue;
    push({
      id: `mkt:nl:${c.id}`,
      date: d,
      title: c.name,
      badge: c.status || "Newsletter",
      color: "#8b5cf6",
      tone: "violet",
      href: "#newsletter",
    });
  }

  for (const p of socialPosts) {
    const d = toIso(p.scheduledFor || p.publishedAt);
    if (!d) continue;
    push({
      id: `mkt:soc:${p.id}`,
      date: d,
      title: (p.title || p.content || "Post").slice(0, 60),
      badge: p.status || "Social",
      color: "#0ea5e9",
      tone: "sky",
      href: "#social-media",
    });
  }

  return { byDate };
}

// ---------------------------------------------------------------------------
// 9. CUSTOM CALENDARS (e.g. Meeting Room)
// ---------------------------------------------------------------------------

export function buildCustomCalendarData(params: {
  calendar: CustomCalendar;
  events: CustomCalendarEvent[];
  rangeStart: string;
  rangeEnd: string;
}): { byDate: Map<string, HubCalendarItem[]> } {
  const { calendar, events, rangeStart, rangeEnd } = params;
  const byDate = new Map<string, HubCalendarItem[]>();
  for (const ev of events) {
    if (ev.calendarId !== calendar.id) continue;
    const s = toIso(ev.startDate);
    const e = toIso(ev.endDate) || s;
    if (!s) continue;
    expandSpanIntoRange(s, e, rangeStart, rangeEnd, (day) => {
      const arr = byDate.get(day) || [];
      arr.push({
        id: `cus:${ev.id}:${day}`,
        date: day,
        endDate: e,
        startTime: ev.startTime || null,
        endTime: ev.endTime || null,
        title: ev.title,
        subtitle: ev.owner || undefined,
        color: ev.color || calendar.color || "#6366f1",
        customEvent: ev,
      });
      byDate.set(day, arr);
    });
  }
  return { byDate };
}
