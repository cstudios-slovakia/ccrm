import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DEADLINE_WARNING_DAYS,
  DEFAULT_PROJECT_STATUS_DEFS,
  defaultProjectStatus,
  evaluateProjectDeadline,
  finishedAtForStatus,
  isClosedProjectStatus,
  normalizeDeadlineWarningDays,
  normalizeProjectStatusDefs,
  openProjectStatuses,
  projectDelayReason,
  projectDisplayName,
  projectMissedDeadline,
  projectNeedsDelayReason,
  projectPipelineSegments,
  projectStartDate,
  projectStatusBadgeStyle,
  projectStatusColor,
  projectStatusKeyFor,
  projectStatusLabel,
  projectStatusOptions,
  projectStatusOrder,
  type ProjectStatusDef,
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

/* ── project status ─────────────────────────────────────── */

const en = (e: string, _s: string, _h: string) => e;
const sk = (_e: string, s: string, _h: string) => s;

const BUILTINS = ["new", "active", "on_hold", "completed", "cancelled"];

/** An installation that renamed, added and regrouped. */
const CUSTOM: ProjectStatusDef[] = [
  { key: "new", label: "Inquiry", color: "#0ea5e9", group: "new" },
  { key: "active", color: "#a855f7", group: "in_progress" },
  { key: "waiting_for_client", label: "Waiting for client", color: "#f59e0b", group: "in_progress" },
  { key: "completed", color: "#10b981", group: "completed" },
  { key: "lost", label: "Lost", color: "#64748b", group: "cancelled" },
];

test("the built-ins come in pipeline order: open first, closed last", () => {
  assert.deepEqual(projectStatusOrder(), BUILTINS);
  assert.deepEqual(openProjectStatuses(), ["new", "active", "on_hold"]);
});

test("a new project starts on the first status of the New group", () => {
  assert.equal(defaultProjectStatus(), "new");
  // No New group left: the first open status takes over.
  assert.equal(defaultProjectStatus(CUSTOM.filter((d) => d.group !== "new")), "active");
});

test("every built-in is spoken and painted", () => {
  BUILTINS.forEach((s) => {
    assert.notEqual(projectStatusLabel(s, en), s, `${s} still reads as its raw key`);
    assert.notEqual(projectStatusColor(s), projectStatusColor("something-else"), `${s} falls through to the unknown colour`);
  });
  assert.equal(projectStatusLabel("new", sk), "Nový");
  assert.deepEqual(projectStatusBadgeStyle("completed"), {
    backgroundColor: "#10b98114",
    color: "#10b981",
    borderColor: "#10b98140",
  });
});

test("a renamed status reads by its new name in every language; the others stay translated", () => {
  assert.equal(projectStatusLabel("new", en, CUSTOM), "Inquiry");
  assert.equal(projectStatusLabel("new", sk, CUSTOM), "Inquiry");
  assert.equal(projectStatusLabel("active", sk, CUSTOM), "Aktívny");
  assert.equal(projectStatusLabel("waiting_for_client", en, CUSTOM), "Waiting for client");
});

test("an unrecognised status is shown as it is, not swallowed", () => {
  // A row written by something outside the app must stay visible rather than
  // quietly reading as "Active", which is what the old chained ternaries did.
  assert.equal(projectStatusLabel("archived", en), "archived");
  assert.equal(projectStatusLabel("", en), "");
  assert.equal(projectStatusLabel(undefined, en), "");
  // A deleted built-in still has its translation, so projects left on it read well.
  assert.equal(projectStatusLabel("on_hold", en, CUSTOM), "On Hold");
});

test("the dropdown offers every configured status, in order", () => {
  const options = projectStatusOptions(en);
  assert.deepEqual(options.map((o) => o.value), BUILTINS);
  assert.equal(options[0].label, "New");
  assert.deepEqual(
    projectStatusOptions(en, CUSTOM).map((o) => o.label),
    ["Inquiry", "Active", "Waiting for client", "Completed", "Lost"],
  );
});

test("closed means the completed and cancelled groups, whatever the key", () => {
  assert.equal(isClosedProjectStatus("completed"), true);
  assert.equal(isClosedProjectStatus("cancelled"), true);
  assert.equal(isClosedProjectStatus("active"), false);
  assert.equal(isClosedProjectStatus("lost", CUSTOM), true);
  assert.equal(isClosedProjectStatus("waiting_for_client", CUSTOM), false);
  assert.equal(isClosedProjectStatus("archived"), false);
});

test("normalizing a stored list", () => {
  // Nothing stored, or nothing usable: the built-ins.
  assert.deepEqual(normalizeProjectStatusDefs(null), DEFAULT_PROJECT_STATUS_DEFS);
  assert.deepEqual(normalizeProjectStatusDefs("junk"), DEFAULT_PROJECT_STATUS_DEFS);
  assert.deepEqual(normalizeProjectStatusDefs([]), DEFAULT_PROJECT_STATUS_DEFS);
  // Only closed statuses would leave a new project nowhere to start.
  assert.deepEqual(
    normalizeProjectStatusDefs([{ key: "done", color: "#000000", group: "completed" }]),
    DEFAULT_PROJECT_STATUS_DEFS,
  );
  // Duplicates and blank keys dropped, a bad colour or group repaired, group order restored.
  assert.deepEqual(
    normalizeProjectStatusDefs([
      { key: "done", color: "#ABCDEF", group: "completed" },
      { key: "new", color: "nope", group: "bogus" },
      { key: "new", color: "#111111", group: "new" },
      { key: " ", color: "#111111", group: "new" },
      { key: "review", label: "  Review ", color: "#222222", group: "in_progress" },
    ]),
    [
      { key: "new", color: "#0ea5e9", group: "new" },
      { key: "review", label: "Review", color: "#222222", group: "in_progress" },
      { key: "done", color: "#abcdef", group: "completed" },
    ],
  );
});

test("a new status gets a stable ASCII key, unique against those taken", () => {
  assert.equal(projectStatusKeyFor("Čaká na klienta", []), "caka_na_klienta");
  assert.equal(projectStatusKeyFor("On hold", BUILTINS), "on_hold_2");
  assert.equal(projectStatusKeyFor("On hold", [...BUILTINS, "on_hold_2"]), "on_hold_3");
  assert.equal(projectStatusKeyFor("!!!", []), "status");
});

/* ── project pipeline strip ─────────────────────────────── */

const lit = (status: string | undefined) =>
  projectPipelineSegments(status, en).map((s) => s.filled);

test("the pipeline has a step per open status and one closing step", () => {
  const segments = projectPipelineSegments("new", en);
  assert.deepEqual(segments.map((s) => s.key), ["new", "active", "on_hold", "closed"]);
  assert.equal(segments[3].title, "Completed / Cancelled");
});

test("the pipeline lights every step up to the current one", () => {
  assert.deepEqual(lit("new"), [true, false, false, false]);
  assert.deepEqual(lit("active"), [true, true, false, false]);
  assert.deepEqual(lit("on_hold"), [true, true, true, false]);
});

test("a closed project lights every step, the last in its own outcome's colour", () => {
  assert.deepEqual(lit("completed"), [true, true, true, true]);
  assert.deepEqual(lit("cancelled"), [true, true, true, true]);
  assert.equal(projectPipelineSegments("completed", en)[3].color, "#10b981");
  assert.equal(projectPipelineSegments("cancelled", en)[3].color, "#f43f5e");
  assert.match(projectPipelineSegments("cancelled", en)[3].tooltip, /Cancelled/);
});

test("the pipeline follows the configured list", () => {
  const segments = projectPipelineSegments("waiting_for_client", en, CUSTOM);
  assert.deepEqual(segments.map((s) => s.key), ["new", "active", "waiting_for_client", "closed"]);
  assert.equal(segments[3].title, "Completed / Lost");
  assert.deepEqual(segments.map((s) => s.filled), [true, true, true, false]);
  assert.equal(segments[2].color, "#f59e0b");
});

test("an unknown status lights no step", () => {
  assert.deepEqual(lit("archived"), [false, false, false, false]);
  assert.deepEqual(lit(undefined), [false, false, false, false]);
  assert.ok(projectPipelineSegments("archived", en).every((s) => s.colorClass === "bg-slate-300"));
});

test("a real finish date outranks the deadline and ends the countdown", () => {
  const late = evaluateProjectDeadline(project({ deadline: "2026-08-20", finishedAt: "2026-08-25" }), type(), TODAY);
  assert.equal(late?.tone, "finished");
  assert.equal(late?.deadline, "2026-08-25");
  assert.equal(late?.plannedDeadline, "2026-08-20");
  assert.equal(late?.finishedLateDays, 5);
  assert.equal(late?.isOverdue, false);
  // Finished late is not "currently overdue" (the list's live countdown), but
  // it still missed the plan and still owes a reason.
  assert.equal(projectMissedDeadline(late), true);
  assert.equal(projectNeedsDelayReason(project({ deadline: "2026-08-20" }), late), true);

  const early = evaluateProjectDeadline(project({ deadline: "2026-09-30", finishedAt: "2026-09-01" }), type(), TODAY);
  assert.equal(early?.finishedLateDays, 0);
  assert.equal(projectMissedDeadline(early), false);
  assert.equal(projectNeedsDelayReason(project({ deadline: "2026-09-30" }), early), false);

  // A finish date with no planned deadline still has something to show.
  const unplanned = evaluateProjectDeadline(project({ deadline: null, finishedAt: "2026-09-01" }), type(), TODAY);
  assert.equal(unplanned?.deadline, "2026-09-01");
  assert.equal(unplanned?.plannedDeadline, "");

  // Still gated by the type.
  assert.equal(evaluateProjectDeadline(project({ finishedAt: "2026-09-01" }), type({ hasDeadline: false }), TODAY), null);
});

test("completing a project stamps today as its finish date, reopening clears it", () => {
  assert.equal(finishedAtForStatus("completed", "", TODAY), TODAY);
  assert.equal(finishedAtForStatus("completed", null, TODAY), TODAY);
  // A date set by hand is never overwritten.
  assert.equal(finishedAtForStatus("completed", "2026-08-30", TODAY), "2026-08-30");
  assert.equal(finishedAtForStatus("cancelled", "2026-08-30", TODAY), "2026-08-30");
  assert.equal(finishedAtForStatus("cancelled", "", TODAY), "");
  for (const open of ["new", "active", "on_hold"]) {
    assert.equal(finishedAtForStatus(open, "2026-08-30", TODAY), "", open);
  }
  // Asked by group: an added status behaves like the built-in it sits with.
  assert.equal(finishedAtForStatus("lost", "2026-08-30", TODAY, CUSTOM), "2026-08-30");
  assert.equal(finishedAtForStatus("lost", "", TODAY, CUSTOM), "");
  assert.equal(finishedAtForStatus("waiting_for_client", "2026-08-30", TODAY, CUSTOM), "");
});

test("a project in an added closed status is never late", () => {
  const late = project({ deadline: "2026-08-20", status: "lost" });
  assert.equal(evaluateProjectDeadline(late, type(), TODAY, CUSTOM)?.tone, "closed");
  // Without the list that defines it, "lost" is unknown — and so still open.
  assert.equal(evaluateProjectDeadline(late, type(), TODAY)?.tone, "overdue");
});

test("the start date falls back to the creation day", () => {
  assert.equal(projectStartDate(project({ startDate: "2026-07-01", createdAt: "2026-06-15 10:22:00" })), "2026-07-01");
  assert.equal(projectStartDate(project({ startDate: null, createdAt: "2026-06-15 10:22:00" })), "2026-06-15");
  assert.equal(projectStartDate(project()), "");
});

test("a late project owes a reason, and only a late one", () => {
  const late = project({ deadline: "2026-08-20" });
  const lateDl = evaluateProjectDeadline(late, type(), TODAY);
  assert.equal(lateDl?.isOverdue, true);
  assert.equal(projectNeedsDelayReason(late, lateDl), true);

  // Explained — the flag goes out.
  const explained = project({ deadline: "2026-08-20", delayReason: "  waiting on the client  " });
  assert.equal(projectDelayReason(explained), "waiting on the client");
  assert.equal(projectNeedsDelayReason(explained, lateDl), false);

  // Whitespace is not an explanation.
  assert.equal(projectNeedsDelayReason(project({ delayReason: "   " }), lateDl), true);

  // Still on time, no deadline at all, or already closed: nothing to explain.
  const onTime = project({ deadline: "2026-12-01" });
  assert.equal(projectNeedsDelayReason(onTime, evaluateProjectDeadline(onTime, type(), TODAY)), false);
  assert.equal(projectNeedsDelayReason(late, evaluateProjectDeadline(late, type({ hasDeadline: false }), TODAY)), false);
  const closed = project({ deadline: "2026-08-20", status: "completed" });
  assert.equal(projectNeedsDelayReason(closed, evaluateProjectDeadline(closed, type(), TODAY)), false);

  // A real finish after the planned date is the same debt — filling in actual
  // dates must not hide the reason field the open overdue state already showed.
  const finishedLate = project({ deadline: "2026-08-20", finishedAt: "2026-08-25" });
  const finishedLateDl = evaluateProjectDeadline(finishedLate, type(), TODAY);
  assert.equal(projectMissedDeadline(finishedLateDl), true);
  assert.equal(projectNeedsDelayReason(finishedLate, finishedLateDl), true);
  assert.equal(
    projectNeedsDelayReason({ ...finishedLate, delayReason: "supplier delay" }, finishedLateDl),
    false,
  );
});

test("a missing delay reason reads as empty, never as \"null\"", () => {
  assert.equal(projectDelayReason(project()), "");
  assert.equal(projectDelayReason(project({ delayReason: null })), "");
  assert.equal(projectDelayReason(undefined), "");
});

test("project archived state defaults to falsy and preserves boolean value", () => {
  const p = project();
  assert.equal(Boolean(p.archived), false);
  const pArchived = project({ archived: true });
  assert.equal(pArchived.archived, true);
});
