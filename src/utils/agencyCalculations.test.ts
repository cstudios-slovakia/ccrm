import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateShiftTotals,
  computePaymentTotals,
  getComplianceExpiryState,
  summarizeWorkerCompliance,
} from "./agencyCalculations.ts";
import { DEFAULT_AGENCY_SETTINGS, type AgencyPlacement, type AgencyShift, type AgencyWorkerChecklistItem } from "../types/agency.ts";

test("getComplianceExpiryState classifies missing/ok/expiring/expired accurately", () => {
  assert.equal(getComplianceExpiryState(null, "2026-11-13"), "ok");
  assert.equal(getComplianceExpiryState("2026-11-10", "2026-11-13"), "expired");
  assert.equal(getComplianceExpiryState("2026-12-01", "2026-11-13", 30), "expiring");
  assert.equal(getComplianceExpiryState("2027-06-01", "2026-11-13", 30), "ok");
});

test("summarizeWorkerCompliance aggregates expired, expiring soon, missing and verified items", () => {
  const items: AgencyWorkerChecklistItem[] = [
    { id: "1", workerId: "w1", itemKey: "passport", label: "Passport", status: "verified", expiresAt: "2027-08-01", note: "", fileId: null, sortOrder: 0 },
    { id: "2", workerId: "w1", itemKey: "medical", label: "Medical", status: "verified", expiresAt: "2026-11-25", note: "", fileId: null, sortOrder: 1 },
    { id: "3", workerId: "w1", itemKey: "bozp", label: "BOZP", status: "missing", expiresAt: null, note: "", fileId: null, sortOrder: 2 },
  ];
  const sum = summarizeWorkerCompliance(items, "2026-11-13");
  assert.equal(sum.total, 3);
  assert.equal(sum.verified, 2);
  assert.equal(sum.expiringSoon, 1);
  assert.equal(sum.missing, 1);
  assert.equal(sum.worstState, "expiring");

  items[0].expiresAt = "2026-11-01";
  assert.equal(summarizeWorkerCompliance(items, "2026-11-13").worstState, "expired");
});

test("calculateShiftTotals counts regular, overtime, shift multipliers, holidays, and sick leave", () => {
  const placements: AgencyPlacement[] = [
    {
      id: "pl-1",
      workerId: "w1",
      companyClientId: "c1",
      workplaceId: null,
      contactLeadId: null,
      jobRole: "Operator",
      status: "active",
      startDate: "2026-11-01",
      endDate: null,
      payRate: 8,
      payRateType: "hourly",
      billRate: 14,
      billRateType: "hourly",
      currency: "EUR",
      notes: "",
    },
  ];
  const shifts: AgencyShift[] = [
    {
      id: "s1",
      workerId: "w1",
      placementId: "pl-1",
      companyClientId: "c1",
      workplaceId: null,
      workDate: "2026-11-02",
      shiftTemplateId: "morning", // 1.0x
      shiftLabel: "R",
      startTime: "06:00",
      endTime: "14:00",
      hours: 8,
      overtimeHours: 2,
      status: "worked",
      sickNote: "",
      notes: "",
    },
    {
      id: "s2",
      workerId: "w1",
      placementId: "pl-1",
      companyClientId: "c1",
      workplaceId: null,
      workDate: "2026-11-03",
      shiftTemplateId: "night", // 1.25x
      shiftLabel: "N",
      startTime: "22:00",
      endTime: "06:00",
      hours: 8,
      overtimeHours: 0,
      status: "worked",
      sickNote: "",
      notes: "",
    },
    {
      id: "s3",
      workerId: "w1",
      placementId: "pl-1",
      companyClientId: "c1",
      workplaceId: null,
      workDate: "2026-11-04",
      shiftTemplateId: null,
      shiftLabel: "PN",
      startTime: "",
      endTime: "",
      hours: 0,
      overtimeHours: 0,
      status: "sick",
      sickNote: "Flu",
      notes: "",
    },
    {
      id: "s4",
      workerId: "w1",
      placementId: "pl-1",
      companyClientId: "c1",
      workplaceId: null,
      workDate: "2026-11-17",
      shiftTemplateId: "morning",
      shiftLabel: "H",
      startTime: "06:00",
      endTime: "14:00",
      hours: 8,
      overtimeHours: 0,
      status: "holiday", // holidayMultiplier 1.5
      sickNote: "",
      notes: "",
    },
  ];
  const res = calculateShiftTotals(
    shifts,
    { defaultPayRate: 7, defaultBillRate: 12 },
    placements,
    DEFAULT_AGENCY_SETTINGS
  );
  // Regular hours: 8 + 8 + 8 = 24; OT = 2; Sick days = 1
  // Base pay: s1 = 8*8*1 + 2*8*1.25 = 64 + 20 = 84; s2 = 8*8*1.25 = 80; s4 = 8*8*1.5 = 96 -> 260
  // Billable: s1 = 8*14*1 + 2*14*1.25 = 112 + 35 = 147; s2 = 8*14*1.25 = 140; s4 = 8*14*1.5 = 168 -> 455
  assert.equal(res.regularHours, 24);
  assert.equal(res.overtimeHours, 2);
  assert.equal(res.sickDays, 1);
  assert.equal(res.basePay, 260);
  assert.equal(res.billableTotal, 455);
  assert.equal(res.marginAmount, 195);
});

test("computePaymentTotals calculates net pay, deductions, and margin percentage", () => {
  const out = computePaymentTotals(
    800,
    [
      { id: "i1", kind: "earning", label: "Attendance Bonus", amount: 100 },
      { id: "i2", kind: "deduction", label: "Accommodation", amount: 150 },
    ],
    1400
  );
  assert.equal(out.extraEarnings, 100);
  assert.equal(out.deductionsTotal, 150);
  assert.equal(out.grossPay, 900);
  assert.equal(out.netPay, 750);
  assert.equal(out.marginAmount, 650);
  assert.equal(out.marginPct, 46.4);
});
