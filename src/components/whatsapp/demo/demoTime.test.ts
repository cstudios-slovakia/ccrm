import assert from "node:assert/strict";
import test from "node:test";
import { NEWEST_AGE_MS, pastShift, zonedInstant } from "./demoTime.ts";

const iso = (ms: number) => new Date(ms).toISOString();

test("Europe/Bratislava in summer is UTC+2", () => {
  const now = Date.parse("2026-07-15T10:00:00Z");
  assert.equal(iso(zonedInstant(0, "09:30", "Europe/Bratislava", now)), "2026-07-15T07:30:00.000Z");
  assert.equal(iso(zonedInstant(-2, "14:08", "Europe/Bratislava", now)), "2026-07-13T12:08:00.000Z");
});

test("Europe/Bratislava in winter is UTC+1", () => {
  const now = Date.parse("2026-01-15T10:00:00Z");
  assert.equal(iso(zonedInstant(0, "09:30", "Europe/Bratislava", now)), "2026-01-15T08:30:00.000Z");
  assert.equal(iso(zonedInstant(1, "12:00", "Europe/Bratislava", now)), "2026-01-16T11:00:00.000Z");
});

test("America/Denver is UTC-6 in summer and UTC-7 in winter", () => {
  assert.equal(iso(zonedInstant(0, "09:30", "America/Denver", Date.parse("2026-07-15T18:00:00Z"))), "2026-07-15T15:30:00.000Z");
  assert.equal(iso(zonedInstant(0, "09:30", "America/Denver", Date.parse("2026-01-15T18:00:00Z"))), "2026-01-15T16:30:00.000Z");
});

test("a day offset across a DST change keeps the wall clock", () => {
  // Bratislava switches to summer time on 2026-03-29.
  const now = Date.parse("2026-03-27T12:00:00Z");
  assert.equal(iso(zonedInstant(-1, "09:30", "Europe/Bratislava", now)), "2026-03-26T08:30:00.000Z");
  assert.equal(iso(zonedInstant(3, "09:30", "Europe/Bratislava", now)), "2026-03-30T07:30:00.000Z");
});

test("today is the date in the zone, not in UTC", () => {
  // 23:30 UTC on the 15th is already 01:30 on the 16th in Bratislava, and still the 15th in Denver.
  const now = Date.parse("2026-07-15T23:30:00Z");
  assert.equal(iso(zonedInstant(0, "08:00", "Europe/Bratislava", now)), "2026-07-16T06:00:00.000Z");
  assert.equal(iso(zonedInstant(0, "08:00", "America/Denver", now)), "2026-07-15T14:00:00.000Z");
});

test("pastShift pulls a future-dated newest message back to five minutes ago", () => {
  const now = Date.parse("2026-07-15T10:00:00Z");
  assert.equal(pastShift(now + 3 * 3600_000, now), 3 * 3600_000 + NEWEST_AGE_MS);
  assert.equal(pastShift(now - NEWEST_AGE_MS, now), 0);
  assert.equal(pastShift(now - 86_400_000, now), 0);
});
