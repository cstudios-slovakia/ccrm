import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyBreakdownPreset,
  buildProjectBreakdown,
  computeTaskQueueWaitSeconds,
  computeTicketQueueWaitSeconds,
  EMPTY_BREAKDOWN_TIME,
  formatWaitDuration,
  moveBreakdownColumn,
  reconcileBreakdownColumns,
} from "./projectBreakdown.ts";
import { DEFAULT_TICKET_STATUS_DEFS } from "./tickets.ts";
import type { Employee, EmployeeSalary, FinancialRecord, Lead, Project, ProjectType, Task, Ticket, UserProfile } from "../types";

const TASK_STATES = ["New", "In progress", "Blocked", "Done"];
const NOW_MS = new Date("2026-11-22T12:00:00").getTime();

const mkLead = (id: string, name: string, clientId?: string | null): Lead => ({
  id,
  name,
  city: "Bratislava",
  clientType: "business",
  status: "accepted",
  source: "website",
  owner: "Erik",
  value: 0,
  createdAt: "2026-01-01",
  clientId: clientId ?? null,
});

const mkProject = (id: string, name: string, overrides: Partial<Project> = {}): Project => ({
  id,
  projectTypeId: "pt-1",
  name,
  status: "active",
  managers: ["Erik"],
  data: {},
  value: 10000,
  ...overrides,
});

const PROJECT_TYPES: ProjectType[] = [{ id: "pt-1", name: "Web", icon: "Briefcase", attributes: [] }];

describe("projectBreakdown pure engine", () => {
  it("computes queue wait time for started, unstarted live queue, and completed tasks", () => {
    const started = computeTaskQueueWaitSeconds(
      { id: "t1", status: "In progress", createdAt: "2026-11-22 08:00:00", firstStartedAt: "2026-11-22 10:30:00" },
      TASK_STATES,
      undefined,
      NOW_MS,
    );
    assert.deepEqual(started, { waitSeconds: 2.5 * 3600, isWaitingNow: false });

    // Timer started before status was updated -> earliest timestamp wins
    const timerFirst = computeTaskQueueWaitSeconds(
      { id: "t2", status: "In progress", createdAt: "2026-11-22 08:00:00", firstStartedAt: "2026-11-22 11:00:00" },
      TASK_STATES,
      "2026-11-22 09:00:00",
      NOW_MS,
    );
    assert.deepEqual(timerFirst, { waitSeconds: 3600, isWaitingNow: false });

    // Untouched task sitting in New measures live queue age
    const waitingNow = computeTaskQueueWaitSeconds(
      { id: "t3", status: "New", createdAt: "2026-11-22 10:00:00" },
      TASK_STATES,
      undefined,
      NOW_MS,
    );
    assert.deepEqual(waitingNow, { waitSeconds: 2 * 3600, isWaitingNow: true });
  });

  it("computes queue wait time for tickets (agent reply vs untouched New)", () => {
    const replied = computeTicketQueueWaitSeconds(
      {
        id: "tk1",
        status: "open",
        createdAt: "2026-11-22 09:00:00",
        firstRespondedAt: "2026-11-22 09:45:00",
      },
      DEFAULT_TICKET_STATUS_DEFS,
      undefined,
      NOW_MS,
    );
    assert.deepEqual(replied, { waitSeconds: 45 * 60, isWaitingNow: false });

    const waitingTicket = computeTicketQueueWaitSeconds(
      { id: "tk2", status: "new", createdAt: "2026-11-22 11:15:00" },
      DEFAULT_TICKET_STATUS_DEFS,
      undefined,
      NOW_MS,
    );
    assert.deepEqual(waitingTicket, { waitSeconds: 45 * 60, isWaitingNow: true });
  });

  it("rolls up Client -> Project -> Employee hierarchy with financials, margin, tasks, tickets, and salaries", () => {
    const leads: Lead[] = [
      mkLead("client-acme", "ACME s.r.o."),
      mkLead("lead-acme-deal", "ACME Deal", "client-acme"),
    ];
    const projects: Project[] = [
      mkProject("p1", "ACME Portal", { leadId: "lead-acme-deal", value: 10000, hoursBudget: 50 }),
      mkProject("p2", "ACME Mobile", { clientId: "client-acme", value: 5000 }),
      mkProject("p3", "Internal R&D", { value: 0 }),
    ];
    const financialRecords: FinancialRecord[] = [
      { id: "f1", type: "income", categoryId: "c1", amountPlanned: 6000, amountReal: 4000, status: "paid", issueDate: "2026-11-01", projectId: "p1" },
      { id: "f2", type: "income", categoryId: "c1", amountPlanned: 2000, amountReal: 0, status: "pending", issueDate: "2026-11-10", projectId: "p1" },
      { id: "f3", type: "expense", categoryId: "c2", amountPlanned: 500, amountReal: 500, status: "paid", issueDate: "2026-11-05", projectId: "p1" },
    ];
    const users: UserProfile[] = [
      { id: "u1", name: "Erik Putz", email: "erik@cstudios.sk", role: "Admin" },
      { id: "u2", name: "Roli Vanyek", email: "roli@cstudios.sk", role: "User" },
    ];
    const employees: Employee[] = [
      { id: "e1", userId: "u1", name: "Erik Putz", kind: "employee", salaryType: "monthly", salaryAmount: 3000, isActive: true },
      { id: "e2", userId: "u2", name: "Roli Vanyek", kind: "contractor", salaryType: "hourly", salaryAmount: 30, isActive: true },
    ];
    const employeeSalaries: EmployeeSalary[] = [
      { id: "s1", employeeId: "e1", periodType: "monthly", periodKey: "2026-10", year: 2026, periodNumber: 10, items: [], totalSalary: 3250, totalPaid: 3250, status: "paid" },
    ];
    const tasks: Task[] = [
      { id: "t1", title: "Spec", description: "", status: "Done", priority: "high", deadline: "2026-11-15", owner: "Erik Putz", assignedUsers: ["Erik Putz"], relatedProjectId: "p1", createdAt: "2026-11-10 08:00:00", firstStartedAt: "2026-11-10 09:00:00", reopenedCount: 1, deadlineMoves: 2 },
      { id: "t2", title: "API", description: "", status: "New", priority: "medium", deadline: "2026-11-20", owner: "Roli Vanyek", assignedUsers: ["Roli Vanyek"], relatedProjectId: "p1", createdAt: "2026-11-22 10:00:00" },
    ];
    const tickets: Ticket[] = [
      { id: "tk1", ticketNumber: "TCK-001", title: "Login bug", subject: "Login bug", status: "open", priority: "high", type: "bug", projectId: "p1", createdAt: "2026-11-22 08:00:00", firstRespondedAt: "2026-11-22 08:30:00", reopenedCount: 2, assignedUser: "Erik Putz" },
    ];

    const res = buildProjectBreakdown({
      projects,
      projectTypes: PROJECT_TYPES,
      projectStatuses: [],
      leads,
      financialRecords,
      tasks,
      taskStates: TASK_STATES,
      tickets,
      ticketStatuses: DEFAULT_TICKET_STATUS_DEFS,
      supportContracts: [],
      users,
      employees,
      employeeSalaries,
      timeData: {
        ...EMPTY_BREAKDOWN_TIME,
        canSeeAllCosts: true,
        byProject: {
          p1: {
            seconds: 10 * 3600,
            billableSeconds: 10 * 3600,
            cost: 250,
            people: [{ userId: "u1", employeeId: "e1", seconds: 10 * 3600, billableSeconds: 10 * 3600, cost: 250 }],
          },
        },
      },
      defaultCurrency: "EUR",
      rights: { canSeeCosts: true, canSeeFinance: true, canSeeSalaries: true },
      today: "2026-11-22",
      nowStamp: "2026-11-22 12:00",
      nowMs: NOW_MS,
    });

    assert.equal(res.clients.length, 2); // ACME + Internal/Unassigned (kept at bottom)
    const acme = res.clients[0];
    assert.equal(acme.name, "ACME s.r.o.");
    assert.equal(acme.projectCount, 2);
    assert.equal(acme.valueByCurrency.EUR, 15000);
    // p1 invoiced = 4000 (paid) + 2000 (pending) = 6000 -> invoicable = 4000; p2 = 5000 -> total 9000
    assert.equal(acme.invoicableByCurrency.EUR, 9000);
    // p1 stillToBePaid = 2000 + 4000 = 6000; p2 = 5000 -> total 11000
    assert.equal(acme.stillToBePaidByCurrency.EUR, 11000);
    assert.equal(acme.laborCost, 250);
    // p1 value 10000 - (250 labor + 500 expense) = 9250; p2 value 5000 -> margin 14250
    assert.equal(acme.marginByCurrency?.EUR, 14250);

    const p1Row = acme.projects.find((p) => p.project.id === "p1")!;
    assert.equal(p1Row.tasks.total, 2);
    assert.equal(p1Row.tasks.open, 1);
    assert.equal(p1Row.tasks.overdue, 1); // t2 deadline 2026-11-20
    assert.equal(p1Row.tasks.reopened, 1);
    assert.equal(p1Row.tasks.deadlineMoves, 2);
    assert.equal(p1Row.tasks.wait.waitingNowCount, 1);
    assert.equal(p1Row.tickets.reopened, 2);
    assert.equal(p1Row.effectiveHourlyRate, 1000);

    // Level 3 includes both Erik (logged 10h) and Roli (0h assigned to t2)
    assert.equal(p1Row.employees.length, 2);
    const erik = p1Row.employees[0];
    assert.equal(erik.name, "Erik Putz");
    assert.equal(erik.laborCost, 250);
    assert.equal(erik.contractSalaryAmount, 3000);
    assert.equal(erik.lastSalaryAmount, 3250);
    assert.equal(erik.lastSalaryPeriod, "2026-10");
    assert.equal(erik.sharePercent, 100);
    assert.equal(p1Row.employees[1].name, "Roli Vanyek");
    assert.equal(p1Row.employees[1].seconds, 0);
    assert.equal(p1Row.employees[1].tasks.open, 1);

    assert.equal(res.clients[1].isUnassigned, true);
  });

  it("respects RBAC column visibility & keeps entity column locked first", () => {
    const restricted = reconcileBreakdownColumns(null, { canSeeCosts: false, canSeeFinance: false, canSeeSalaries: false });
    assert.equal(restricted[0].key, "entity");
    assert.ok(!restricted.some((c) => c.key === "laborAndSalary"));
    assert.ok(!restricted.some((c) => c.key === "margin"));

    const moved = moveBreakdownColumn(
      applyBreakdownPreset("all", { canSeeCosts: true, canSeeFinance: true, canSeeSalaries: true }),
      "margin",
      "value",
      "before",
    );
    assert.equal(moved[0].key, "entity");
    assert.equal(moved[1].key, "margin");
    assert.equal(moved[2].key, "value");
    assert.equal(formatWaitDuration(5400, "en"), "1h 30m");
  });
});
