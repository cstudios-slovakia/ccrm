import { test } from "node:test";
import assert from "node:assert/strict";
import { nextChimeDelayMs, playPresenceSound, sanitizePresenceSound, unlockPresenceAudio } from "./presenceSound.ts";

test("nextChimeDelayMs: 20 s in the first half of the window, 8 s in the second, null outside", () => {
  assert.equal(nextChimeDelayMs(600, 600), 20_000);
  assert.equal(nextChimeDelayMs(301, 600), 20_000);
  assert.equal(nextChimeDelayMs(300, 600), 8_000);
  assert.equal(nextChimeDelayMs(1, 600), 8_000);
  assert.equal(nextChimeDelayMs(0, 600), null);
  assert.equal(nextChimeDelayMs(null, 600), null);
  assert.equal(nextChimeDelayMs(100, 0), null);
});

test("sanitizePresenceSound clamps and defaults", () => {
  assert.deepEqual(sanitizePresenceSound(null), { volume: 0.6, muted: false, sound: "chimeA" });
  assert.deepEqual(sanitizePresenceSound({ volume: 3, muted: true, sound: "chimeC" }), { volume: 1, muted: true, sound: "chimeC" });
  assert.equal(sanitizePresenceSound({ volume: -1, sound: "x" }).volume, 0);
  assert.equal(sanitizePresenceSound({ sound: "x" }).sound, "chimeA");
});

test("audio helpers are safe without a browser", () => {
  assert.equal(unlockPresenceAudio(), null);
  assert.doesNotThrow(() => playPresenceSound("chimeB", 0.5));
});
