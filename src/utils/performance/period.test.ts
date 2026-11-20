import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsClamped,
  buildPeriod,
  dayDiff,
  isInRange,
  isoWeekNumber,
  isoWeekOf,
  parseAppDate,
  parseUtcStamp,
  periodPresetFromName,
  presetNameOf,
  presetRange,
  toIsoDay,
} from "./period.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (d: Date | null) => (d ? toIsoDay(d) : null);
const TODAY = day(2026, 11, 20);

test("preset names map to presets, unknown names are custom, none is all", () => {
  assert.equal(periodPresetFromName("This week"), "week");
  assert.equal(periodPresetFromName("This month"), "month");
  assert.equal(periodPresetFromName("This quarter"), "quarter");
  assert.equal(periodPresetFromName("This year"), "year");
  assert.equal(periodPresetFromName("All Time"), "all");
  assert.equal(periodPresetFromName("Last 30 days"), "custom");
  assert.equal(periodPresetFromName(""), "all");
  assert.equal(periodPresetFromName(undefined), "all");
});

test("all time has no bounds and no previous range", () => {
  const p = buildPeriod("all", null, null, TODAY);
  assert.deepEqual([p.start, p.end, p.previousStart, p.previousEnd], [null, null, null, null]);
});

test("bounds are normalised to the first and last millisecond of the day", () => {
  const p = buildPeriod("custom", new Date(2026, 10, 1, 13, 30), new Date(2026, 10, 20, 8, 0), TODAY);
  assert.equal(p.start!.getHours(), 0);
  assert.equal(p.start!.getMilliseconds(), 0);
  assert.equal(p.end!.getHours(), 23);
  assert.equal(p.end!.getMilliseconds(), 999);
});

test("month: same elapsed part of the previous month, clamped to its length", () => {
  const p = buildPeriod("month", day(2026, 11, 1), day(2026, 11, 20), TODAY);
  assert.deepEqual([iso(p.previousStart), iso(p.previousEnd)], ["2026-10-01", "2026-10-20"]);

  // 31 Mar -> February has 28 days.
  const long = buildPeriod("month", day(2026, 3, 1), day(2026, 3, 31), TODAY);
  assert.deepEqual([iso(long.previousStart), iso(long.previousEnd)], ["2026-02-01", "2026-02-28"]);

  // A whole month maps to the whole previous month even when it is shorter.
  const whole = buildPeriod("month", day(2026, 11, 1), day(2026, 11, 30), TODAY);
  assert.deepEqual([iso(whole.previousStart), iso(whole.previousEnd)], ["2026-10-01", "2026-10-31"]);

  const partial = buildPeriod("month", day(2026, 3, 1), day(2026, 3, 30), TODAY);
  assert.equal(iso(partial.previousEnd), "2026-02-28");
});

test("week, quarter and year shift by their own unit", () => {
  // Mon 16 Nov - Thu 19 Nov
  const week = buildPeriod("week", day(2026, 11, 16), day(2026, 11, 19), TODAY);
  assert.deepEqual([iso(week.previousStart), iso(week.previousEnd)], ["2026-11-09", "2026-11-12"]);

  const quarter = buildPeriod("quarter", day(2026, 10, 1), day(2026, 11, 20), TODAY);
  assert.deepEqual([iso(quarter.previousStart), iso(quarter.previousEnd)], ["2026-07-01", "2026-08-20"]);

  const year = buildPeriod("year", day(2026, 1, 1), day(2026, 11, 20), TODAY);
  assert.deepEqual([iso(year.previousStart), iso(year.previousEnd)], ["2025-01-01", "2025-11-20"]);

  const leap = buildPeriod("year", day(2028, 1, 1), day(2028, 2, 29), TODAY);
  assert.equal(iso(leap.previousEnd), "2027-02-28");
});

test("a calendar preset without dates starts at the unit start and ends today", () => {
  const p = buildPeriod("month", null, null, TODAY);
  assert.equal(iso(p.start), "2026-11-01");
  assert.equal(iso(p.end), "2026-11-20");
  assert.equal(iso(p.previousEnd), "2026-10-20");
});

test("custom: the same number of days ending the day before start", () => {
  const p = buildPeriod("custom", day(2026, 11, 10), day(2026, 11, 14), TODAY); // 5 days
  assert.deepEqual([iso(p.previousStart), iso(p.previousEnd)], ["2026-11-05", "2026-11-09"]);

  const single = buildPeriod("custom", day(2026, 3, 1), day(2026, 3, 1), TODAY);
  assert.deepEqual([iso(single.previousStart), iso(single.previousEnd)], ["2026-02-28", "2026-02-28"]);
});

test("isInRange: first and last day are in, the day before and after are out, null is unbounded", () => {
  const p = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), TODAY);
  assert.equal(isInRange(new Date(2026, 10, 1, 0, 0, 0, 0), p.start, p.end), true);
  assert.equal(isInRange(new Date(2026, 10, 20, 23, 59, 59, 999), p.start, p.end), true);
  assert.equal(isInRange(new Date(2026, 9, 31, 23, 59, 59, 999), p.start, p.end), false);
  assert.equal(isInRange(new Date(2026, 10, 21, 0, 0, 0, 0), p.start, p.end), false);
  assert.equal(isInRange(day(1999, 1, 1), null, null), true);
  assert.equal(isInRange(null, null, null), false);
});

test("parseAppDate: date-only is local, stamps are local, zoned instants keep their instant", () => {
  const dateOnly = parseAppDate("2026-11-20")!;
  assert.deepEqual([dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate(), dateOnly.getHours()], [2026, 10, 20, 0]);

  const stamp = parseAppDate("2026-11-20 14:35")!;
  assert.deepEqual([stamp.getDate(), stamp.getHours(), stamp.getMinutes()], [20, 14, 35]);

  assert.equal(parseAppDate("2026-11-20T10:00:00Z")!.getTime(), Date.UTC(2026, 10, 20, 10, 0, 0));
  assert.equal(parseAppDate("2026-11-20T10:00:00+02:00")!.getTime(), Date.UTC(2026, 10, 20, 8, 0, 0));
  assert.equal(parseAppDate("2026-11-20 10:00:00", { utc: true })!.getTime(), Date.UTC(2026, 10, 20, 10, 0, 0));
  assert.equal(parseUtcStamp("2026-11-20 10:00:00")!.getTime(), Date.UTC(2026, 10, 20, 10, 0, 0));

  assert.equal(parseAppDate(""), null);
  assert.equal(parseAppDate(null), null);
  assert.equal(parseAppDate("2026-02-31"), null);
  assert.equal(parseAppDate("garbage"), null);
});

test("dayDiff counts calendar days, ignoring the time of day", () => {
  assert.equal(dayDiff(new Date(2026, 10, 1, 23, 0), new Date(2026, 10, 2, 1, 0)), 1);
  assert.equal(dayDiff(day(2026, 11, 20), day(2026, 11, 20)), 0);
  assert.equal(dayDiff(day(2026, 11, 20), day(2026, 11, 10)), -10);
  // Across the autumn DST change.
  assert.equal(dayDiff(day(2026, 10, 24), day(2026, 10, 27)), 3);
});

test("ISO week numbers, including the year boundary", () => {
  assert.equal(isoWeekNumber(day(2026, 11, 20)), 47);
  assert.equal(isoWeekNumber(day(2026, 1, 1)), 1);
  assert.deepEqual(isoWeekOf(day(2027, 1, 1)), { year: 2026, week: 53 });
  assert.equal(isoWeekNumber(day(2024, 12, 30)), 1);
});

test("addMonthsClamped keeps the last day of a month the last day", () => {
  assert.equal(iso(addMonthsClamped(day(2026, 11, 30), -1)), "2026-10-31");
  assert.equal(iso(addMonthsClamped(day(2026, 3, 31), -1)), "2026-02-28");
  assert.equal(iso(addMonthsClamped(day(2026, 1, 15), -2)), "2025-11-15");
});

test("presetRange runs from the start of the unit to today", () => {
  const range = (preset: "week" | "month" | "quarter" | "year", today: Date) => {
    const r = presetRange(preset, today);
    return [toIsoDay(r.start), toIsoDay(r.end)];
  };
  // 20 Nov 2026 is a Friday.
  assert.deepEqual(range("week", TODAY), ["2026-11-16", "2026-11-20"]);
  assert.deepEqual(range("month", TODAY), ["2026-11-01", "2026-11-20"]);
  assert.deepEqual(range("quarter", TODAY), ["2026-10-01", "2026-11-20"]);
  assert.deepEqual(range("year", TODAY), ["2026-01-01", "2026-11-20"]);
  // A Sunday belongs to the week that started on the Monday before.
  assert.deepEqual(range("week", day(2026, 11, 22)), ["2026-11-16", "2026-11-22"]);
  // A Monday is the first day of its own week.
  assert.deepEqual(range("week", day(2026, 11, 16)), ["2026-11-16", "2026-11-16"]);
});

test("presetRange drops the time of day and presetNameOf names the picker presets", () => {
  const r = presetRange("month", new Date(2026, 10, 20, 15, 30));
  assert.equal(r.start.getHours(), 0);
  assert.equal(r.end.getHours(), 0);
  for (const p of ["week", "month", "quarter", "year"] as const) {
    assert.equal(periodPresetFromName(presetNameOf(p)), p);
  }
});
