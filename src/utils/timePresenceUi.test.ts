import test from "node:test";
import assert from "node:assert/strict";
import { formatCountdown, minutesLeft, presenceTabTitle, ringArcs } from "./timePresenceUi.ts";
import { stripTimerTitle } from "./timeContainer.ts";

test("ringArcs: tracking fills by fraction, question pulses the last sixth, others empty", () => {
  assert.equal(ringArcs("tracking", 0.5).filled, 50);
  assert.equal(ringArcs("tracking", 7).filled, 100);
  const q = ringArcs("question", 0.9);
  assert.ok(q.alert && Math.abs(q.alert.start + q.alert.length - 100) < 1e-9);
  assert.equal(ringArcs("paused", 1).filled, 0);
  assert.equal(ringArcs("idle", 0.4).alert, null);
});

test("formatCountdown and minutesLeft", () => {
  assert.equal(formatCountdown(252), "4:12");
  assert.equal(formatCountdown(-3), "0:00");
  assert.equal(formatCountdown(null), "0:00");
  assert.equal(minutesLeft(61), 2);
  assert.equal(minutesLeft(0), 1);
});

test("presenceTabTitle by phase, and stripTimerTitle undoes it", () => {
  const base = { base: "CCRM", workedSec: 75, secondsToPause: 552, questionLabel: "Still working?", pausedLabel: "Paused" };
  const q = presenceTabTitle({ ...base, phase: "question", runningCount: 1 });
  assert.equal(q, "⏰ 9:12 · Still working? · CCRM");
  assert.equal(stripTimerTitle(q), "CCRM");
  const p = presenceTabTitle({ ...base, phase: "paused", runningCount: 0 });
  assert.equal(p, "⏸ Paused · CCRM");
  assert.equal(stripTimerTitle(p), "CCRM");
  assert.equal(presenceTabTitle({ ...base, phase: "tracking", runningCount: 1 }), "▶ 0:01:15 · CCRM");
  assert.equal(presenceTabTitle({ ...base, phase: "idle", runningCount: 0 }), "CCRM");
});
