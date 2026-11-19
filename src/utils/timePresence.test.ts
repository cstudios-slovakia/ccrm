import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimePresence } from "./timeTrackingApi.ts";
import {
  isPausing,
  nextPresenceBoundary,
  presencePhase,
  presenceView,
  ringFraction,
  secondsToExpiry,
  secondsToPause,
  secondsToPrompt,
} from "./timePresence.ts";

const ANCHOR = Date.parse("2026-11-19T09:00:00Z");
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const at = (minutes: number) => ANCHOR + minutes * MIN;

/** A running cycle with the defaults: question at 50, pause at 60. */
const cycle = (over: Partial<TimePresence> = {}): TimePresence => ({
  enabled: true,
  anchorAt: iso(ANCHOR),
  promptAt: iso(at(50)),
  deadlineAt: iso(at(60)),
  phase: "tracking",
  autoPausedAt: null,
  resumeUntil: null,
  ...over,
});

const pausedState = (over: Partial<TimePresence> = {}): TimePresence => ({
  enabled: true,
  anchorAt: null,
  promptAt: null,
  deadlineAt: null,
  phase: "paused",
  autoPausedAt: iso(at(60)),
  resumeUntil: iso(at(70)),
  ...over,
});

test("no presence is idle", () => {
  assert.equal(presencePhase(null, ANCHOR), "idle");
  assert.equal(ringFraction(null, ANCHOR), 0);
  assert.equal(secondsToPause(null, ANCHOR), null);
  assert.equal(presenceView(null, ANCHOR).phase, "idle");
});

test("server idle stays idle", () => {
  const idle = cycle({ phase: "idle", anchorAt: null, promptAt: null, deadlineAt: null });
  assert.equal(presencePhase(idle, at(55)), "idle");
  assert.equal(nextPresenceBoundary(idle), null);
});

test("tracking until promptAt, question until deadlineAt, then paused locally", () => {
  const p = cycle();
  assert.equal(presencePhase(p, at(0)), "tracking");
  assert.equal(presencePhase(p, at(50) - 1), "tracking");
  assert.equal(presencePhase(p, at(50)), "question");
  assert.equal(presencePhase(p, at(60) - 1), "question");
  assert.equal(presencePhase(p, at(60)), "paused");
  assert.equal(isPausing(p, at(60) - 1), false);
  assert.equal(isPausing(p, at(60)), true);
});

test("the local phase wins over a stale server phase", () => {
  // The server answered "question" a moment ago; a confirm elsewhere moved the anchor: timestamps rule.
  assert.equal(presencePhase(cycle({ phase: "question" }), at(10)), "tracking");
});

test("ring fills over promptAfter + confirmWindow and clamps", () => {
  const p = cycle();
  assert.equal(ringFraction(p, at(0)), 0);
  assert.equal(ringFraction(p, at(30)), 0.5);
  assert.equal(ringFraction(p, at(60)), 1);
  assert.equal(ringFraction(p, at(90)), 1);
  assert.equal(ringFraction(p, at(-5)), 0);
  assert.equal(ringFraction(pausedState(), at(65)), 0);
});

test("countdowns to prompt, pause and expiry", () => {
  const p = cycle();
  assert.equal(secondsToPrompt(p, at(49)), 60);
  assert.equal(secondsToPause(p, at(52)), 8 * 60);
  assert.equal(secondsToPause(p, at(52) + 500), 8 * 60); // rounds up: never shows 0 before the deadline
  assert.equal(secondsToPause(p, at(61)), 0);
  assert.equal(secondsToExpiry(p, at(52)), null);
  assert.equal(secondsToExpiry(pausedState(), at(64)), 6 * 60);
});

test("paused until the resume window ends, then idle", () => {
  const p = pausedState();
  assert.equal(presencePhase(p, at(65)), "paused");
  assert.equal(presencePhase(p, at(70)), "idle");
  assert.equal(isPausing(p, at(65)), false);
  assert.equal(nextPresenceBoundary(p), at(70));
  // A manual pause has no window: it stays paused.
  assert.equal(presencePhase(pausedState({ resumeUntil: null }), at(500)), "paused");
});

test("a server clock offset shifts every boundary", () => {
  // This device is 3 minutes behind: the provider passes Date.now() + offset.
  const offset = 3 * MIN;
  const deviceNow = at(48);
  assert.equal(presencePhase(cycle(), deviceNow), "tracking");
  assert.equal(presencePhase(cycle(), deviceNow + offset), "question");
  assert.equal(secondsToPause(cycle(), deviceNow + offset), 9 * 60);
});

test("disabled presence never asks: tracking with an empty ring and no countdowns", () => {
  const off = cycle({ enabled: false });
  assert.equal(presencePhase(off, at(55)), "tracking");
  assert.equal(presencePhase(off, at(500)), "tracking");
  assert.equal(isPausing(off, at(500)), false);
  assert.equal(ringFraction(off, at(30)), 0);
  assert.equal(secondsToPause(off, at(30)), null);
  assert.equal(nextPresenceBoundary(off), null);
  // Running without an anchor from the server (should not happen): tracking, no question.
  assert.equal(presencePhase(cycle({ enabled: false, anchorAt: null }), at(55)), "tracking");
});

test("the next boundary of a running cycle is its deadline", () => {
  assert.equal(nextPresenceBoundary(cycle()), at(60));
  const v = presenceView(cycle(), at(55));
  assert.deepEqual(v, { phase: "question", pausing: false, ringFraction: 55 / 60, secondsToPrompt: 0, secondsToPause: 300, secondsToExpiry: null });
});
