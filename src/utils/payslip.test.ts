import assert from "node:assert/strict";
import test from "node:test";
import {
  employeeDeductions,
  employerLevies,
  hasPayslip,
  parsePayslipAmount,
  salaryDue,
  salaryStatus,
} from "./payslip.ts";

test("only employees have a payslip; a missing kind counts as an employee", () => {
  assert.equal(hasPayslip({ kind: "employee" }), true);
  assert.equal(hasPayslip({}), true);
  assert.equal(hasPayslip({ kind: "contractor" }), false);
  assert.equal(hasPayslip({ kind: "ledger" }), false);
  assert.equal(hasPayslip(null), true);
});

test("employer levies are labour cost minus gross; employee deductions are gross minus net pay", () => {
  // 5100 cost, 4200 gross, 3100 net: 900 on the employer's side, 1100 on the employee's
  assert.equal(employerLevies(5100, 4200), 900);
  assert.equal(employeeDeductions(4200, 3100), 1100);
  assert.equal(employerLevies(0.3, 0.1), 0.2);
});

test("levies and deductions stay empty until the payslip figure is filled in", () => {
  assert.equal(employerLevies(null, 4200), null);
  assert.equal(employeeDeductions(4200, undefined), null);
  assert.equal(employerLevies(Number.NaN, 4200), null);
});

test("a record is paid against Cena práce, or the gross until Cena práce is known", () => {
  assert.equal(salaryDue({ totalSalary: 4200, laborCost: 5100 }), 5100);
  assert.equal(salaryDue({ totalSalary: 4200, laborCost: null }), 4200);
  assert.equal(salaryDue({ totalSalary: 4200 }), 4200);
  assert.equal(salaryDue(null), 0);
});

test("status compares Vyplatené with what is due", () => {
  assert.equal(salaryStatus(5100, 5100), "paid");
  assert.equal(salaryStatus(5100, 6000), "paid");
  assert.equal(salaryStatus(5100, 3100), "partially_paid");
  assert.equal(salaryStatus(5100, 0), "pending");
  assert.equal(salaryStatus(0, 0), "pending");
  assert.equal(salaryStatus(0, 10), "partially_paid");
});

test("an emptied input is 'not filled in', not zero", () => {
  assert.equal(parsePayslipAmount(""), null);
  assert.equal(parsePayslipAmount("   "), null);
  assert.equal(parsePayslipAmount("0"), 0);
  assert.equal(parsePayslipAmount("1520,40"), 1520.4);
  assert.equal(parsePayslipAmount("abc"), null);
});
