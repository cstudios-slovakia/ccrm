import test from "node:test";
import assert from "node:assert/strict";
import { totalCost, totalSeconds, type TimeEntry } from "./timeTracking.ts";
import { entryWorkedSeconds, leverage, liveWorkedShares, showsWorkedAndDelivered, totalWorkedSeconds } from "./timeWorked.ts";

const at = (hhmm: string): string => `2026-11-19T${hhmm}:00Z`;
const ms = (hhmm: string): number => Date.parse(at(hhmm));

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
  entryDate: "2026-11-19",
  startAt: null,
  endAt: null,
  durationSec: 3600,
  running: false,
  billable: true,
  tags: [],
  source: "timer",
  originType: null,
  originId: null,
  approvalStatus: null,
  createdAt: "2026-11-19 09:00:00",
  ...over,
});

/** A closed timed entry from..to with the server's worked minutes (defaults to the full length). */
const timed = (id: string, from: string, to: string, workedMin?: number, over: Partial<TimeEntry> = {}): TimeEntry => {
  const durationSec = (ms(to) - ms(from)) / 1000;
  return entry({ id, startAt: at(from), endAt: at(to), durationSec, workedMs: (workedMin ?? durationSec / 60) * 60000, ...over });
};

const running = (id: string, from: string, over: Partial<TimeEntry> = {}): TimeEntry =>
  entry({ id, running: true, startAt: at(from), durationSec: null, workedMs: null, ...over });

const NOW = ms("12:00");

test("no overlap: worked equals project time, leverage 1, one number", () => {
  const list = [timed("a", "09:00", "10:00"), timed("b", "10:30", "11:15")];
  assert.equal(totalWorkedSeconds(list, NOW), totalSeconds(list, NOW));
  assert.equal(leverage(list, NOW), 1);
  assert.equal(showsWorkedAndDelivered(totalSeconds(list, NOW), totalWorkedSeconds(list, NOW)), false);
});

test("no overlap with a running entry: totals stay exactly equal", () => {
  const list = [timed("a", "09:00", "10:00"), running("r", "10:30")];
  const now = ms("11:07") + 999;
  assert.equal(totalWorkedSeconds(list, now), totalSeconds(list, now));
  assert.equal(leverage(list, now), 1);
});

test("the brief: three fully overlapping 2 h entries work 2 h, leverage 3", () => {
  const list = ["a", "b", "c"].map((id) => timed(id, "09:00", "11:00", 40));
  assert.equal(totalSeconds(list, NOW), 6 * 3600);
  assert.equal(totalWorkedSeconds(list, NOW), 2 * 3600);
  assert.equal(leverage(list, NOW), 3);
  assert.equal(showsWorkedAndDelivered(6 * 3600, 2 * 3600), true);
});

test("staggered (D2): worked 120 min, project 210 min, leverage 1.75", () => {
  const list = [timed("a", "09:00", "11:00", 85), timed("b", "09:30", "10:30", 25), timed("c", "10:00", "10:30", 10)];
  assert.equal(totalWorkedSeconds(list, NOW), 120 * 60);
  assert.equal(totalSeconds(list, NOW), 210 * 60);
  assert.equal(leverage(list, NOW), 1.75);
});

test("a running entry overlapping a closed one gets a live share", () => {
  // Closed A 09:00-10:00 (server settled 45 min: it shared 09:30-10:00 with R). R runs since 09:30.
  const a = timed("a", "09:00", "10:00", 45);
  const r = running("r", "09:30");
  const now = ms("10:30");
  const shares = liveWorkedShares([a, r], now);
  assert.deepEqual([...shares.keys()], ["r"]);
  assert.equal(shares.get("r"), 45 * 60000); // 15 shared + 30 alone
  assert.equal(entryWorkedSeconds(r, now, shares), 45 * 60);
  assert.equal(entryWorkedSeconds(r, now), 60 * 60); // without shares: elapsed
  assert.equal(totalWorkedSeconds([a, r], now), 90 * 60); // the union 09:00-10:30
  assert.equal(totalSeconds([a, r], now), 120 * 60);
});

test("closed entries without workedMs fall back to project time", () => {
  const old = timed("a", "09:00", "11:00", undefined, { workedMs: undefined });
  const nul = timed("b", "09:00", "11:00", undefined, { workedMs: null });
  assert.equal(entryWorkedSeconds(old, NOW), 7200);
  assert.equal(entryWorkedSeconds(nul, NOW), 7200);
  assert.equal(totalWorkedSeconds([old, nul], NOW), totalSeconds([old, nul], NOW));
});

test("two users in one list: live shares are allocated per person", () => {
  const r1 = running("r1", "10:00", { userId: "u1" });
  const r2 = running("r2", "10:00", { userId: "u2" });
  const c1 = timed("c1", "10:00", "11:00", 30, { userId: "u1" });
  const now = ms("11:00");
  const shares = liveWorkedShares([r1, r2, c1], now);
  assert.equal(shares.get("r1"), 30 * 60000); // shares with u1's own c1
  assert.equal(shares.get("r2"), 60 * 60000); // u2 alone, not split with u1
  assert.equal(totalWorkedSeconds([r1, r2, c1], now), 2 * 3600);
});

test("hours-only entries count their duration (C15)", () => {
  const h = entry({ id: "h", startAt: null, durationSec: 5400, workedMs: 1 });
  assert.equal(entryWorkedSeconds(h, NOW), 5400);
  assert.equal(totalWorkedSeconds([h, timed("a", "09:00", "10:00")], NOW), 5400 + 3600);
});

test("leverage is null with nothing worked", () => {
  assert.equal(leverage([], NOW), null);
});

test("totalCost sums four-decimal costs and rounds to cents once (D3.2)", () => {
  assert.equal(totalCost([entry({ cost: 6.6667 }), entry({ cost: 6.6667 }), entry({ cost: 6.6667 })]), 20);
  assert.equal(totalCost([entry({ cost: 0.004 }), entry({ cost: 0.004 })]), 0.01);
});
