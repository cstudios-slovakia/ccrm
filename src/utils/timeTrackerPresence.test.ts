import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alertFrameBadge,
  badgeFor,
  iconSetFor,
  localPhase,
  type PresenceSnapshot,
} from "../../extensions/chrome-time-tracker/src/presence.ts";
import { EXTENSION_VERSION } from "./timeTrackerRules.ts";

describe("Chrome time tracker presence & pulsing alert", () => {
  it("keeps EXTENSION_VERSION in sync with manifest.json", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "extensions/chrome-time-tracker/public/manifest.json"), "utf8"),
    );
    assert.equal(manifest.version, EXTENSION_VERSION);
  });

  it("transitions tracking -> question at 50m -> paused past deadline when idle", () => {
    const base = Date.UTC(2026, 10, 24, 9, 0, 0);
    const snap: PresenceSnapshot = {
      presence: {
        enabled: true,
        phase: "tracking",
        anchorAt: new Date(base).toISOString(),
        promptAt: new Date(base + 50 * 60_000).toISOString(),
        deadlineAt: new Date(base + 60 * 60_000).toISOString(),
      },
      offsetMs: 0,
      count: 1,
      pausedCount: 0,
      firstStartAt: new Date(base).toISOString(),
      savedAt: base,
    };

    assert.equal(localPhase(snap, "active", base + 49 * 60_000), "tracking");
    assert.equal(localPhase(snap, "active", base + 50 * 60_000), "question");
    assert.equal(localPhase(snap, "idle", base + 61 * 60_000), "paused");
    assert.equal(localPhase(snap, "active", base + 61 * 60_000), "question");
  });

  it("cycles 4 pulsing alert frames and builds complete icon sets", () => {
    const f0 = alertFrameBadge(0, 9 * 60_000);
    const f1 = alertFrameBadge(1, 9 * 60_000);
    const f2 = alertFrameBadge(2, 9 * 60_000);
    const f3 = alertFrameBadge(3, 9 * 60_000);

    assert.equal(f0.iconPrefix, "alert-0");
    assert.equal(f1.iconPrefix, "alert-1");
    assert.equal(f2.iconPrefix, "alert-2");
    assert.equal(f3.iconPrefix, "alert-3");
    assert.equal(f0.text, "?");
    assert.equal(f2.text, "!");
    assert.equal(f3.text, "9m");
    assert.notEqual(f0.color, f1.color);

    const icons = iconSetFor("alert-2");
    assert.deepEqual(icons, {
      "16": "icons/alert-2-16.png",
      "32": "icons/alert-2-32.png",
      "48": "icons/alert-2-48.png",
      "128": "icons/alert-2-128.png",
    });
  });

  it("paints Nx badge for parallel timers and II when paused", () => {
    const snap: PresenceSnapshot = {
      presence: { enabled: true, phase: "tracking" },
      offsetMs: 0,
      count: 3,
      pausedCount: 0,
      firstStartAt: "2026-11-24T09:00:00Z",
      savedAt: Date.now(),
    };
    assert.equal(badgeFor(snap, "tracking", () => "12m").text, "3x");
    assert.equal(badgeFor(snap, "paused", () => "12m").text, "II");
    assert.equal(badgeFor(snap, "question", () => "12m").text, "?");
  });
});
