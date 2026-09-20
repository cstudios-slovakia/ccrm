import assert from "node:assert/strict";
import test from "node:test";
import {
  getTimePhaseId,
  getLoginPhaseConfig,
  getCurrentLoginTheme,
  formatLocalizedClock,
  formatLocalizedDate,
  LOGIN_PHASES,
  type TimePhaseId
} from "./loginTheme.ts";

test("getTimePhaseId returns dawn between 05:00 and 08:59", () => {
  const d5 = new Date(2026, 8, 20, 5, 0, 0);
  const d8 = new Date(2026, 8, 20, 8, 59, 59);
  assert.equal(getTimePhaseId(d5), "dawn");
  assert.equal(getTimePhaseId(d8), "dawn");
});

test("getTimePhaseId returns day between 09:00 and 16:59", () => {
  const d9 = new Date(2026, 8, 20, 9, 0, 0);
  const d12 = new Date(2026, 8, 20, 12, 30, 0);
  const d16 = new Date(2026, 8, 20, 16, 59, 59);
  assert.equal(getTimePhaseId(d9), "day");
  assert.equal(getTimePhaseId(d12), "day");
  assert.equal(getTimePhaseId(d16), "day");
});

test("getTimePhaseId returns sunset between 17:00 and 20:59", () => {
  const d17 = new Date(2026, 8, 20, 17, 0, 0);
  const d20 = new Date(2026, 8, 20, 20, 59, 59);
  assert.equal(getTimePhaseId(d17), "sunset");
  assert.equal(getTimePhaseId(d20), "sunset");
});

test("getTimePhaseId returns night between 21:00 and 04:59", () => {
  const d21 = new Date(2026, 8, 20, 21, 0, 0);
  const d0 = new Date(2026, 8, 20, 0, 15, 0);
  const d4 = new Date(2026, 8, 20, 4, 59, 59);
  assert.equal(getTimePhaseId(d21), "night");
  assert.equal(getTimePhaseId(d0), "night");
  assert.equal(getTimePhaseId(d4), "night");
});

test("all four phases have complete localized greetings, badges, and shader settings", () => {
  const phases: TimePhaseId[] = ["dawn", "day", "sunset", "night"];
  for (const phase of phases) {
    const config = getLoginPhaseConfig(phase);
    assert.equal(config.id, phase);
    assert.ok(config.badge.en && config.badge.sk && config.badge.hu);
    assert.ok(config.greeting.en && config.greeting.sk && config.greeting.hu);
    assert.ok(config.subtitle.en && config.subtitle.sk && config.subtitle.hu);
    assert.ok(config.quote.en && config.quote.sk && config.quote.hu);
    assert.ok(config.raysColor.startsWith("#"));
    assert.ok(config.backgroundGradient.includes("linear-gradient"));
    assert.ok(config.blobColors.blob1 && config.blobColors.blob2 && config.blobColors.blob3);
  }
});

test("getCurrentLoginTheme honors manual override", () => {
  const dMidnight = new Date(2026, 8, 20, 2, 0, 0);
  const theme = getCurrentLoginTheme(dMidnight, "day");
  assert.equal(theme.id, "day");
  assert.equal(theme.raysColor, LOGIN_PHASES.day.raysColor);
});

test("formatLocalizedClock pads hours, minutes and seconds", () => {
  const d = new Date(2026, 8, 20, 7, 5, 9);
  const clock = formatLocalizedClock(d);
  assert.equal(clock.hoursStr, "07");
  assert.equal(clock.minutesStr, "05");
  assert.equal(clock.secondsStr, "09");
});

test("formatLocalizedDate formats in EN, SK, HU without error", () => {
  const d = new Date(2026, 8, 20, 12, 0, 0);
  const en = formatLocalizedDate(d, "en");
  const sk = formatLocalizedDate(d, "sk");
  const hu = formatLocalizedDate(d, "hu");
  assert.ok(en.length > 5);
  assert.ok(sk.length > 5);
  assert.ok(hu.length > 5);
});
