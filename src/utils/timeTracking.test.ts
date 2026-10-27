import test from "node:test";
import assert from "node:assert/strict";
import {
  billablePercent,
  collapseIdentical,
  dayDot,
  elapsedSeconds,
  formatDuration,
  groupByDay,
  needsLinkConfirmation,
  parseDurationInput,
  projectColor,
  targetSeconds,
  totalCost,
  totalSeconds,
  weekDays,
  weekStart,
  type TimeEntry,
} from "./timeTracking.ts";
import { builtinHolidays, makeHolidayCalendar } from "./holidays.ts";

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: "te-1",
  userId: "u1",
  recordedByUserId: "u1",
  employeeId: null,
  projectId: "p1",
  taskId: null,
  ticketId: null,
  title: "Work",
  titleSource: "entry",
  titleDeleted: false,
  description: "Work",
  legacyNote: null,
  entryDate: "2026-10-26",
  startAt: null,
  endAt: null,
  durationSec: 3600,
  running: false,
  billable: true,
  tags: [],
  source: "manual",
  originType: null,
  originId: null,
  approvalStatus: null,
  createdAt: "2026-10-26 09:00:00",
  ...over,
});

test("durations format as h:mm and h:mm:ss", () => {
  assert.equal(formatDuration(8100), "2:15");
  assert.equal(formatDuration(8100, true), "2:15:00");
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(null), "0:00");
  assert.equal(formatDuration(36000 + 5), "10:00");
  assert.equal(formatDuration(-30), "0:00");
});

test("the hours field accepts 1.5, 1,5, 1:30, 90m, 2h, 2h30m", () => {
  assert.equal(parseDurationInput("1.5"), 5400);
  assert.equal(parseDurationInput("1,5"), 5400);
  assert.equal(parseDurationInput("1:30"), 5400);
  assert.equal(parseDurationInput("90m"), 5400);
  assert.equal(parseDurationInput("2h"), 7200);
  assert.equal(parseDurationInput("2h 30m"), 9000);
  assert.equal(parseDurationInput("45min"), 2700);
  assert.equal(parseDurationInput("2"), 7200);
  assert.equal(parseDurationInput("0:45"), 2700);
});

test("the hours field rejects nonsense, zero and more than a day", () => {
  for (const bad of ["", "abc", "0", "0:00", "25", "1:99", "-2", "1.2.3", "m"]) {
    assert.equal(parseDurationInput(bad), null, bad);
  }
});

test("elapsed time is now minus start, never a tick count", () => {
  const start = "2026-10-26T08:00:00Z";
  assert.equal(elapsedSeconds(start, Date.parse("2026-10-26T09:12:30Z")), 4350);
  assert.equal(elapsedSeconds(start, Date.parse("2026-10-26T07:00:00Z")), 0);
  assert.equal(elapsedSeconds(null, Date.now()), 0);
});

test("a running entry counts its elapsed time in the totals", () => {
  const now = Date.parse("2026-10-26T09:00:00Z");
  const running = entry({ id: "r", running: true, startAt: "2026-10-26T08:30:00Z", durationSec: null });
  assert.equal(totalSeconds([entry(), running], now), 3600 + 1800);
});

test("weeks run Monday to Sunday", () => {
  assert.equal(weekStart("2026-10-26"), "2026-10-26"); // Monday
  assert.equal(weekStart("2026-11-01"), "2026-10-26"); // Sunday
  assert.equal(weekStart("2026-10-28"), "2026-10-26");
  assert.deepEqual(weekDays("2026-10-28"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
});

test("the weekly target excludes holidays: the week of 23 Oct 2026 is 4 working days in Hungary, 5 in Slovakia", () => {
  const week = weekDays("2026-10-19"); // Mon 19 Oct .. Sun 25 Oct; 23 Oct is a Friday
  const hu = makeHolidayCalendar("HU", builtinHolidays("HU", 2026));
  const sk = makeHolidayCalendar("SK", builtinHolidays("SK", 2026));
  assert.equal(targetSeconds(hu, week, 8), 4 * 8 * 3600);
  assert.equal(targetSeconds(sk, week, 8), 5 * 8 * 3600);
});

test("the day dot: grey with nothing, amber under target, emerald at target", () => {
  assert.equal(dayDot(0, 28800), "empty");
  assert.equal(dayDot(3600, 28800), "short");
  assert.equal(dayDot(28800, 28800), "met");
  assert.equal(dayDot(30000, 28800), "met");
  assert.equal(dayDot(3600, 0), "short"); // a holiday with something logged is not "met"
});

test("billable share rounds to a whole percent; null with no time", () => {
  assert.equal(billablePercent([], 0), null);
  assert.equal(billablePercent([entry({ durationSec: 3600 }), entry({ billable: false, durationSec: 7200 })], 0), 33);
});

test("cost totals only what the viewer may see", () => {
  assert.equal(totalCost([entry(), entry()]), null);
  assert.equal(totalCost([entry({ cost: 24.58 }), entry({ cost: 1.01 }), entry()]), 25.59);
});

test("days group their entries, running first then newest first", () => {
  const a = entry({ id: "a", startAt: "2026-10-26T08:00:00Z" });
  const b = entry({ id: "b", startAt: "2026-10-26T10:00:00Z" });
  const r = entry({ id: "r", running: true, startAt: "2026-10-26T06:00:00Z", durationSec: null });
  const other = entry({ id: "o", entryDate: "2026-10-25" });
  const g = groupByDay([a, b, r, other]);
  assert.deepEqual(g.get("2026-10-26")!.map((e) => e.id), ["r", "b", "a"]);
  assert.deepEqual([...g.keys()].sort(), ["2026-10-25", "2026-10-26"]);
});

test("identical consecutive entries collapse into one row with a count", () => {
  const rows = collapseIdentical([entry({ id: "1" }), entry({ id: "2" }), entry({ id: "3", title: "Other", description: "Other" }), entry({ id: "4" })]);
  assert.deepEqual(rows.map((r) => [r.entry.id, r.members.length]), [["1", 2], ["3", 1], ["4", 1]]);
});

test("a project keeps one colour from a fixed palette of eight", () => {
  assert.equal(projectColor("proj-1"), projectColor("proj-1"));
  const colours = new Set(Array.from({ length: 200 }, (_, i) => projectColor(`proj-${i}`)));
  assert.ok(colours.size <= 8 && colours.size >= 6);
  assert.equal(projectColor(null), "#94a3b8");
});

test("linking an entry that has its own different text asks first", () => {
  assert.equal(needsLinkConfirmation("", "Write the offer"), false);
  assert.equal(needsLinkConfirmation(null, "Write the offer"), false);
  assert.equal(needsLinkConfirmation("write the offer", "Write the offer"), false);
  assert.equal(needsLinkConfirmation("Calls", "Write the offer"), true);
});
