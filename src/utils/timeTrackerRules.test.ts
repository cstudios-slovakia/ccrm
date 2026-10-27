import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVITY_MERGE_GAP_MS,
  DEFAULT_ACTIVITY_MIN_MINUTES,
  EXTENSION_VERSION,
  OFFLINE_WINDOW_MS,
  PAIRING_TTL_MS,
  acceptClientTimestamp,
  acceptStoppedAt,
  badgeLabel,
  hostOnly,
  isOlderExtensionVersion,
  mergeActivityBlocks,
  normalizePairingCode,
  normalizeSitePattern,
  pairingCodeAccepted,
  pairingCodeMaterial,
  pairingCodeState,
  siteMatches,
  type ActivityBlock,
} from "./timeTrackerRules.ts";

const minute = 60 * 1000;

test("pairing code: XXXX-XXXX from the unambiguous alphabet, dash is display only", () => {
  assert.equal(normalizePairingCode("k7q4-9mzt"), "K7Q4-9MZT");
  assert.equal(normalizePairingCode("K7Q49MZT"), "K7Q4-9MZT");
  assert.equal(pairingCodeMaterial("K7Q4-9MZT"), "K7Q49MZT");
  assert.equal(normalizePairingCode("K7Q4-9MZ"), null);
  assert.equal(normalizePairingCode("OOOO-OOOO"), null);
  assert.equal(normalizePairingCode("K7Q4-0MZT"), null);
});

test("pairing code expires after 10 minutes and is single use", () => {
  const created = 1_700_000_000_000;
  const row = { expiresAtMs: created + PAIRING_TTL_MS, usedAtMs: null as number | null };
  assert.equal(PAIRING_TTL_MS, 10 * minute);
  assert.equal(pairingCodeState(row, row.expiresAtMs - 1), "valid");
  assert.equal(pairingCodeState(row, row.expiresAtMs), "expired");
  assert.equal(pairingCodeAccepted(row, row.expiresAtMs - 1), true);

  const used = { ...row, usedAtMs: row.expiresAtMs - 1000 };
  assert.equal(pairingCodeState(used, used.usedAtMs), "used");
  assert.equal(pairingCodeAccepted(used, used.usedAtMs), false);
  // Consumed stays consumed after the clock runs out.
  assert.equal(pairingCodeState(used, row.expiresAtMs + minute), "used");
});

test("offline timestamps: up to 24 hours old, never in the future, stop not before start", () => {
  const now = 1_700_000_000_000;
  assert.equal(OFFLINE_WINDOW_MS, 24 * 60 * minute);
  assert.equal(acceptClientTimestamp(now, now), true);
  assert.equal(acceptClientTimestamp(now - OFFLINE_WINDOW_MS, now), true);
  assert.equal(acceptClientTimestamp(now - OFFLINE_WINDOW_MS - 1, now), false);
  assert.equal(acceptClientTimestamp(now + 1, now), false);
  assert.equal(acceptClientTimestamp(Number.NaN, now), false);

  const start = now - 2 * 60 * minute;
  assert.equal(acceptStoppedAt(start, now - minute, now), true);
  assert.equal(acceptStoppedAt(start, start - 1, now), false);
  assert.equal(acceptStoppedAt(start, now + 1, now), false);
  assert.equal(acceptStoppedAt(start, now - OFFLINE_WINDOW_MS - 1, now), false);
});

test("activity blocks keep the host only and merge consecutive same-site time", () => {
  assert.equal(hostOnly("https://user:secret@github.com/acme/app?q=1#diff"), "github.com");
  assert.equal(hostOnly("http://www.github.com/acme"), "github.com");
  assert.equal(hostOnly("GitHub.com/acme/app"), "github.com");
  assert.equal(normalizeSitePattern("*.GitHub.com/path"), "*.github.com");
  assert.equal(siteMatches("https://docs.github.com/x", "github.com"), true);
  assert.equal(siteMatches("https://notgithub.com/x", "github.com"), false);

  const t0 = 1_700_000_000_000;
  const withSecrets = [
    {
      domain: "https://github.com/acme/app?q=1",
      pageTitle: "Pull request",
      startedAt: t0,
      endedAt: t0 + 6 * minute,
      url: "https://github.com/acme/app?q=1",
      content: "page body",
    },
  ] as ActivityBlock[];
  const kept = mergeActivityBlocks(withSecrets);
  assert.equal(kept.length, 1);
  assert.deepEqual(Object.keys(kept[0]).sort(), ["domain", "endedAt", "pageTitle", "startedAt"]);
  assert.equal(kept[0].domain, "github.com");
  assert.equal(JSON.stringify(kept).includes("/acme"), false);
  assert.equal(JSON.stringify(kept).includes("page body"), false);

  // Two 3-minute visits on the same site become one 6-minute block and survive the 5-minute floor.
  const merged = mergeActivityBlocks([
    { domain: "github.com", pageTitle: "First", startedAt: t0, endedAt: t0 + 3 * minute },
    { domain: "www.github.com", pageTitle: "Second", startedAt: t0 + 3 * minute, endedAt: t0 + 6 * minute },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].pageTitle, "Second");
  assert.equal(merged[0].endedAt - merged[0].startedAt, 6 * minute);

  // A lone visit under 5 minutes is dropped.
  assert.deepEqual(mergeActivityBlocks([{ domain: "github.com", pageTitle: "Peek", startedAt: t0, endedAt: t0 + 3 * minute }]), []);

  // A different site in between keeps the two visits apart when the gap exceeds 60s.
  const apart = mergeActivityBlocks([
    { domain: "github.com", pageTitle: "A", startedAt: t0, endedAt: t0 + 6 * minute },
    { domain: "slack.com", pageTitle: "B", startedAt: t0 + 6 * minute, endedAt: t0 + 12 * minute },
    { domain: "github.com", pageTitle: "C", startedAt: t0 + 12 * minute, endedAt: t0 + 18 * minute },
  ]);
  assert.equal(apart.length, 3);

  // 30s away still merges; just over the gap does not.
  const close = mergeActivityBlocks([
    { domain: "github.com", pageTitle: "A", startedAt: t0, endedAt: t0 + 6 * minute },
    { domain: "github.com", pageTitle: "B", startedAt: t0 + 6 * minute + 30_000, endedAt: t0 + 12 * minute },
  ]);
  assert.equal(close.length, 1);
  const split = mergeActivityBlocks(
    [
      { domain: "github.com", pageTitle: "A", startedAt: t0, endedAt: t0 + 6 * minute },
      { domain: "github.com", pageTitle: "B", startedAt: t0 + 6 * minute + ACTIVITY_MERGE_GAP_MS + 1, endedAt: t0 + 13 * minute },
    ],
    DEFAULT_ACTIVITY_MIN_MINUTES,
  );
  assert.equal(split.length, 2);
});

test("badge is h:mm and an older extension build is flagged", () => {
  assert.equal(badgeLabel(0), "0:00");
  assert.equal(badgeLabel(90), "0:01");
  assert.equal(badgeLabel(3600), "1:00");
  assert.equal(isOlderExtensionVersion("0.9.0"), true);
  assert.equal(isOlderExtensionVersion(EXTENSION_VERSION), false);
  assert.equal(isOlderExtensionVersion("9.0.0"), false);

  const manifest = JSON.parse(readFileSync(new URL("../../extensions/chrome-time-tracker/public/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, EXTENSION_VERSION);
  const php = readFileSync(new URL("../../public/api/time_tracker_lib.php", import.meta.url), "utf8");
  assert.match(php, new RegExp(`CCRM_TT_EXT_VERSION = '${EXTENSION_VERSION}'`));
});
