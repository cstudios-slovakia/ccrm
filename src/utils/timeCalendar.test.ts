import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ZOOM,
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  VISIBLE_END_MIN,
  VISIBLE_START_MIN,
  calendarDayLocked,
  countryForScope,
  createSpan,
  defaultClickSpan,
  dragAllowed,
  durationSecFromUtc,
  entryDurationSec,
  fitSpanDuration,
  formatMinute,
  instantFromLocal,
  instantsForSpan,
  isUntimed,
  layoutDay,
  layoutOverlaps,
  minuteFromFraction,
  monthGrid,
  moveRunningStart,
  moveSpan,
  normalizeSpanDay,
  nowPosition,
  plusDays,
  resizeAllowed,
  resizeBySteps,
  resizeSpan,
  shiftAnchor,
  snapMinute,
  spanForDrop,
  spanFromEntry,
  spanFromUntimedDrop,
  spanToInstants,
  visibleDays,
  visibleScrollFraction,
} from "./timeCalendar.ts";
import { isEntryLocked, type LockSettings } from "./timeLock.ts";
import type { TimeEntry } from "./timeTracking.ts";

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
  note: null,
  entryDate: "2026-10-26",
  startAt: null,
  endAt: null,
  durationSec: 3600,
  running: false,
  billable: true,
  tags: [],
  source: "calendar",
  originType: null,
  originId: null,
  approvalStatus: null,
  createdAt: "2026-10-26T08:00:00.000Z",
  ...over,
});

test("15-minute snap and the default week window", () => {
  assert.equal(SNAP_MINUTES, 15);
  assert.equal(DEFAULT_ZOOM, "week");
  assert.equal(VISIBLE_START_MIN, 8 * 60);
  assert.equal(VISIBLE_END_MIN, 20 * 60);
  assert.equal(visibleScrollFraction(), 8 / 24);
  assert.equal(snapMinute(0), 0);
  assert.equal(snapMinute(7), 0);
  assert.equal(snapMinute(8), 15);
  assert.equal(snapMinute(22), 15);
  assert.equal(snapMinute(23), 30);
  assert.equal(minuteFromFraction(0), 0);
  assert.equal(minuteFromFraction(1), MINUTES_PER_DAY);
  assert.equal(minuteFromFraction(8 / 24), 8 * 60);
});

test("drag-to-create, move and resize stay on the snap and keep a minimum length", () => {
  const created = createSpan(10 * 60 + 7, 11 * 60 + 8);
  assert.equal(created.startMin, 10 * 60);
  assert.equal(created.endMin, 11 * 60 + 15);
  const upward = createSpan(12 * 60, 10 * 60);
  assert.equal(upward.startMin, 10 * 60);
  assert.equal(upward.endMin, 12 * 60);
  const click = createSpan(9 * 60, 9 * 60);
  assert.equal(click.endMin - click.startMin, SNAP_MINUTES);

  const moved = moveSpan({ startMin: 9 * 60, endMin: 10 * 60 + 30 }, 45);
  assert.equal(moved.startMin, 9 * 60 + 45);
  assert.equal(moved.endMin - moved.startMin, 90);
  const clamped = moveSpan({ startMin: 60, endMin: 120 }, -1000);
  assert.equal(clamped.startMin, 0);
  assert.equal(clamped.endMin - clamped.startMin, 60);

  const resized = resizeSpan({ startMin: 22 * 60, endMin: 23 * 60 }, MINUTES_PER_DAY);
  assert.equal(resized.startMin, 22 * 60);
  assert.equal(resized.endMin, MINUTES_PER_DAY);
  assert.equal(plusDays(resized.endMin), 1);
  assert.equal(formatMinute(resized.endMin), "00:00");
  assert.equal(resizeBySteps({ startMin: 9 * 60, endMin: 10 * 60 }, 2).endMin, 10 * 60 + 30);
  assert.equal(defaultClickSpan(9 * 60 + 7).endMin - defaultClickSpan(9 * 60 + 7).startMin, 60);
});

test("midnight crossing is a +1 marker on the start day, and the duration is the UTC delta", () => {
  const start = instantFromLocal("2026-10-26", 22 * 60);
  const end = instantFromLocal("2026-10-26", 25 * 60 + 30);
  const span = spanFromEntry(
    { startAt: start.toISOString(), endAt: end.toISOString(), running: false },
    0,
  );
  assert.ok(span);
  assert.equal(span.startMin, 22 * 60);
  assert.equal(span.endMin, 25 * 60 + 30);
  assert.equal(plusDays(span.endMin), 1);
  assert.equal(formatMinute(span.startMin), "22:00");
  assert.equal(formatMinute(span.endMin), "01:30");
  const utc = durationSecFromUtc(start.getTime(), end.getTime());
  assert.equal(entryDurationSec({ startAt: start.toISOString(), endAt: end.toISOString(), durationSec: null, running: false }, 0), utc);
  assert.equal(spanToInstants("2026-10-26", span).durationSec, utc);

  const clockSeconds = (span.endMin - span.startMin) * 60;
  const springStart = instantFromLocal("2026-03-29", 90);
  const springEnd = instantFromLocal("2026-03-29", 210);
  const springUtc = durationSecFromUtc(springStart.getTime(), springEnd.getTime());
  assert.equal(springUtc, Math.round((springEnd.getTime() - springStart.getTime()) / 1000));
  if (springStart.getTimezoneOffset() !== springEnd.getTimezoneOffset()) {
    assert.notEqual(springUtc, clockSeconds === 0 ? -1 : (210 - 90) * 60);
  }
  const fitted = fitSpanDuration("2026-10-25", { startMin: 0, endMin: MINUTES_PER_DAY });
  assert.ok(spanToInstants("2026-10-25", fitted).durationSec <= 86400);
});

test("a running entry's duration follows now, and its start cannot move past now", () => {
  const start = "2026-10-26T20:00:00.000Z";
  const now = Date.parse("2026-10-26T21:30:00.000Z");
  assert.equal(entryDurationSec({ startAt: start, endAt: null, durationSec: null, running: true }, now), 90 * 60);
  assert.equal(moveRunningStart(8 * 60, 12 * 60, 60), 9 * 60);
  assert.equal(moveRunningStart(8 * 60, 10 * 60, 5 * 60), 10 * 60 - SNAP_MINUTES);
  const pos = nowPosition(now);
  assert.equal(pos.day.length, 10);
  assert.ok(pos.minute >= 0 && pos.minute < MINUTES_PER_DAY);
});

test("hours-only entries sit in the untimed lane until a drop gives them a snapped start", () => {
  assert.equal(isUntimed(entry()), true);
  assert.equal(isUntimed(entry({ startAt: "2026-10-26T08:00:00.000Z", running: true })), false);
  const dropped = spanFromUntimedDrop(8 * 60 + 7, 50 * 60);
  assert.equal(dropped.startMin, 8 * 60);
  assert.equal(dropped.endMin - dropped.startMin, 45);
  assert.equal(spanForDrop(9 * 60).endMin - spanForDrop(9 * 60).startMin, 60);
  const hours = entry({ id: "h", durationSec: 1800 });
  const timed = entry({
    id: "t",
    startAt: instantFromLocal("2026-10-26", 9 * 60).toISOString(),
    endAt: instantFromLocal("2026-10-26", 10 * 60).toISOString(),
    durationSec: 3600,
  });
  const otherDay = entry({ id: "o", entryDate: "2026-10-27", durationSec: 600 });
  const layout = layoutDay([hours, timed, otherDay], "2026-10-26", 0);
  assert.deepEqual(layout.untimed.map((u) => u.id), ["h"]);
  assert.equal(layout.untimed[0].durationSec, 1800);
  assert.deepEqual(layout.timed.map((b) => b.id), ["t"]);
  assert.equal(layout.timed[0].plus, 0);
});

test("overlapping blocks share the column, and a block that only touches does not", () => {
  const laid = layoutOverlaps([
    { id: "a", startMin: 0, endMin: 60 },
    { id: "b", startMin: 30, endMin: 90 },
    { id: "c", startMin: 60, endMin: 120 },
  ]);
  const byId = Object.fromEntries(laid.map((b) => [b.id, b]));
  assert.equal(byId.a.column, 0);
  assert.equal(byId.b.column, 1);
  assert.equal(byId.c.column, 0);
  assert.equal(byId.a.columns, 2);
  assert.equal(byId.b.columns, 2);
});

test("week is Monday–Sunday, month is a Monday-first grid, and the pager steps a day, a week or a month", () => {
  assert.deepEqual(visibleDays("week", "2026-10-27"), [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
  assert.deepEqual(visibleDays("day", "2026-10-27"), ["2026-10-27"]);
  const month = monthGrid("2026-10-15");
  assert.equal(month.length % 7, 0);
  assert.equal(month[0], "2026-09-28");
  assert.equal(month[month.length - 1], "2026-11-01");
  assert.equal(shiftAnchor("day", "2026-10-27", 1), "2026-10-28");
  assert.equal(shiftAnchor("week", "2026-10-28", 1), "2026-11-02");
  assert.equal(shiftAnchor("month", "2026-10-15", 1), "2026-11-01");
  assert.equal(shiftAnchor("month", "2026-10-15", -1), "2026-09-01");
  const rolled = normalizeSpanDay("2026-10-26", { startMin: MINUTES_PER_DAY + 9 * 60, endMin: MINUTES_PER_DAY + 10 * 60 });
  assert.equal(rolled.day, "2026-10-27");
  assert.equal(rolled.span.startMin, 9 * 60);
  const saved = instantsForSpan("2026-10-26", { startMin: 9 * 60, endMin: 10 * 60 });
  assert.equal(saved.entryDate, "2026-10-26");
  assert.equal(saved.durationSec, durationSecFromUtc(Date.parse(saved.startAt), Date.parse(saved.endAt)));
});

test("locked entries cannot be moved or resized, and a running entry cannot be resized", () => {
  assert.equal(dragAllowed(false), true);
  assert.equal(dragAllowed(true), false);
  assert.equal(resizeAllowed(false, false), true);
  assert.equal(resizeAllowed(true, false), false);
  assert.equal(resizeAllowed(false, true), false);
});

test("a paid payroll month blocks calendar create, move and resize; an unpaid month does not", () => {
  const now = "2026-10-27";
  const day = "2026-05-04";
  const subject = { entryDate: day, approvalStatus: null, running: false };
  const paid: LockSettings = { lockAfterDays: null, paidPayrollMonths: ["2026-05"], isAdmin: false };
  const unpaid: LockSettings = { ...paid, paidPayrollMonths: ["2026-06"] };
  const admin: LockSettings = { ...paid, isAdmin: true };
  assert.equal(calendarDayLocked(day, paid, now), true);
  assert.equal(dragAllowed(isEntryLocked(subject, paid, now)), false);
  assert.equal(resizeAllowed(isEntryLocked(subject, paid, now), false), false);
  assert.equal(calendarDayLocked(day, unpaid, now), false);
  assert.equal(dragAllowed(isEntryLocked(subject, unpaid, now)), true);
  assert.equal(resizeAllowed(isEntryLocked(subject, unpaid, now), false), true);
  assert.equal(calendarDayLocked(day, admin, now), false);
  assert.equal(dragAllowed(isEntryLocked(subject, admin, now)), true);
  assert.equal(resizeAllowed(isEntryLocked(subject, admin, now), false), true);
});

test("the holiday country follows the person being viewed, never a language", () => {
  const people = [
    { userId: "erik", workCountry: "HU" as const },
    { userId: "ada", workCountry: null },
  ];
  assert.equal(countryForScope("me", "peter", "SK", "SK", people), "SK");
  assert.equal(countryForScope("all", "peter", "SK", "HU", people), "SK");
  assert.equal(countryForScope("erik", "peter", "SK", "SK", people), "HU");
  assert.equal(countryForScope("ada", "peter", "SK", "HU", people), "HU");
  assert.equal(countryForScope("peter", "peter", "SK", "HU", people), "SK");
});
