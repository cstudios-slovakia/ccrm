import test from "node:test";
import assert from "node:assert/strict";
import { formatDayRange, periodLabels, periodRangeLabel, shortMonthNames } from "./labels.ts";
import { buildPeriod } from "./period.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const TODAY = day(2026, 11, 20);

test("Slovak month period", () => {
  const p = buildPeriod("month", day(2026, 11, 1), day(2026, 11, 20), TODAY);
  assert.deepEqual(periodLabels(p, "sk", TODAY), {
    current: "november",
    versusPrevious: "oproti októbru",
    versusPreviousMonth: "oproti októbru",
  });
});

test("every Slovak month takes its dative", () => {
  const dative = ["januáru", "februáru", "marcu", "aprílu", "máju", "júnu", "júlu", "augustu", "septembru", "októbru", "novembru", "decembru"];
  dative.forEach((word, month) => {
    // The period sits in the month after `month`, so "versus previous" names `month`.
    const next = new Date(2026, month + 1, 1);
    const p = buildPeriod("month", next, new Date(next.getFullYear(), next.getMonth(), 10), TODAY);
    assert.equal(periodLabels(p, "sk", TODAY).versusPrevious, `oproti ${word}`);
  });
});

test("Slovak week, quarter, year", () => {
  const week = buildPeriod("week", day(2026, 11, 16), day(2026, 11, 19), TODAY);
  assert.deepEqual(periodLabels(week, "sk", TODAY), {
    current: "47. týždeň",
    versusPrevious: "oproti 46. týždňu",
    versusPreviousMonth: "oproti októbru",
  });

  const quarter = buildPeriod("quarter", day(2026, 10, 1), day(2026, 11, 20), TODAY);
  const q = periodLabels(quarter, "sk", TODAY);
  assert.equal(q.current, "4. kvartál");
  assert.equal(q.versusPrevious, "oproti 3. kvartálu");

  const year = buildPeriod("year", day(2026, 1, 1), day(2026, 11, 20), TODAY);
  const y = periodLabels(year, "sk", TODAY);
  assert.equal(y.current, "2026");
  assert.equal(y.versusPrevious, "oproti roku 2025");
});

test("custom range and all time", () => {
  const custom = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), TODAY);
  const c = periodLabels(custom, "sk", TODAY);
  assert.equal(c.current, "1. – 20. 11. 2026");
  assert.equal(c.versusPrevious, "oproti predchádzajúcemu obdobiu");
  assert.equal(c.versusPreviousMonth, "oproti októbru");

  const all = buildPeriod("all", null, null, TODAY);
  assert.deepEqual(periodLabels(all, "sk", TODAY), { current: "celý čas", versusPrevious: "", versusPreviousMonth: "" });
});

test("versusPreviousMonth follows the month the period ends in", () => {
  const p = buildPeriod("custom", day(2026, 10, 15), day(2026, 11, 20), TODAY);
  assert.equal(periodLabels(p, "sk", TODAY).versusPreviousMonth, "oproti októbru");
  const january = buildPeriod("custom", day(2026, 1, 1), day(2026, 1, 20), TODAY);
  assert.equal(periodLabels(january, "sk", TODAY).versusPreviousMonth, "oproti decembru");
});

test("English and Hungarian", () => {
  const p = buildPeriod("month", day(2026, 11, 1), day(2026, 11, 20), TODAY);
  assert.deepEqual(periodLabels(p, "en", TODAY), { current: "November", versusPrevious: "vs October", versusPreviousMonth: "vs October" });
  assert.equal(periodLabels(p, "hu", TODAY).versusPrevious, "októberhez képest");
  assert.equal(periodRangeLabel(buildPeriod("all", null, null, TODAY), "hu"), "Teljes időszak");
});

test("range formatter collapses equal parts", () => {
  assert.equal(formatDayRange(day(2026, 11, 20), day(2026, 11, 20), "sk"), "20. 11. 2026");
  assert.equal(formatDayRange(day(2026, 11, 1), day(2026, 11, 20), "sk"), "1. – 20. 11. 2026");
  assert.equal(formatDayRange(day(2026, 10, 1), day(2026, 11, 20), "sk"), "1. 10. – 20. 11. 2026");
  assert.equal(formatDayRange(day(2025, 10, 1), day(2026, 11, 20), "sk"), "1. 10. 2025 – 20. 11. 2026");
  assert.equal(formatDayRange(day(2026, 11, 1), day(2026, 11, 20), "en"), "1 – 20 Nov 2026");
});

test("header button label says all time when there is no range", () => {
  assert.equal(periodRangeLabel(buildPeriod("all", null, null, TODAY), "sk"), "Celý čas");
  assert.equal(periodRangeLabel(buildPeriod("all", null, null, TODAY), "en"), "All time");
  assert.equal(periodRangeLabel(buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), TODAY), "sk"), "1. – 20. 11. 2026");
});

test("short month names", () => {
  assert.equal(shortMonthNames("sk")[4], "Máj");
  assert.equal(shortMonthNames("sk").length, 12);
  assert.equal(shortMonthNames("en")[4], "May");
  assert.equal(shortMonthNames("hu")[8], "Sze");
});

test("a custom range with only a start reads as open-ended, in every language", () => {
  const open = buildPeriod("custom", day(2026, 11, 5), null, TODAY);
  assert.equal(periodRangeLabel(open, "sk"), "5. 11. 2026 \u2013");
  assert.equal(periodRangeLabel(open, "en"), "5 Nov 2026 \u2013");
  assert.equal(periodRangeLabel(open, "hu"), "2026. 11. 5. \u2013");
  assert.deepEqual(periodLabels(open, "sk", TODAY), { current: "5. 11. 2026 \u2013", versusPrevious: "", versusPreviousMonth: "" });
  assert.equal(periodLabels(open, "en", TODAY).current, "5 Nov 2026 \u2013");
});

test("an all-time period still reads as all time", () => {
  const all = buildPeriod("all", null, null, TODAY);
  assert.equal(periodRangeLabel(all, "sk"), "Celý čas");
});
