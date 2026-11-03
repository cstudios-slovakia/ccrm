import type { EmployeeSettings } from "../types";

/**
 * What the Employees module uses until the server's EMPLOYEE_SETTINGS arrive. It mirrors the default the
 * server writes when the setting is absent (`ccrm_migrate_employees` in api/schema.php), so a fresh install
 * and this fallback agree. It is not sample data: nothing here is seeded into a database.
 */
export const DEFAULT_EMPLOYEE_SETTINGS: EmployeeSettings = {
  salaryPeriod: "monthly",
  defaultSalaryDueDay: 15,
  defaultAutoExpense: false,
  defaultExpenseCategoryId: "fc-exp-payroll",
  salaryTypes: [
    { id: "salary", name: "Salary", color: "#10b981" },
    { id: "bonus", name: "Bonus", color: "#f59e0b" },
    { id: "invoicing", name: "Invoicing", color: "#6366f1" },
    { id: "overtime", name: "Overtime", color: "#ec4899" },
  ],
  vacationTypes: [
    { id: "annual", name: "Annual leave", isPaid: true, defaultDays: 25, color: "#0ea5e9" },
    { id: "worked_days", name: "Leave for days worked", isPaid: true, defaultDays: 5, color: "#8b5cf6" },
    { id: "sick", name: "Sick leave", isPaid: false, defaultDays: 10, color: "#ef4444" },
    { id: "unpaid", name: "Unpaid leave", isPaid: false, defaultDays: 0, color: "#64748b" },
  ],
  timeTracking: { provider: "toggl", togglApiToken: "", togglWorkspaceId: "" },
};
