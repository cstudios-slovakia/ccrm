import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  builtinHolidays,
  builtinWorkingDays,
  easterSunday,
  holidayCountryFromText,
  holidayName,
  makeHolidayCalendar,
  resolveWorkCountry,
  weekdayOf,
} from "./holidays.ts";

const dates = (country: "SK" | "HU", year: number) => builtinHolidays(country, year).map((h) => h.date);

test("Easter Sunday for known years", () => {
  assert.equal(easterSunday(2025), "2025-04-20");
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
});

test("date helpers do not depend on the machine's timezone or DST", () => {
  assert.equal(addDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
  assert.equal(weekdayOf("2026-10-23"), 5); // Friday
});

test("Slovakia 2026 rest days match Nager's Public list (8 May, 1 Sept, 15 Sept, 17 Nov are not rest days)", () => {
  assert.deepEqual(dates("SK", 2026), [
    "2026-01-01", "2026-01-06", "2026-04-03", "2026-04-06", "2026-05-01",
    "2026-07-05", "2026-08-29", "2026-11-01", "2026-12-24", "2026-12-25", "2026-12-26",
  ]);
});

test("Slovakia 2027 rest days include 8 May and 15 Sept again (matches Nager)", () => {
  const d = dates("SK", 2027);
  assert.ok(d.includes("2027-05-08"));
  assert.ok(d.includes("2027-09-15"));
  assert.ok(!d.includes("2027-09-01"));
  assert.ok(!d.includes("2027-11-17"));
});

test("Hungary 2026 matches Nager's Public list; 24 Dec is not invented", () => {
  assert.deepEqual(dates("HU", 2026), [
    "2026-01-01", "2026-03-15", "2026-04-03", "2026-04-05", "2026-04-06", "2026-05-01",
    "2026-05-24", "2026-05-25", "2026-08-20", "2026-10-23", "2026-11-01", "2026-12-25", "2026-12-26",
  ]);
});

test("working days of the months the fixtures rely on", () => {
  assert.equal(builtinWorkingDays("SK", 2026, 5), 20);
  assert.equal(builtinWorkingDays("SK", 2026, 6), 22);
  assert.equal(builtinWorkingDays("SK", 2026, 9), 22);
  assert.equal(builtinWorkingDays("SK", 2026, 10), 22);
  assert.equal(builtinWorkingDays("HU", 2026, 10), 21);
});

test("overrides: an extra day off lowers the count, a working Saturday raises it", () => {
  // Aug 2026 HU: 21 weekdays, minus 20 Aug (Thu) = 20.
  assert.equal(builtinWorkingDays("HU", 2026, 8), 20);
  assert.equal(builtinWorkingDays("HU", 2026, 8, [{ date: "2026-08-21", kind: "extraDayOff", name: "Bridge day" }]), 19);
  assert.equal(
    builtinWorkingDays("HU", 2026, 8, [
      { date: "2026-08-21", kind: "extraDayOff", name: "Bridge day" },
      { date: "2026-08-08", kind: "extraWorkingDay", name: "Worked Saturday" },
    ]),
    20,
  );
});

test("an extra working day on a public holiday makes it a working day", () => {
  const cal = makeHolidayCalendar("SK", builtinHolidays("SK", 2026), [{ date: "2026-05-01", kind: "extraWorkingDay", name: "x" }]);
  assert.equal(cal.isWorkingDay("2026-05-01"), true);
  assert.equal(cal.isOffDay("2026-05-02"), true); // Saturday
});

test("a holiday on a weekend does not lower the count", () => {
  // Hungary 2026: 15 Mar, 1 Nov and Easter/Pentecost Sunday fall on Sundays, 26 Dec on a Saturday.
  // Dec 2026 has 23 weekdays; 25 Dec (Fri) is the only holiday that costs a working day.
  assert.equal(builtinWorkingDays("HU", 2026, 12), 22);
  assert.equal(builtinWorkingDays("HU", 2026, 3), 22); // 22 weekdays, 15 Mar is a Sunday
});

test("language only changes the NAME of a holiday, never the set of days", () => {
  const sk = builtinHolidays("SK", 2026);
  const names = (lang: "en" | "sk" | "hu") => sk.map((h) => holidayName(h, "SK", lang));
  assert.equal(names("sk")[0], "Deň vzniku Slovenskej republiky");
  assert.equal(names("hu")[1], "Vízkereszt");
  assert.notDeepEqual(names("sk"), names("en"));
  assert.equal(builtinWorkingDays("SK", 2026, 10), 22);
});

test("an unmapped API holiday falls back to its own names", () => {
  const day = { ruleId: null, localName: "Zvláštny sviatok", nameEn: "Special day" };
  assert.equal(holidayName(day, "SK", "sk"), "Zvláštny sviatok");
  assert.equal(holidayName(day, "SK", "en"), "Special day");
  assert.equal(holidayName(day, "SK", "hu"), "Special day");
  assert.equal(holidayName({ ...day, localName: "Különleges nap" }, "HU", "hu"), "Különleges nap");
});

test("every built-in rule has a name in all three languages", () => {
  for (const country of ["SK", "HU"] as const) {
    for (const h of builtinHolidays(country, 2027)) {
      for (const lang of ["en", "sk", "hu"] as const) {
        assert.ok(h.ruleId && holidayName(h, country, lang).length > 0, `${h.ruleId} ${lang}`);
      }
    }
  }
});

test("company country text maps to SK/HU, else SK; an employee override wins", () => {
  assert.equal(holidayCountryFromText("Slovakia"), "SK");
  assert.equal(holidayCountryFromText("hu"), "HU");
  assert.equal(holidayCountryFromText("Czechia"), null);
  assert.equal(resolveWorkCountry(null, "Hungary"), "HU");
  assert.equal(resolveWorkCountry(null, "Germany"), "SK");
  assert.equal(resolveWorkCountry("HU", "Slovakia"), "HU");
});
