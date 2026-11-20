import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectTimelineEvent } from "../types/index.ts";
import type { ProjectPush } from "./projectPushesApi.ts";
import { firstLine, isPushItem, mergePushesIntoTimeline, pushLocalStamp } from "./projectPushTimeline.ts";

/** The UTC instant ("...Z") of a local wall-clock time, so the tests hold in any time zone. */
const utc = (y: number, m: number, d: number, hh = 12, mm = 0): string => new Date(y, m - 1, d, hh, mm).toISOString();
const event = (id: string, timestamp: string): ProjectTimelineEvent => ({ id, type: "note", timestamp, title: id });
const push = (id: string, pushedAt: string): ProjectPush => ({
  id, deliveryId: null, branch: "main", pushedAt, pusher: "dev", commitCount: 1, headSha: null, headMessage: null, compareUrl: null,
});
const ids = (list: ReturnType<typeof mergePushesIntoTimeline>) => list.map((entry) => entry.id);

test("no pushes: the events come back as they are", () => {
  const events = [event("e1", "2026-11-10 09:00")];
  assert.equal(mergePushesIntoTimeline(events, []), events);
});

test("pushes are woven into a newest-first list by time, the events keep their order", () => {
  const events = [event("e1", "2026-11-18 09:00"), event("e2", "2026-11-12 09:00"), event("e3", "2026-11-05 09:00")];
  const pushes = [push("p3", utc(2026, 11, 3)), push("p2", utc(2026, 11, 12, 10)), push("p1", utc(2026, 11, 19))];
  assert.deepEqual(ids(mergePushesIntoTimeline(events, pushes)), ["push:p1", "e1", "push:p2", "e2", "e3", "push:p3"]);
});

test("pushes arriving oldest first are sorted before they are woven in", () => {
  const events = [event("e1", "2026-11-10 09:00")];
  const merged = mergePushesIntoTimeline(events, [push("old", utc(2026, 11, 1)), push("new", utc(2026, 11, 15))]);
  assert.deepEqual(ids(merged), ["push:new", "e1", "push:old"]);
});

test("an event with an unreadable timestamp keeps its place and never moves a push", () => {
  const events = [event("bad", "soon"), event("e1", "2026-11-10 09:00")];
  assert.deepEqual(ids(mergePushesIntoTimeline(events, [push("p", utc(2026, 11, 15))])), ["bad", "push:p", "e1"]);
});

test("a push with an unreadable time is dropped", () => {
  assert.deepEqual(ids(mergePushesIntoTimeline([event("e1", "2026-11-10 09:00")], [push("p", "garbage")])), ["e1"]);
});

test("only push items are told apart from events, and an id never clashes with an event", () => {
  const merged = mergePushesIntoTimeline([event("p1", "2026-11-10 09:00")], [push("p1", utc(2026, 11, 15))]);
  assert.deepEqual(merged.map(isPushItem), [true, false]);
  assert.deepEqual(ids(merged), ["push:p1", "p1"]);
});

test("pushLocalStamp is the local wall clock in the timeline's own format", () => {
  assert.equal(pushLocalStamp(utc(2026, 11, 3, 7, 5)), "2026-11-03 07:05");
  assert.equal(pushLocalStamp("garbage"), "");
});

test("firstLine takes the subject of a commit message", () => {
  assert.equal(firstLine("Fix the thing\n\nLong body"), "Fix the thing");
  assert.equal(firstLine("  Windows line\r\nbody "), "Windows line");
  assert.equal(firstLine(null), "");
  assert.equal(firstLine(""), "");
});
