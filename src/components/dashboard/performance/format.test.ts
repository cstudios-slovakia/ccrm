import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedWord,
  ofWhichOpen,
  openWord,
  count,
  countNoun,
  deadlineDistance,
  days,
  duration,
  hours,
  initials,
  monthYear,
  money,
  multiplier,
  noun,
  ofTotal,
  percent,
  pointsDelta,
  relativeTime,
  signedCountNoun,
  signedMoney,
  signedPercent,
  statusesOf,
  thousands,
} from "./format.ts";

const n = (s: string): string => s.replace(/[  ]/g, " ");

test("money: signed with the real minus sign, null is a dash", () => {
  assert.equal(n(signedMoney(16370, "EUR", "sk")), "+16 370 €");
  assert.equal(n(signedMoney(-810, "EUR", "sk")), "−810 €");
  assert.equal(n(signedMoney(0, "EUR", "sk")), "0 €");
  assert.equal(n(money(20539.6, "EUR", "sk", 2)), "20 539,6 €");
  assert.equal(money(null, "EUR", "sk"), "—");
});

test("percent, signed percent and percentage points", () => {
  assert.equal(n(percent(23.5, "sk")), "23,5 %");
  assert.equal(n(percent(62, "sk")), "62 %");
  assert.equal(n(percent(12.34, "en")), "12,3 %");
  assert.equal(n(signedPercent(12, "sk")), "+12 %");
  assert.equal(n(signedPercent(-4, "sk")), "−4 %");
  assert.equal(n(pointsDelta(2.1, "sk")), "+2,1 p. b.");
  assert.equal(percent(null, "sk"), "—");
});

test("thousands for the chart", () => {
  assert.equal(n(thousands(80000, "sk")), "80 tis.");
  assert.equal(n(thousands(10800, "sk", true)), "+10,8 tis.");
  assert.equal(n(thousands(-2700, "sk", true)), "−2,7 tis.");
  assert.equal(thousands(0, "sk"), "0");
});

test("days: sk plural and fractions", () => {
  assert.equal(n(days(27, "sk")), "27 dní");
  assert.equal(n(days(-3, "sk", true)), "−3 dni");
  assert.equal(n(days(4.2, "sk")), "4,2 dňa");
  assert.equal(n(days(-0.6, "sk", true)), "−0,6 dňa");
  assert.equal(n(days(1, "sk")), "1 deň");
  assert.equal(n(days(3, "en", true)), "+3 days");
});

test("hours and durations", () => {
  assert.equal(n(hours(142 * 3600000, "sk")), "142 h");
  assert.equal(n(duration(102 * 60000, "sk")), "1 h 42 min");
  assert.equal(n(duration(-18 * 60000, "sk", true)), "−18 min");
  assert.equal(n(duration(4 * 3600000, "sk")), "4 h");
  assert.equal(multiplier(1.6, "sk"), "1,6×");
});

test("relative time against now", () => {
  const now = new Date(2026, 10, 20, 14, 0);
  assert.equal(relativeTime(new Date(2026, 10, 20, 12, 0), now, "sk"), "pred 2 hodinami");
  assert.equal(relativeTime(new Date(2026, 10, 20, 12, 0), now, "sk", "short"), "pred 2 h");
  assert.equal(relativeTime(new Date(2026, 10, 19, 16, 40), now, "sk"), "včera 16:40");
  assert.equal(relativeTime(new Date(2026, 10, 17, 9, 0), now, "sk"), "pred 3 dňami");
  assert.equal(relativeTime(new Date(2026, 10, 20, 13, 55), now, "sk"), "pred 5 minútami");
  assert.equal(relativeTime(new Date(2026, 10, 20, 12, 0), now, "en"), "2 hours ago");
});

test("deadline distance", () => {
  assert.equal(n(deadlineDistance(-12, "sk")), "12 dní po termíne");
  assert.equal(n(deadlineDistance(-3, "sk")), "3 dni po termíne");
  assert.equal(n(deadlineDistance(4, "sk")), "o 4 dni");
  assert.equal(n(deadlineDistance(10, "sk")), "o 10 dní");
  assert.equal(deadlineDistance(0, "sk"), "dnes");
});

test("initials", () => {
  assert.equal(initials("Tomáš Bielik"), "TB");
  assert.equal(initials("Adam Šimko"), "AŠ");
  assert.equal(initials("Madonna"), "M");
});

test("sk plurals of every counted noun", () => {
  const forms = (k: Parameters<typeof noun>[0]) => [1, 2, 5].map((c) => noun(k, c, "sk"));
  assert.deepEqual(forms("task"), ["úloha", "úlohy", "úloh"]);
  assert.deepEqual(forms("ticket"), ["ticket", "tickety", "ticketov"]);
  assert.deepEqual(forms("push"), ["push", "pushe", "pushov"]);
  assert.deepEqual(forms("criterion"), ["kritérium", "kritériá", "kritérií"]);
  assert.deepEqual(forms("deal"), ["zákazka", "zákazky", "zákaziek"]);
  assert.deepEqual(forms("lead"), ["lead", "leady", "leadov"]);
  assert.deepEqual(forms("project"), ["projekt", "projekty", "projektov"]);
  assert.deepEqual(forms("item"), ["položka", "položky", "položiek"]);
  assert.equal(n(countNoun("task", 73, "sk")), "73 úloh");
  assert.equal(n(signedCountNoun("criterion", 17, "sk")), "+17 kritérií");
  assert.equal(n(ofTotal(8, 34, "lead", "sk")), "8 z 34 leadov");
  assert.equal(n(ofTotal(31, 258, "task", "sk")), "31 z 258 úloh");
  assert.equal(count(1234, "sk").replace(/\s/g, " "), "1 234");
});

test("open tickets inflect in sk", () => {
  assert.deepEqual([0, 1, 2, 4, 5, 30].map((c) => openWord(c, "sk")), [
    "otvorených",
    "otvorený",
    "otvorené",
    "otvorené",
    "otvorených",
    "otvorených",
  ]);
  const plain = (s: string) => s.replace(/\s/g, " ");
  assert.equal(plain(ofWhichOpen(1, "sk")), "z toho 1 otvorený");
  assert.equal(plain(ofWhichOpen(3, "sk")), "z toho 3 otvorené");
  assert.equal(plain(ofWhichOpen(0, "sk")), "z toho 0 otvorených");
  assert.equal(plain(ofWhichOpen(30, "sk")), "z toho 30 otvorených");
  assert.equal(plain(ofWhichOpen(30, "en")), "of which 30 open");
  assert.equal(plain(ofWhichOpen(30, "hu")), "ebből 30 nyitott");
});

test("accepted offers inflect in sk", () => {
  assert.deepEqual([0, 1, 2, 4, 5, 18].map((c) => acceptedWord(c, "sk")), [
    "prijatých",
    "prijatá",
    "prijaté",
    "prijaté",
    "prijatých",
    "prijatých",
  ]);
  assert.equal(acceptedWord(3, "en"), "accepted");
});

test("statuses: z and zo", () => {
  assert.equal(statusesOf(5, 5, "sk"), "5 z 5 stavov");
  assert.equal(statusesOf(4, 4, "sk"), "4 zo 4 stavov");
  assert.equal(statusesOf(3, 7, "sk"), "3 zo 7 stavov");
  assert.equal(statusesOf(2, 3, "en"), "2 of 3 statuses");
});

test("month names", () => {
  assert.equal(monthYear(2026, 5, "sk"), "jún 2026");
  assert.equal(monthYear(2027, 0, "sk"), "január 2027");
});
