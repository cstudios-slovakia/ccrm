import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DEADLINE_WARNING_DAYS,
  evaluateProjectDeadline,
  normalizeDeadlineWarningDays,
  projectDisplayName,
} from "./projects.ts";
import type { Lead, Project, ProjectType } from "../types/index.ts";

const TODAY = "2026-09-03";

const type = (over: Partial<ProjectType> = {}): ProjectType =>
  ({
    id: "pt-roof",
    name: "Strecha",
    description: "",
    icon: "Home",
    color: "#a855f7",
    attributes: [],
    hasTimeline: false,
    hasGantt: false,
    hasDeadline: true,
    deadlineWarningDays: 7,
    ...over,
  }) as ProjectType;

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: "proj-1",
    projectTypeId: "pt-roof",
    leadId: null,
    clientId: null,
    status: "active",
    managers: [],
    data: {},
    timeline: [],
    gantt: [],
    ...over,
  }) as Project;

const LEADS: Pick<Lead, "id" | "name">[] = [
  { id: "l1", name: "Novák Ján" },
  { id: "l2", name: "  " },
];

test("normalizeDeadlineWarningDays keeps positive whole days and clamps the rest", () => {
  assert.equal(normalizeDeadlineWarningDays(7), 7);
  assert.equal(normalizeDeadlineWarningDays("14"), 14);
  assert.equal(normalizeDeadlineWarningDays(3.9), 3);
  assert.equal(normalizeDeadlineWarningDays(5000), 365);
  assert.equal(DEFAULT_DEADLINE_WARNING_DAYS, 7);
});

test("normalizeDeadlineWarningDays reads every kind of nothing as 'only once late'", () => {
  assert.equal(normalizeDeadlineWarningDays(0), 0);
  assert.equal(normalizeDeadlineWarningDays(-4), 0);
  assert.equal(normalizeDeadlineWarningDays(""), 0);
  assert.equal(normalizeDeadlineWarningDays(null), 0);
  assert.equal(normalizeDeadlineWarningDays(undefined), 0);
  assert.equal(normalizeDeadlineWarningDays("soon"), 0);
});

test("a type that is not time-boxed has no deadline, whatever the project says", () => {
  const t = type({ hasDeadline: false });
  assert.equal(evaluateProjectDeadline(project({ deadline: "2026-09-30" }), t, TODAY), null);
});

test("no date, an unreadable date, or no type yields nothing to render", () => {
  assert.equal(evaluateProjectDeadline(project({ deadline: null }), type(), TODAY), null);
  assert.equal(evaluateProjectDeadline(project({ deadline: "" }), type(), TODAY), null);
  assert.equal(evaluateProjectDeadline(project({ deadline: "30. 9. 2026" }), type(), TODAY), null);
  assert.equal(evaluateProjectDeadline(project({ deadline: "2026-09-30" }), undefined, TODAY), null);
  assert.equal(evaluateProjectDeadline(project({ deadline: "2026-09-30" }), type(), "not a date"), null);
});

test("a deadline comfortably ahead reads as ok", () => {
  const s = evaluateProjectDeadline(project({ deadline: "2026-11-30" }), type(), TODAY);
  assert.equal(s?.daysLeft, 88);
  assert.equal(s?.overdueDays, 0);
  assert.equal(s?.tone, "ok");
  assert.equal(s?.isDueSoon, false);
  assert.equal(s?.isOverdue, false);
});

test("the warning window is inclusive on both ends and the day before it is not", () => {
  const inside = evaluateProjectDeadline(project({ deadline: "2026-09-10" }), type(), TODAY);
  assert.equal(inside?.daysLeft, 7);
  assert.equal(inside?.tone, "soon");

  const outside = evaluateProjectDeadline(project({ deadline: "2026-09-11" }), type(), TODAY);
  assert.equal(outside?.daysLeft, 8);
  assert.equal(outside?.tone, "ok");

  // Due today is still "soon", not yet late.
  const dueToday = evaluateProjectDeadline(project({ deadline: TODAY }), type(), TODAY);
  assert.equal(dueToday?.daysLeft, 0);
  assert.equal(dueToday?.tone, "soon");
  assert.equal(dueToday?.isOverdue, false);
});

test("a warning window of zero flags nothing until the deadline has passed", () => {
  const t = type({ deadlineWarningDays: 0 });
  assert.equal(evaluateProjectDeadline(project({ deadline: "2026-09-04" }), t, TODAY)?.tone, "ok");
  assert.equal(evaluateProjectDeadline(project({ deadline: TODAY }), t, TODAY)?.tone, "ok");
  assert.equal(evaluateProjectDeadline(project({ deadline: "2026-09-02" }), t, TODAY)?.tone, "overdue");
});

test("a passed deadline counts the days it is late by", () => {
  const s = evaluateProjectDeadline(project({ deadline: "2026-08-27" }), type(), TODAY);
  assert.equal(s?.daysLeft, -7);
  assert.equal(s?.overdueDays, 7);
  assert.equal(s?.tone, "overdue");
  assert.equal(s?.isOverdue, true);
  assert.equal(s?.isDueSoon, false);
});

test("a finished or abandoned project is never late", () => {
  const late = { deadline: "2026-08-01" };
  for (const status of ["completed", "cancelled"]) {
    const s = evaluateProjectDeadline(project({ ...late, status }), type(), TODAY);
    assert.equal(s?.tone, "closed", status);
    assert.equal(s?.isOverdue, false, status);
    // The arithmetic is still reported — the date and the gap are worth showing.
    assert.equal(s?.overdueDays, 33, status);
  }
  assert.equal(evaluateProjectDeadline(project({ ...late, status: "on_hold" }), type(), TODAY)?.tone, "overdue");
});

test("a deadline carrying a time is read as the calendar day", () => {
  const s = evaluateProjectDeadline(project({ deadline: "2026-09-10 16:30" }), type(), TODAY);
  assert.equal(s?.deadline, "2026-09-10");
  assert.equal(s?.daysLeft, 7);
});

test("projectDisplayName prefers the project's own name", () => {
  assert.equal(
    projectDisplayName(project({ name: "Rekonštrukcia strechy", leadId: "l1" }), LEADS, "New project"),
    "Rekonštrukcia strechy",
  );
});

test("projectDisplayName falls back to the paired lead, then to the caller's label", () => {
  assert.equal(projectDisplayName(project({ leadId: "l1" }), LEADS, "New project"), "Novák Ján");
  assert.equal(projectDisplayName(project({ name: "   ", leadId: "l1" }), LEADS, "New project"), "Novák Ján");
  // Paired with a lead that has no usable name, paired with nobody, or paired
  // with a lead that no longer exists — all land on the caller's label.
  assert.equal(projectDisplayName(project({ leadId: "l2" }), LEADS, "New project"), "New project");
  assert.equal(projectDisplayName(project({ leadId: null }), LEADS, "New project"), "New project");
  assert.equal(projectDisplayName(project({ leadId: "gone" }), LEADS, "New project"), "New project");
  assert.equal(projectDisplayName(undefined, LEADS, "New project"), "New project");
});
