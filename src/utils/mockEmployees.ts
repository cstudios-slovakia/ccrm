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

export const generateDefaultMockSalaries = (year: number = 2026): EmployeeSalary[] => {
  const salaries: EmployeeSalary[] = [];
  const employees = DEFAULT_MOCK_EMPLOYEES;

  employees.forEach((emp) => {
    for (let m = 1; m <= 12; m++) {
      const monthStr = m < 10 ? `0${m}` : `${m}`;
      const periodKey = `${year}-${monthStr}`;
      const isPastMonth = m < 9;
      const isCurrentMonth = m === 9;
      
      const baseSalary = emp.salaryAmount || 2500;
      // Bonus in June (half-year) and Dec (year-end)
      const bonus = m === 6 ? 500 : m === 12 ? 800 : 0;
      const total = baseSalary + bonus;
      const isPaid = isPastMonth || (isCurrentMonth && true);

      salaries.push({
        id: `sal-${emp.id}-${periodKey}`,
        employeeId: emp.id,
        periodType: "monthly",
        periodKey,
        year,
        periodNumber: m,
        items: [
          { categoryId: "base", categoryName: "Základná mzda", salary: baseSalary, paid: isPaid ? baseSalary : 0 },
          ...(bonus > 0 ? [{ categoryId: "bonus", categoryName: "Polročné prémie", salary: bonus, paid: isPaid ? bonus : 0 }] : [])
        ],
        totalSalary: total,
        totalPaid: isPaid ? total : 0,
        status: isPaid ? "paid" : "pending",
        dueDate: `${year}-${monthStr}-15`,
        paymentDate: isPaid ? `${year}-${monthStr}-14` : null,
        paymentMethod: "bank_transfer",
        note: isPaid ? "Úhrada cez SEPA prevod" : "Plánovaný náklad mzdy"
      });
    }
  });

  return salaries;
};

export const DEFAULT_MOCK_VACATIONS: EmployeeVacation[] = [
  {
    id: "vac-1",
    employeeId: "emp-1",
    vacationTypeId: "annual",
    startDate: "2026-07-13",
    endDate: "2026-07-24",
    daysCount: 10,
    status: "taken",
    note: "Letná rodinná dovolenka (Chorvátsko)",
    approvedBy: "Vedenie"
  },
  {
    id: "vac-2",
    employeeId: "emp-1",
    vacationTypeId: "annual",
    startDate: "2026-12-23",
    endDate: "2026-12-31",
    daysCount: 6,
    status: "approved",
    note: "Vianočné sviatky",
    approvedBy: "Vedenie"
  },
  {
    id: "vac-3",
    employeeId: "emp-2",
    vacationTypeId: "annual",
    startDate: "2026-08-03",
    endDate: "2026-08-07",
    daysCount: 5,
    status: "taken",
    note: "Letná dovolenka",
    approvedBy: "Vedenie"
  },
  {
    id: "vac-4",
    employeeId: "emp-2",
    vacationTypeId: "doctor",
    startDate: "2026-09-18",
    endDate: "2026-09-18",
    daysCount: 1,
    status: "taken",
    note: "Preventívna prehliadka u lekára",
    approvedBy: "Vedenie"
  },
  {
    id: "vac-5",
    employeeId: "emp-3",
    vacationTypeId: "annual",
    startDate: "2026-08-17",
    endDate: "2026-08-21",
    daysCount: 5,
    status: "taken",
    note: "Turistika Vysoké Tatry",
    approvedBy: "Vedenie"
  },
  {
    id: "vac-6",
    employeeId: "emp-4",
    vacationTypeId: "annual",
    startDate: "2026-10-12",
    endDate: "2026-10-16",
    daysCount: 5,
    status: "approved",
    note: "Predĺžený jesenný víkend a oddych",
    approvedBy: "Vedenie"
  }
];

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
