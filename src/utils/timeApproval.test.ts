import test from "node:test";
import assert from "node:assert/strict";
import { approvalWeekStart, weekApprovalState } from "./timeApproval.ts";

const week = "2026-10-26"; // Monday

test("the approval week starts on Monday", () => {
  assert.equal(approvalWeekStart("2026-10-26"), "2026-10-26");
  assert.equal(approvalWeekStart("2026-10-28"), "2026-10-26");
  assert.equal(approvalWeekStart("2026-11-01"), "2026-10-26");
});

test("week approval is off when the setting is off, even if entries are approved", () => {
  const state = weekApprovalState({
    weekStart: week,
    weeklyApproval: false,
    userId: "u1",
    entries: [{ entryDate: "2026-10-26", userId: "u1", approvalStatus: "approved" }],
  });
  assert.equal(state.status, "off");
  assert.equal(state.canSubmit, false);
  assert.equal(state.enabled, false);
});

test("an open week can be submitted, and a fully approved week cannot", () => {
  const entries = [
    { entryDate: "2026-10-26", userId: "u1", approvalStatus: null },
    { entryDate: "2026-10-27", userId: "u1", approvalStatus: "approved" },
    { entryDate: "2026-11-02", userId: "u1", approvalStatus: null },
  ];
  const open = weekApprovalState({ weekStart: "2026-10-27", weeklyApproval: true, userId: "u1", entries });
  assert.equal(open.status, "open");
  assert.equal(open.entryCount, 2);
  assert.equal(open.approvedCount, 1);
  assert.equal(open.canSubmit, true);
  assert.equal(open.weekStart, "2026-10-26");
  assert.equal(open.weekEnd, "2026-11-01");

  const done = weekApprovalState({
    weekStart: week,
    weeklyApproval: true,
    userId: "u1",
    entries: [{ entryDate: "2026-10-26", userId: "u1", approvalStatus: "approved" }],
  });
  assert.equal(done.status, "approved");
  assert.equal(done.canSubmit, false);
});

test("another person's entries and a running timer are not part of the week", () => {
  const state = weekApprovalState({
    weekStart: week,
    weeklyApproval: true,
    userId: "u1",
    entries: [
      { entryDate: "2026-10-26", userId: "u2", approvalStatus: null },
      { entryDate: "2026-10-26", userId: "u1", approvalStatus: null, running: true },
    ],
  });
  assert.equal(state.status, "empty");
  assert.equal(state.canSubmit, false);
});
