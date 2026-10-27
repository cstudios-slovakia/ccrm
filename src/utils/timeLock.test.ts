import test from "node:test";
import assert from "node:assert/strict";
import { isEntryLocked, lockReason, paidMonthsForOwner, type LockSettings } from "./timeLock.ts";

const now = "2026-10-27";
const base: LockSettings = { lockAfterDays: 14, paidPayrollMonths: [], isAdmin: false };

test("an entry older than lockAfterDays is locked for age", () => {
  const old = { entryDate: "2026-10-01", approvalStatus: null };
  assert.equal(lockReason(old, base, now), "age");
  assert.equal(isEntryLocked(old, base, now), true);
});

test("an entry exactly lockAfterDays old is still editable", () => {
  const edge = { entryDate: "2026-10-13", approvalStatus: null };
  assert.equal(lockReason(edge, base, now), null);
  assert.equal(isEntryLocked(edge, base, now), false);
});

test("a null lockAfterDays turns the age rule off", () => {
  const old = { entryDate: "2020-01-01", approvalStatus: null };
  assert.equal(lockReason(old, { ...base, lockAfterDays: null }, now), null);
});

test("a running timer is not locked by age", () => {
  const running = { entryDate: "2026-10-01", approvalStatus: null, running: true };
  assert.equal(lockReason(running, base, now), null);
});

test("a paid payroll month locks the entry", () => {
  const row = { entryDate: "2026-05-04", approvalStatus: null };
  const settings: LockSettings = { ...base, lockAfterDays: null, paidPayrollMonths: ["2026-05"] };
  assert.equal(lockReason(row, settings, now), "paid_payroll");
  assert.equal(isEntryLocked(row, settings, now), true);
  assert.equal(lockReason(row, { ...settings, paidPayrollMonths: ["2026-06"] }, now), null);
});

test("an approved entry is locked", () => {
  const row = { entryDate: "2026-10-26", approvalStatus: "approved" };
  assert.equal(lockReason(row, { ...base, lockAfterDays: null }, now), "approved");
  assert.equal(isEntryLocked(row, base, now), true);
});

test("an admin bypasses every lock, and the reason is still named", () => {
  const row = { entryDate: "2026-10-01", approvalStatus: "Approved" };
  const settings: LockSettings = { ...base, isAdmin: true, paidPayrollMonths: ["2026-10"] };
  assert.equal(lockReason(row, settings, now), "age");
  assert.equal(isEntryLocked(row, settings, now), false);
});

test("a paid salary month locks that owner's entries and an unpaid month does not", () => {
  const salaries = [
    { employeeId: "e1", periodKey: "2026-05", status: "paid" },
    { employeeId: "e1", periodKey: "2026-06", status: "pending" },
    { employeeId: "e1", periodKey: "2026-07", status: "partially_paid" },
    { employeeId: "e2", periodKey: "2026-05", status: "paid" },
  ];
  const employees = [{ id: "e1", userId: "u1" }];
  const keys = paidMonthsForOwner(salaries, employees, { userId: "u1" });
  assert.deepEqual(keys, ["2026-05"]);
  const settings: LockSettings = { lockAfterDays: null, paidPayrollMonths: keys, isAdmin: false };
  const may = { entryDate: "2026-05-04", approvalStatus: null };
  const june = { entryDate: "2026-06-02", approvalStatus: null };
  assert.equal(lockReason(may, settings, now), "paid_payroll");
  assert.equal(isEntryLocked(may, settings, now), true);
  assert.equal(isEntryLocked(june, settings, now), false);
  assert.equal(isEntryLocked(may, { ...settings, isAdmin: true }, now), false);
  assert.equal(lockReason(may, { ...settings, isAdmin: true }, now), "paid_payroll");
});

test("a month stamped on an entry counts when the salary list is missing", () => {
  const keys = paidMonthsForOwner(undefined, [], { userId: "u1", employeeId: "e1" }, ["2026-05"]);
  assert.deepEqual(keys, ["2026-05"]);
  const settings: LockSettings = { lockAfterDays: null, paidPayrollMonths: keys, isAdmin: false };
  assert.equal(isEntryLocked({ entryDate: "2026-05-20", approvalStatus: null }, settings, now), true);
  assert.equal(isEntryLocked({ entryDate: "2026-08-01", approvalStatus: null }, settings, now), false);
});
