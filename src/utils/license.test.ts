import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLicenseState,
  licenseNoticeSignature,
  shouldShowLicenseBanner,
  licenseNoticeTone,
  isAtSeatLimit,
  seatsRemaining,
  normalizeLicenseError,
  type LicenseState,
} from "./license.ts";

/** A healthy licence; override one field per case. */
const state = (overrides: Partial<LicenseState> = {}): LicenseState => ({
  configured: true,
  status: "active",
  valid: true,
  keyMasked: "CCRM-********DDDD",
  expiresAt: "2027-01-01",
  daysRemaining: 300,
  warnDays: 30,
  maxUsers: 10,
  seatsUsed: 4,
  customer: "Test s.r.o.",
  plan: "standard",
  activatedAt: "2026-01-01 10:00:00",
  lastCheckAt: "2026-08-28 09:00:00",
  lastAttemptAt: "2026-08-28 09:00:00",
  lastError: null,
  offlineDays: 0,
  updatesAllowed: true,
  updatesBlockedReason: null,
  ...overrides,
});

const banner = (overrides: Partial<Parameters<typeof shouldShowLicenseBanner>[0]> = {}) =>
  shouldShowLicenseBanner({
    state: state(),
    suppressedSignature: null,
    sessionDismissedSignature: null,
    isAdmin: true,
    ...overrides,
  });

test("parseLicenseState refuses anything that is not a licence state", () => {
  // The QA harness answers every unmocked /api/* call with this exact shape. A
  // lenient parser would turn it into a phantom "no licence" banner everywhere.
  assert.equal(parseLicenseState({ success: true, data: [] }), null);
  assert.equal(parseLicenseState(null), null);
  assert.equal(parseLicenseState(undefined), null);
  assert.equal(parseLicenseState("active"), null);
  assert.equal(parseLicenseState({ status: "made_up" }), null);
  assert.equal(parseLicenseState({}), null);
});

test("parseLicenseState reads a well-formed state and defaults the rest", () => {
  const parsed = parseLicenseState({ status: "expiring", configured: true, daysRemaining: 12 });
  assert.ok(parsed);
  assert.equal(parsed.status, "expiring");
  assert.equal(parsed.configured, true);
  assert.equal(parsed.daysRemaining, 12);
  // Absent fields fall back rather than becoming undefined holes in the UI.
  assert.equal(parsed.warnDays, 30);
  assert.equal(parsed.seatsUsed, 0);
  assert.equal(parsed.maxUsers, null);
  assert.equal(parsed.keyMasked, "");
});

test("parseLicenseState treats a missing updatesAllowed as allowed", () => {
  // Fail open: a backend too old to send the field must not read as "blocked".
  const parsed = parseLicenseState({ status: "active" });
  assert.equal(parsed?.updatesAllowed, true);
  assert.equal(parseLicenseState({ status: "expired", updatesAllowed: false })?.updatesAllowed, false);
});

test("parseLicenseState rejects a non-finite number rather than storing NaN", () => {
  const parsed = parseLicenseState({ status: "active", daysRemaining: Number.NaN, maxUsers: Infinity });
  assert.equal(parsed?.daysRemaining, null);
  assert.equal(parsed?.maxUsers, null);
});

test("the banner stays down for a healthy or unlicensed-by-design build", () => {
  assert.equal(banner({ state: state({ status: "active" }) }), false);
  assert.equal(banner({ state: state({ status: "unconfigured", configured: false }) }), false);
  assert.equal(banner({ state: null }), false);
  // Configured:false with any status at all — the product simply is not licensed.
  assert.equal(banner({ state: state({ status: "expired", configured: false }) }), false);
});

test("the banner comes up for every status worth reporting", () => {
  for (const status of ["expiring", "expired", "revoked", "suspended", "invalid"] as const) {
    assert.equal(banner({ state: state({ status }) }), true, status);
  }
});

test("an installation with no key at all is an admin's problem only", () => {
  assert.equal(banner({ state: state({ status: "none" }), isAdmin: true }), true);
  assert.equal(banner({ state: state({ status: "none" }), isAdmin: false }), false);
  // Everything else is shown to the whole team, admin or not.
  assert.equal(banner({ state: state({ status: "expiring" }), isAdmin: false }), true);
});

test("dismissals are keyed to the situation, not to the banner", () => {
  const expiring = state({ status: "expiring", daysRemaining: 12 });
  const signature = licenseNoticeSignature(expiring);

  assert.equal(banner({ state: expiring, suppressedSignature: signature }), false);
  assert.equal(banner({ state: expiring, sessionDismissedSignature: signature }), false);

  // Once it actually expires the situation has changed, so an earlier "don't
  // show again" must not keep the user in the dark about the new state.
  const expired = state({ status: "expired", daysRemaining: -1 });
  assert.equal(banner({ state: expired, suppressedSignature: signature }), true);

  // And replacing the key clears it too.
  const renewed = state({ status: "expiring", keyMasked: "CCRM-********ZZZZ" });
  assert.equal(banner({ state: renewed, suppressedSignature: signature }), true);
});

test("the signature changes with status, expiry and key, and with nothing else", () => {
  const base = state({ status: "expiring" });
  assert.equal(licenseNoticeSignature(base), licenseNoticeSignature(state({ status: "expiring", seatsUsed: 99 })));
  assert.notEqual(licenseNoticeSignature(base), licenseNoticeSignature(state({ status: "expired" })));
  assert.notEqual(licenseNoticeSignature(base), licenseNoticeSignature(state({ status: "expiring", expiresAt: "2028-01-01" })));
  assert.notEqual(licenseNoticeSignature(base), licenseNoticeSignature(state({ status: "expiring", keyMasked: "X" })));
});

test("tone escalates once the licence is actually gone", () => {
  assert.equal(licenseNoticeTone(state({ status: "expiring" })), "warning");
  for (const status of ["expired", "revoked", "suspended", "invalid", "none"] as const) {
    assert.equal(licenseNoticeTone(state({ status })), "danger", status);
  }
});

test("seat arithmetic", () => {
  assert.equal(isAtSeatLimit(state({ maxUsers: 10, seatsUsed: 4 })), false);
  assert.equal(isAtSeatLimit(state({ maxUsers: 10, seatsUsed: 10 })), true);
  // Over the limit after a downgrade: still "at the limit", never negative room.
  assert.equal(isAtSeatLimit(state({ maxUsers: 10, seatsUsed: 12 })), true);
  assert.equal(seatsRemaining(state({ maxUsers: 10, seatsUsed: 12 })), 0);
  assert.equal(seatsRemaining(state({ maxUsers: 10, seatsUsed: 4 })), 6);
  // No licence, or a licence without a ceiling, caps nothing.
  assert.equal(isAtSeatLimit(state({ maxUsers: null })), false);
  assert.equal(isAtSeatLimit(null), false);
  assert.equal(seatsRemaining(state({ maxUsers: null })), null);
  assert.equal(seatsRemaining(null), null);
});

test("unknown server error codes collapse to `unknown` instead of reaching the UI", () => {
  assert.equal(normalizeLicenseError("unknown_key"), "unknown_key");
  assert.equal(normalizeLicenseError("rate_limited"), "rate_limited");
  assert.equal(normalizeLicenseError("<script>alert(1)</script>"), "unknown");
  assert.equal(normalizeLicenseError(null), "unknown");
  assert.equal(normalizeLicenseError(42), "unknown");
});
