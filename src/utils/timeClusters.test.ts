import test from "node:test";
import assert from "node:assert/strict";
import type { TimeEntry } from "./timeTracking.ts";
import { clusterEntries, segmentByCluster } from "./timeClusters.ts";

const at = (hhmm: string): string => `2026-11-19T${hhmm}:00Z`;
const ms = (hhmm: string): number => Date.parse(at(hhmm));

const entry = (id: string, from: string, to: string, over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id,
    userId: "u1",
    startAt: at(from),
    endAt: at(to),
    durationSec: (ms(to) - ms(from)) / 1000,
    workedMs: null,
    running: false,
    ...over,
  }) as TimeEntry;

test("transitive chain is one cluster", () => {
  const list = [entry("a", "09:00", "10:00", { workedMs: 1800_000 }), entry("b", "09:30", "11:00", { workedMs: 3600_000 }), entry("c", "10:30", "11:30", { workedMs: 2700_000 })];
  const [c, ...rest] = clusterEntries(list, ms("12:00"));
  assert.equal(rest.length, 0);
  assert.deepEqual(c.ids, ["a", "b", "c"]);
  assert.equal(c.count, 3);
  assert.equal(c.startMs, ms("09:00"));
  assert.equal(c.endMs, ms("11:30"));
  assert.equal(c.workedSec, 8100);
  assert.equal(c.deliveredSec, 3600 + 5400 + 3600);
});

test("touching intervals do not connect and singles are not clusters", () => {
  assert.equal(clusterEntries([entry("a", "09:00", "10:00"), entry("b", "10:00", "11:00")], ms("12:00")).length, 0);
});

test("two users never share a cluster; hours-only entries are ignored", () => {
  const list = [entry("a", "09:00", "10:00"), entry("b", "09:30", "10:30", { userId: "u2" }), entry("c", "09:15", "09:45", { startAt: null, endAt: null })];
  assert.equal(clusterEntries(list, ms("12:00")).length, 0);
  const both = clusterEntries([...list, entry("d", "09:30", "10:30")], ms("12:00"));
  assert.equal(both.length, 1);
  assert.equal(both[0].userId, "u1");
});

test("a running item joins a cluster with its live share", () => {
  const list = [entry("a", "09:00", "10:00", { workedMs: 3600_000 }), entry("r", "09:30", "10:00", { running: true, endAt: null, durationSec: null })];
  const [c] = clusterEntries(list, ms("10:30"));
  assert.deepEqual(c.ids, ["a", "r"]);
  assert.equal(c.endMs, ms("10:30"));
  assert.ok(c.workedSec > 3600 && c.workedSec <= 7200);
});

test("segmentByCluster runs consecutive rows and joins a collapsed row by any member", () => {
  const cs = clusterEntries([entry("a", "09:00", "10:00"), entry("b", "09:30", "10:30")], ms("12:00"));
  const rows = [{ ids: ["x"] }, { ids: ["a"] }, { ids: ["z", "b"] }, { ids: ["y"] }];
  const seg = segmentByCluster(rows, cs, (r) => r.ids);
  assert.deepEqual(seg.map((s) => [s.cluster !== null, s.items.length]), [[false, 1], [true, 2], [false, 1]]);
});
