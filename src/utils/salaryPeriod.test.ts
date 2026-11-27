import test from "node:test";
import assert from "node:assert/strict";
import type { EmployeeSalary } from "../types";
import {
  canonicalSalaryPeriodKey,
  isCanonicalSalaryPeriodKey,
  isPayrollPeriodClosed,
  salaryPeriodKey,
  salaryRecordForPeriod
} from "./salaryPeriod.ts";

const rec = (over: Partial<EmployeeSalary>): EmployeeSalary => ({
  id: "sal_e1_2026-05_2026",
  employeeId: "e1",
  periodType: "monthly",
  periodKey: "2026-05",
  year: 2026,
  periodNumber: 5,
  items: [],
  totalSalary: 1000,
  totalPaid: 0,
  status: "pending",
  ...over
});

test("a month key always carries its year", () => {
  assert.equal(salaryPeriodKey(2026, 5), "2026-05");
  assert.equal(salaryPeriodKey(2025, 12), "2025-12");
  assert.equal(salaryPeriodKey(2026, 9, "weekly"), "2026-W09");
});

test("only year-carrying keys are canonical", () => {
  assert.equal(isCanonicalSalaryPeriodKey("2026-05"), true);
  assert.equal(isCanonicalSalaryPeriodKey("2026-W19"), true);
  assert.equal(isCanonicalSalaryPeriodKey("M05"), false);
  assert.equal(isCanonicalSalaryPeriodKey(""), false);
  assert.equal(isCanonicalSalaryPeriodKey(undefined), false);
});

test("a legacy M05 key is rebuilt from the record's year, so May 2025 and May 2026 differ", () => {
  assert.equal(canonicalSalaryPeriodKey(rec({ periodKey: "M05", year: 2026 })), "2026-05");
  assert.equal(canonicalSalaryPeriodKey(rec({ periodKey: "M05", year: 2025 })), "2025-05");
  assert.equal(canonicalSalaryPeriodKey(rec({ periodKey: "2026-05" })), "2026-05");
});

test("the record already holding a period is found, the record itself is not", () => {
  const matrix = rec({ id: "sal_e1_2026-05_2026" });
  const legacy = rec({ id: "sal_e1_M05_2025", periodKey: "M05", year: 2025 });
  const other = rec({ id: "sal_e2_2026-05_2026", employeeId: "e2" });
  const all = [matrix, legacy, other];
  assert.equal(salaryRecordForPeriod(all, "e1", "2026-05")?.id, "sal_e1_2026-05_2026");
  assert.equal(salaryRecordForPeriod(all, "e1", "2025-05")?.id, "sal_e1_M05_2025");
  assert.equal(salaryRecordForPeriod(all, "e1", "2026-05", "sal_e1_2026-05_2026"), undefined);
  assert.equal(salaryRecordForPeriod(all, "e1", "2024-05"), undefined);
});

test("a closed month stays closed when the status is no longer paid", () => {
  assert.equal(isPayrollPeriodClosed({ status: "partially_paid", closedAt: "2026-10-31 10:00:00" }), true);
  assert.equal(isPayrollPeriodClosed({ status: "paid", closedAt: null }), false);
  assert.equal(isPayrollPeriodClosed({ status: "paid" }), true);
  assert.equal(isPayrollPeriodClosed({ status: "pending" }), false);
});
