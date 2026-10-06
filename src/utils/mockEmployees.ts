import type { Employee, EmployeeSalary, EmployeeVacation, EmployeeSettings } from "../types";

export const DEFAULT_MOCK_EMPLOYEES: Employee[] = [
  {
    id: "emp-1",
    name: "Ing. Michal Kováč",
    role: "Chief Architect & Project Lead",
    pin: "880415/7231",
    email: "michal.kovac@cstudios.sk",
    phone: "+421 905 442 811",
    addressStreet: "Dunajská 24",
    addressCity: "Bratislava",
    addressZip: "811 08",
    addressCountry: "Slovakia",
    salaryType: "monthly",
    salaryAmount: 3600,
    salaryDueDay: 15,
    vacationAllowances: {
      annual: 25,
      sick: 10,
      doctor: 7,
      unpaid: 0
    },
    timeTrackingProvider: "toggl",
    autoExpense: true,
    expenseCategoryId: "fc-exp-pay-salaries",
    isActive: true,
    notes: "Lead architectural director for enterprise contracts. Authorised chamber architect.",
    createdAt: "2026-01-10 09:00:00",
    updatedAt: "2026-09-15 14:20:00"
  },
  {
    id: "emp-2",
    name: "Mgr. Zuzana Horváthová",
    role: "Senior UX/UI & Brand Strategist",
    pin: "925708/6519",
    email: "zuzana.horvath@cstudios.sk",
    phone: "+421 918 631 904",
    addressStreet: "Hlavná 48",
    addressCity: "Trnava",
    addressZip: "917 01",
    addressCountry: "Slovakia",
    salaryType: "monthly",
    salaryAmount: 2850,
    salaryDueDay: 15,
    vacationAllowances: {
      annual: 25,
      sick: 10,
      doctor: 7,
      unpaid: 0
    },
    timeTrackingProvider: "toggl",
    autoExpense: true,
    expenseCategoryId: "fc-exp-pay-salaries",
    isActive: true,
    notes: "Product design lead for CRM, design systems, and client brand identities.",
    createdAt: "2026-01-15 10:30:00",
    updatedAt: "2026-09-12 11:10:00"
  },
  {
    id: "emp-3",
    name: "Bc. Peter Varga",
    role: "Full-Stack Engineer & DevOps",
    pin: "950122/8104",
    email: "peter.varga@cstudios.sk",
    phone: "+421 944 205 789",
    addressStreet: "Štefánikova 12",
    addressCity: "Nitra",
    addressZip: "949 01",
    addressCountry: "Slovakia",
    salaryType: "monthly",
    salaryAmount: 3100,
    salaryDueDay: 15,
    vacationAllowances: {
      annual: 20,
      sick: 10,
      doctor: 7,
      unpaid: 0
    },
    timeTrackingProvider: "toggl",
    autoExpense: true,
    expenseCategoryId: "fc-exp-pay-salaries",
    isActive: true,
    notes: "Core platform architect. Maintains API services, container pipelines and MariaDB cluster.",
    createdAt: "2026-02-01 08:45:00",
    updatedAt: "2026-09-20 16:50:00"
  },
  {
    id: "emp-4",
    name: "Kristína Balážová",
    role: "Operations & Account Specialist",
    pin: "975319/7820",
    email: "kristina.balaz@cstudios.sk",
    phone: "+421 907 334 112",
    addressStreet: "Záhradnícka 62",
    addressCity: "Bratislava",
    addressZip: "821 08",
    addressCountry: "Slovakia",
    salaryType: "monthly",
    salaryAmount: 2200,
    salaryDueDay: 15,
    vacationAllowances: {
      annual: 22,
      sick: 10,
      doctor: 7,
      unpaid: 0
    },
    timeTrackingProvider: "toggl",
    autoExpense: true,
    expenseCategoryId: "fc-exp-pay-salaries",
    isActive: true,
    notes: "Manages client contracts, monthly invoicing schedules, office operations and procurement.",
    createdAt: "2026-03-01 09:15:00",
    updatedAt: "2026-09-18 10:00:00"
  }
];

// ---------------------------------------------------------------------------
// Date helpers — demo data is anchored to "now" (the moment the module is first
// seeded, i.e. when the CRM is installed) so the calendar and the salary matrix
// are populated around the current month instead of a hardcoded year.
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Local-time YYYY-MM-DD (toISOString would shift the day for UTC+ timezones). */
const toDateStr = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;

/** First weekday on or after `d`. */
const nextWeekday = (d: Date): Date => {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (isWeekend(out)) out.setDate(out.getDate() + 1);
  return out;
};

/** Last day of the span that contains `workdays` working days starting at `start`. */
const spanEnd = (start: Date, workdays: number): Date => {
  const out = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let counted = 1;
  while (counted < workdays) {
    out.setDate(out.getDate() + 1);
    if (!isWeekend(out)) counted++;
  }
  return out;
};

export const generateDefaultMockSalaries = (
  year: number = new Date().getFullYear(),
  now: Date = new Date()
): EmployeeSalary[] => {
  const salaries: EmployeeSalary[] = [];
  const nowIndex = now.getFullYear() * 12 + now.getMonth();

  DEFAULT_MOCK_EMPLOYEES.forEach((emp, empIdx) => {
    const dueDay = emp.salaryDueDay || 15;
    for (let m = 1; m <= 12; m++) {
      const monthStr = pad2(m);
      const periodKey = `${year}-${monthStr}`;
      const periodIndex = year * 12 + (m - 1);
      // Past months are paid; the current month is paid once its payday has arrived.
      const isPaid = periodIndex < nowIndex || (periodIndex === nowIndex && now.getDate() >= dueDay - 1);

      const baseSalary = emp.salaryAmount || 2500;
      // Bonus in June (half-year) and Dec (year-end)
      const bonus = m === 6 ? 500 : m === 12 ? 800 : 0;
      // A little variety so the matrix and the salary history are not a flat wall of identical rows:
      // overtime for the engineer / designer in busy months, travel reimbursements for operations / lead.
      const overtime = (emp.id === "emp-3" || emp.id === "emp-2") && (m + empIdx) % 3 === 0
        ? 90 + ((m * 37 + empIdx * 53) % 5) * 30
        : 0;
      const reimbursement = (emp.id === "emp-1" || emp.id === "emp-4") && (m + empIdx) % 4 === 1
        ? 45 + ((m * 29 + empIdx * 17) % 4) * 20
        : 0;

      const items = [
        { categoryId: "base", categoryName: "Základná mzda", amount: baseSalary },
        ...(bonus > 0
          ? [{ categoryId: "bonus", categoryName: m === 6 ? "Polročné prémie" : "Ročné prémie", amount: bonus }]
          : []),
        ...(overtime > 0 ? [{ categoryId: "overtime", categoryName: "Nadčasy", amount: overtime }] : []),
        ...(reimbursement > 0
          ? [{ categoryId: "reimbursement", categoryName: "Cestovné / Diéty", amount: reimbursement }]
          : [])
      ];
      const total = items.reduce((sum, it) => sum + it.amount, 0);

      salaries.push({
        id: `sal-${emp.id}-${periodKey}`,
        employeeId: emp.id,
        periodType: "monthly",
        periodKey,
        year,
        periodNumber: m,
        items: items.map((it) => ({
          categoryId: it.categoryId,
          categoryName: it.categoryName,
          salary: it.amount,
          paid: isPaid ? it.amount : 0
        })),
        totalSalary: total,
        totalPaid: isPaid ? total : 0,
        status: isPaid ? "paid" : "pending",
        dueDate: `${year}-${monthStr}-${pad2(dueDay)}`,
        paymentDate: isPaid ? `${year}-${monthStr}-${pad2(dueDay - 1)}` : null,
        paymentMethod: "bank_transfer",
        note: isPaid ? "Úhrada cez SEPA prevod" : "Plánovaný náklad mzdy"
      });
    }
  });

  return salaries;
};

interface DemoLeaveTemplate {
  employeeId: string;
  vacationTypeId: "annual" | "sick" | "doctor" | "unpaid";
  /** Months relative to the current month (0 = this month, -1 = last month, 2 = in two months). */
  monthOffset: number;
  /** Preferred day of month the leave starts on; snapped forward to a weekday. */
  startDay: number;
  /** Working days covered (weekends inside the range are not counted). */
  workdays: number;
  note: string;
  /** Not yet approved by management. Only used for future leave. */
  pending?: boolean;
}

// Spread around the current month: a few months of history, a busy current month
// and a couple of upcoming requests. Totals stay inside each employee's allowance.
const DEMO_LEAVE_TEMPLATES: DemoLeaveTemplate[] = [
  // Ing. Michal Kováč
  { employeeId: "emp-1", vacationTypeId: "annual", monthOffset: -4, startDay: 12, workdays: 4, note: "Predĺžený víkend v Tatrách" },
  { employeeId: "emp-1", vacationTypeId: "doctor", monthOffset: -2, startDay: 9, workdays: 1, note: "Preventívna prehliadka u lekára" },
  { employeeId: "emp-1", vacationTypeId: "sick", monthOffset: -1, startDay: 20, workdays: 3, note: "Chrípka" },
  { employeeId: "emp-1", vacationTypeId: "annual", monthOffset: 0, startDay: 20, workdays: 3, note: "Rodinný výlet" },
  { employeeId: "emp-1", vacationTypeId: "doctor", monthOffset: 0, startDay: 6, workdays: 1, note: "Návšteva zubára" },
  { employeeId: "emp-1", vacationTypeId: "annual", monthOffset: 2, startDay: 22, workdays: 5, note: "Plánovaná dovolenka", pending: true },
  // Mgr. Zuzana Horváthová
  { employeeId: "emp-2", vacationTypeId: "annual", monthOffset: -3, startDay: 6, workdays: 5, note: "Letná dovolenka" },
  { employeeId: "emp-2", vacationTypeId: "doctor", monthOffset: -1, startDay: 14, workdays: 1, note: "Kontrola u špecialistu" },
  { employeeId: "emp-2", vacationTypeId: "sick", monthOffset: 0, startDay: 8, workdays: 2, note: "Nachladnutie" },
  { employeeId: "emp-2", vacationTypeId: "annual", monthOffset: 0, startDay: 27, workdays: 2, note: "Predĺžený víkend" },
  { employeeId: "emp-2", vacationTypeId: "annual", monthOffset: 1, startDay: 10, workdays: 4, note: "Rodinná udalosť" },
  { employeeId: "emp-2", vacationTypeId: "annual", monthOffset: 3, startDay: 15, workdays: 5, note: "Plánovaná dovolenka", pending: true },
  // Bc. Peter Varga
  { employeeId: "emp-3", vacationTypeId: "sick", monthOffset: -4, startDay: 3, workdays: 2, note: "Bolesť chrbta" },
  { employeeId: "emp-3", vacationTypeId: "unpaid", monthOffset: -3, startDay: 2, workdays: 1, note: "Súkromné vybavovanie" },
  { employeeId: "emp-3", vacationTypeId: "annual", monthOffset: -2, startDay: 16, workdays: 5, note: "Turistika" },
  { employeeId: "emp-3", vacationTypeId: "annual", monthOffset: -1, startDay: 28, workdays: 2, note: "Predĺžený víkend" },
  { employeeId: "emp-3", vacationTypeId: "annual", monthOffset: 0, startDay: 12, workdays: 4, note: "Oddych a regenerácia" },
  { employeeId: "emp-3", vacationTypeId: "doctor", monthOffset: 0, startDay: 26, workdays: 1, note: "Kontrola u lekára" },
  { employeeId: "emp-3", vacationTypeId: "doctor", monthOffset: 2, startDay: 11, workdays: 1, note: "Očné vyšetrenie", pending: true },
  // Kristína Balážová
  { employeeId: "emp-4", vacationTypeId: "annual", monthOffset: -3, startDay: 20, workdays: 5, note: "Jesenný oddych" },
  { employeeId: "emp-4", vacationTypeId: "doctor", monthOffset: -1, startDay: 5, workdays: 1, note: "Preventívna prehliadka" },
  { employeeId: "emp-4", vacationTypeId: "doctor", monthOffset: 0, startDay: 22, workdays: 1, note: "Návšteva lekára s dieťaťom" },
  { employeeId: "emp-4", vacationTypeId: "annual", monthOffset: 1, startDay: 17, workdays: 5, note: "Predĺžený víkend a oddych" },
  { employeeId: "emp-4", vacationTypeId: "annual", monthOffset: 2, startDay: 8, workdays: 3, note: "Plánovaná dovolenka", pending: true }
];

/**
 * Demo leave records positioned around `now`, so the vacation calendar of every
 * employee has entries in the month that is open by default (and the months next to it).
 * One employee is always on leave today, so the directory's "on leave" counter is not empty.
 */
export const generateDefaultMockVacations = (now: Date = new Date()): EmployeeVacation[] => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = toDateStr(today);

  type Draft = Omit<EmployeeVacation, "id">;
  const drafts: Draft[] = [];

  // Anchored first: leave that covers today (on a weekend: the Friday before, so the range spans it).
  const anchor = new Date(today);
  while (isWeekend(anchor)) anchor.setDate(anchor.getDate() - 1);
  drafts.push({
    employeeId: "emp-4",
    vacationTypeId: "annual",
    startDate: toDateStr(anchor),
    endDate: toDateStr(spanEnd(anchor, 3)),
    daysCount: 3,
    status: "approved",
    note: "Krátke voľno — dnes mimo kancelárie",
    approvedBy: "Vedenie"
  });

  DEMO_LEAVE_TEMPLATES.forEach((tpl) => {
    const monthFirst = new Date(now.getFullYear(), now.getMonth() + tpl.monthOffset, 1);
    const start = nextWeekday(new Date(monthFirst.getFullYear(), monthFirst.getMonth(), tpl.startDay));
    const startDate = toDateStr(start);
    const endDate = toDateStr(spanEnd(start, tpl.workdays));
    drafts.push({
      employeeId: tpl.employeeId,
      vacationTypeId: tpl.vacationTypeId,
      startDate,
      endDate,
      daysCount: tpl.workdays,
      status: tpl.pending && startDate > todayStr ? "pending" : "approved",
      note: tpl.note,
      approvedBy: tpl.pending && startDate > todayStr ? null : "Vedenie"
    });
  });

  // The calendar paints the first matching record per day, so never let one employee's leave overlap.
  const accepted: Draft[] = [];
  drafts.forEach((d) => {
    const clash = accepted.some(
      (a) => a.employeeId === d.employeeId && d.startDate <= a.endDate && d.endDate >= a.startDate
    );
    if (!clash) accepted.push(d);
  });

  return accepted.map((d, i) => ({ id: `vac-demo-${i + 1}`, ...d }));
};

export const DEFAULT_MOCK_SETTINGS: EmployeeSettings = {
  salaryPeriod: "monthly",
  salaryDueDay: 15,
  defaultSalaryDueDay: 15,
  autoExpense: true,
  defaultAutoExpense: true,
  expenseCategoryId: "fc-exp-pay-salaries",
  defaultExpenseCategoryId: "fc-exp-pay-salaries",
  salaryTypes: [
    { id: "base", name: "Základná mzda", defaultAmount: 0 },
    { id: "bonus", name: "Prémie / Odmeny", defaultAmount: 0 },
    { id: "overtime", name: "Nadčasy", defaultAmount: 0 },
    { id: "reimbursement", name: "Cestovné / Diéty", defaultAmount: 0 }
  ],
  vacationTypes: [
    { id: "annual", name: "Dovolenka", defaultAllowance: 25, color: "#c29b62" },
    { id: "sick", name: "PN", defaultAllowance: 10, color: "#ef4444" },
    { id: "doctor", name: "Lekár", defaultAllowance: 7, color: "#3b82f6" },
    { id: "unpaid", name: "Neplatené voľno", defaultAllowance: 0, color: "#8b5cf6" }
  ],
  timeTracking: {
    provider: "toggl",
    togglApiToken: "",
    togglWorkspaceId: ""
  }
};
