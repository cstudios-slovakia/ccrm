import assert from "node:assert/strict";
import test from "node:test";
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
  Task,
  Ticket,
  UnifiedEntryRegistry,
  UnifiedEntryRow,
  WarehouseBatch,
} from "../types";
import {
  buildCustomCalendarData,
  buildDeadlinesCalendarData,
  buildLogisticsCalendarData,
  buildPaymentCalendarData,
  buildSalesCalendarData,
  buildTeamCalendarData,
  buildWorkCalendarData,
  mondayOfIso,
} from "./taskHubCalendars.ts";
import { findOverlappingCustomEvents } from "./customCalendarsApi.ts";

const PROJECT_TYPE: ProjectType = {
  id: "pt-1",
  name: "Realization",
  description: "",
  icon: "Briefcase",
  color: "#10b981",
  attributes: [],
  hasTimeline: true,
  hasGantt: true,
  hasDeadline: true,
  hasInvoiceDate: true,
};

const LEAD: Lead = {
  id: "lead-1",
  name: "Novák Stavby",
  email: "novak@test.sk",
  phone: "",
  status: "accepted",
  value: 10000,
  rating: 4,
  source: "website",
  category: "Products",
  lastContact: "2026-11-01",
  notes: "",
  timeline: [],
};

test("Work calendar builds project spans, Gantt phases, project tasks, and filters mine vs all", () => {
  const projects: Project[] = [
    {
      id: "p1",
      projectTypeId: "pt-1",
      name: "Roof Alpha",
      leadId: "lead-1",
      status: "in_progress",
      managers: ["Alice"],
      data: {},
      startDate: "2026-11-16",
      completionDeadline: "2026-11-18",
      gantt: [{ id: "g1", title: "Installation", contactId: "lead-1", startDate: "2026-11-17", endDate: "2026-11-17", progress: 50 }],
    },
    {
      id: "p2",
      projectTypeId: "pt-1",
      name: "Roof Beta",
      leadId: "lead-1",
      status: "in_progress",
      managers: ["Bob"],
      data: {},
      startDate: "2026-11-16",
      completionDeadline: "2026-11-17",
    },
  ];
  const tasks: Task[] = [
    {
      id: "t1",
      title: "Site check",
      description: "",
      status: "New",
      priority: "high",
      deadline: "2026-11-17",
      owner: "Alice",
      assignedUsers: ["Alice"],
      relatedProjectId: "p1",
    },
  ];

  const allRes = buildWorkCalendarData({
    projects,
    projectTypes: [PROJECT_TYPE],
    tasks,
    leads: [LEAD],
    rangeStart: "2026-11-01",
    rangeEnd: "2026-11-30",
    todayIso: "2026-11-15",
    scope: "all",
  });
  const day17 = allRes.byDate.get("2026-11-17") || [];
  assert.equal(day17.some((i) => i.title === "Roof Alpha" && i.category === "project"), true);
  assert.equal(day17.some((i) => i.title === "Roof Alpha · Installation" && i.badge === "50%"), true);
  assert.equal(day17.some((i) => i.title === "Site check" && i.category === "task"), true);
  assert.equal(day17.some((i) => i.title === "Roof Beta"), true);

  const mineRes = buildWorkCalendarData({
    projects,
    projectTypes: [PROJECT_TYPE],
    tasks,
    leads: [LEAD],
    rangeStart: "2026-11-01",
    rangeEnd: "2026-11-30",
    todayIso: "2026-11-15",
    scope: "mine",
    currentUserName: "Alice",
  });
  const mineDay17 = mineRes.byDate.get("2026-11-17") || [];
  assert.equal(mineDay17.some((i) => i.title === "Roof Alpha"), true);
  assert.equal(mineDay17.some((i) => i.title === "Roof Beta"), false);
});

test("Payment calendar deduplicates bridged invoices, computes unbilled project invoiceDate plan, and rolls up weeks", () => {
  const projects: Project[] = [
    {
      id: "p1",
      projectTypeId: "pt-1",
      name: "Project Plan",
      status: "in_progress",
      managers: [],
      data: {},
      value: 5000,
      invoiceDate: "2026-11-18", // W47 (Monday 2026-11-16)
    },
  ];
  const financialRecords: FinancialRecord[] = [
    // Bridged invoice movement already counting 2000 towards p1
    {
      id: "fr-inv-inv1",
      type: "income",
      subtype: "invoice",
      title: "FA-2026-001 — Novák",
      amountPlanned: 2000,
      amountReal: 0,
      currency: "EUR",
      status: "pending",
      issueDate: "2026-11-01",
      dueDate: "2026-11-17",
      isRecurring: false,
      projectId: "p1",
      invoiceNumber: "FA-2026-001",
    },
    // One-off expense due same week
    {
      id: "fr-exp-1",
      type: "expense",
      title: "Material delivery",
      amountPlanned: 800,
      amountReal: 0,
      currency: "EUR",
      status: "pending",
      issueDate: "2026-11-10",
      dueDate: "2026-11-19",
      isRecurring: false,
    },
  ];
  const invoicesOffers: InvoiceOffer[] = [
    // Should be deduplicated because fr-inv-inv1 exists
    {
      id: "inv1",
      documentNumber: "FA-2026-001",
      type: "invoice",
      mode: "default",
      leadId: "lead-1",
      clientName: "Novák",
      title: "Invoice 1",
      subject: "",
      uspCards: [],
      items: [],
      subtotal: 2000,
      vatAmount: 0,
      totalPrice: 2000,
      currency: "EUR",
      status: "sent",
      issuedAt: "2026-11-01",
      dueDate: "2026-11-17",
    },
    // Unbridged invoice in same week
    {
      id: "inv2",
      documentNumber: "FA-2026-002",
      type: "invoice",
      mode: "default",
      leadId: "lead-1",
      clientName: "Client 2",
      title: "Invoice 2",
      subject: "",
      uspCards: [],
      items: [],
      subtotal: 1200,
      vatAmount: 0,
      totalPrice: 1200,
      currency: "EUR",
      status: "sent",
      issuedAt: "2026-11-02",
      dueDate: "2026-11-20",
    },
  ];
  const salaries: EmployeeSalary[] = [
    {
      id: "sal-1",
      employeeId: "e1",
      periodType: "monthly",
      periodKey: "2026-11",
      year: 2026,
      periodNumber: 11,
      items: [],
      totalSalary: 1000,
      totalPaid: 0,
      status: "pending",
      dueDate: "2026-11-20",
    },
    {
      id: "sal-bridged",
      employeeId: "e2",
      periodType: "monthly",
      periodKey: "2026-11",
      year: 2026,
      periodNumber: 11,
      items: [],
      totalSalary: 900,
      totalPaid: 0,
      status: "pending",
      dueDate: "2026-11-20",
      financialRecordId: "fr-sal-2", // already in ledger, must be skipped
    },
  ];

  const res = buildPaymentCalendarData({
    financialRecords,
    invoicesOffers,
    projects,
    projectTypes: [PROJECT_TYPE],
    employeeSalaries: salaries,
    leads: [LEAD],
    rangeStart: "2026-11-01",
    rangeEnd: "2026-11-30",
    todayIso: "2026-11-15",
    defaultCurrency: "EUR",
  });

  const w47 = res.weeklyRollups.get(mondayOfIso("2026-11-18"))?.byCurrency.EUR;
  assert.ok(w47);
  // Planned invoicing = 5000 - 2000 already booked on p1 = 3000
  assert.equal(w47.plannedInvoicing, 3000);
  // Invoices due = 2000 (fr-inv-inv1, deduplicated from inv1) + 1200 (inv2) = 3200
  assert.equal(w47.invoicesDue, 3200);
  // Expenses = 800 + 1000 (sal-1; sal-bridged skipped) = 1800
  assert.equal(w47.expenses, 1800);
  // Net = 3000 + 3200 - 1800 = 4400
  assert.equal(w47.net, 4400);
});

test("Team, Sales, Deadlines, and Logistics calendars map domain records accurately", () => {
  const employees: Employee[] = [
    { id: "e1", name: "Jana", leaves: [{ id: "l1", startDate: "2026-11-17", endDate: "2026-11-18", type: "sick", status: "approved" }] },
  ];
  const vacations: EmployeeVacation[] = [
    { id: "v1", employeeId: "e1", vacationTypeId: "vt1", startDate: "2026-11-19", endDate: "2026-11-19", daysCount: 1, status: "approved" },
  ];
  const team = buildTeamCalendarData({ employees, employeeVacations: vacations, rangeStart: "2026-11-01", rangeEnd: "2026-11-30" });
  assert.equal((team.byDate.get("2026-11-17") || []).some((i) => i.title.includes("Jana")), true);
  assert.equal((team.byDate.get("2026-11-19") || []).some((i) => i.title === "Jana"), true);

  const sales = buildSalesCalendarData({
    meetingNotes: [],
    invoicesOffers: [
      {
        id: "off1",
        documentNumber: "CP-1",
        type: "price_offer",
        mode: "default",
        leadId: "lead-1",
        clientName: "Novák",
        title: "Offer",
        subject: "",
        uspCards: [],
        items: [],
        subtotal: 500,
        vatAmount: 0,
        totalPrice: 500,
        currency: "EUR",
        status: "sent",
        issuedAt: "2026-11-01",
        validUntil: "2026-11-25",
      },
    ],
    leads: [LEAD],
    rangeStart: "2026-11-01",
    rangeEnd: "2026-11-30",
    todayIso: "2026-11-15",
  });
  assert.equal((sales.byDate.get("2026-11-25") || [])[0]?.badge, "Valid until");

  const regs: UnifiedEntryRegistry[] = [{ id: "r1", name: "Fleet", icon: "Car", color: "#000", modules: ["title", "due_date"], folderModules: [], foldersEnabled: false, archived: false }];
  const regData: Record<string, UnifiedEntryRow[]> = { r1: [{ id: "row1", parentId: null, isFolder: false, title: "STK Van", dueDate: "2026-11-22" }] };
  const tickets: Ticket[] = [{ id: "tk1", ticketNumber: "T-1", subject: "Fix", status: "open", priority: "high", type: "bug", createdAt: "2026-11-10", slaResolutionDueAt: "2026-11-22T15:00" }];
  const dl = buildDeadlinesCalendarData({ unifiedEntries: regs, unifiedEntriesData: regData, supportContracts: [], tickets, rangeStart: "2026-11-01", rangeEnd: "2026-11-30", todayIso: "2026-11-15" });
  assert.equal((dl.byDate.get("2026-11-22") || []).length, 2);

  const orders: Order[] = [{
    id: "o1",
    orderNumber: "OBJ-1",
    type: "sales",
    status: "new",
    customerType: "client",
    delivery: { country: "SK" },
    billing: { country: "SK" },
    paymentStatus: "unpaid",
    currency: "EUR",
    itemsNetAmount: 100,
    servicesNetAmount: 0,
    totalNetAmount: 100,
    totalTaxAmount: 20,
    totalGrossAmount: 120,
    orderDate: "2026-11-10",
    confirmedDeliveryDate: "2026-11-24",
  }];
  const batches: WarehouseBatch[] = [{ id: "b1", itemId: "i1", warehouseId: "w1", batchNumber: "LOT-9", expirationDate: "2026-11-28", initialQuantity: 10, currentQuantity: 4, purchasePrice: 5 }];
  const log = buildLogisticsCalendarData({ orders, warehouseBatches: batches, rangeStart: "2026-11-01", rangeEnd: "2026-11-30", todayIso: "2026-11-15" });
  assert.equal((log.byDate.get("2026-11-24") || [])[0]?.title, "OBJ-1");
  assert.equal((log.byDate.get("2026-11-28") || [])[0]?.title, "Batch LOT-9");
});

test("Custom calendars expand multi-day events and detect overlapping Meeting Room bookings", () => {
  const cal: CustomCalendar = { id: "ccal_room", name: "Meeting Room", color: "#ec4899" };
  const events: CustomCalendarEvent[] = [
    {
      id: "ev1",
      calendarId: "ccal_room",
      title: "Design Sync",
      startDate: "2026-11-20",
      endDate: "2026-11-20",
      startTime: "10:00",
      endTime: "11:00",
      owner: "Erik",
    },
    {
      id: "ev2",
      calendarId: "ccal_room",
      title: "Offsite Workshop",
      startDate: "2026-11-24",
      endDate: "2026-11-25",
    },
  ];

  const mapped = buildCustomCalendarData({ calendar: cal, events, rangeStart: "2026-11-01", rangeEnd: "2026-11-30" });
  assert.equal((mapped.byDate.get("2026-11-24") || []).length, 1);
  assert.equal((mapped.byDate.get("2026-11-25") || []).length, 1);

  assert.equal(
    findOverlappingCustomEvents(events, { calendarId: "ccal_room", startDate: "2026-11-20", endDate: "2026-11-20", startTime: "10:30", endTime: "11:30" }).length,
    1
  );
  assert.equal(
    findOverlappingCustomEvents(events, { calendarId: "ccal_room", startDate: "2026-11-20", endDate: "2026-11-20", startTime: "11:00", endTime: "12:00" }).length,
    0
  );
});
