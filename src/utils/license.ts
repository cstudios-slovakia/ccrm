/**
 * Licence state as the SPA sees it.
 *
 * The backend (api/license.php) answers in stable status and error CODES rather
 * than sentences, so all three interface languages stay in translations.ts and a
 * raw server string can never appear untranslated in the UI. This module owns
 * the parsing, the "should the banner be up" decision and the dismissal rules;
 * everything here is pure and unit-tested in license.test.ts.
 *
 * Nothing in this file, and nothing that reads it, may disable part of the CRM.
 * A licence problem produces a banner and a settings notice — that is all. See
 * the header of api/license_client.php for why.
 */

export type LicenseStatus =
  /** No signing key compiled into this build — the product is not licensed at all. */
  | "unconfigured"
  /** Licensing is live, but this installation has never activated a key. */
  | "none"
  /** A licence is stored, but its token does not verify for this installation. */
  | "invalid"
  /** The vendor withdrew it. */
  | "revoked"
  /** The vendor paused it (unpaid invoice, dispute). */
  | "suspended"
  /** Past its expiry date. */
  | "expired"
  /** Valid, but inside the warning window. */
  | "expiring"
  /** Valid, nothing to say. */
  | "active";

const LICENSE_STATUSES: LicenseStatus[] = [
  "unconfigured", "none", "invalid", "revoked", "suspended", "expired", "expiring", "active",
];

export interface LicenseState {
  configured: boolean;
  status: LicenseStatus;
  /** True only for `active` and `expiring`. */
  valid: boolean;
  /** e.g. `CCRM-********DDDD`. The full key is never sent to the browser. */
  keyMasked: string;
  expiresAt: string | null;
  /** Negative once expired. Null when the licence carries no expiry. */
  daysRemaining: number | null;
  /** How many days before expiry the warning starts. */
  warnDays: number;
  /** Seat ceiling, or null for unlimited / no licence. */
  maxUsers: number | null;
  seatsUsed: number;
  customer: string | null;
  plan: string | null;
  activatedAt: string | null;
  lastCheckAt: string | null;
  lastAttemptAt: string | null;
  /** Diagnostic from the last failed check. Admins only. */
  lastError: string | null;
  /** Days since the last SUCCESSFUL licence-server check. */
  offlineDays: number | null;
  updatesAllowed: boolean;
  updatesBlockedReason: string | null;
}

/** Error codes api/license.php can return. Anything else falls back to `unknown`. */
export type LicenseErrorCode =
  | "not_configured" | "malformed_key" | "unknown_key" | "revoked" | "suspended"
  | "expired" | "instance_limit" | "rate_limited" | "unreachable" | "bad_response"
  | "bad_endpoint" | "no_curl" | "bad_signature" | "wrong_instance" | "key_mismatch"
  | "replayed_response" | "stale_token" | "store_failed" | "instance_unavailable"
  | "rejected" | "no_license" | "unknown";

const LICENSE_ERROR_CODES: LicenseErrorCode[] = [
  "not_configured", "malformed_key", "unknown_key", "revoked", "suspended",
  "expired", "instance_limit", "rate_limited", "unreachable", "bad_response",
  "bad_endpoint", "no_curl", "bad_signature", "wrong_instance", "key_mismatch",
  "replayed_response", "stale_token", "store_failed", "instance_unavailable",
  "rejected", "no_license", "unknown",
];

export const normalizeLicenseError = (raw: unknown): LicenseErrorCode =>
  (typeof raw === "string" && (LICENSE_ERROR_CODES as string[]).includes(raw))
    ? (raw as LicenseErrorCode)
    : "unknown";

const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Defensively read a licence state off the wire.
 *
 * Returns null for anything that is not recognisably a licence state — which is
 * not paranoia: the QA suite answers every unmocked `/api/*` call with a generic
 * `{ success: true, data: [] }`, and a lenient parser would turn that into a
 * bogus "no licence" banner across the whole audit.
 */
export const parseLicenseState = (raw: unknown): LicenseState | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const status = source.status;
  if (typeof status !== "string" || !(LICENSE_STATUSES as string[]).includes(status)) {
    return null;
  }
  return {
    configured: source.configured === true,
    status: status as LicenseStatus,
    valid: source.valid === true,
    keyMasked: typeof source.keyMasked === "string" ? source.keyMasked : "",
    expiresAt: asString(source.expiresAt),
    daysRemaining: asNumber(source.daysRemaining),
    warnDays: asNumber(source.warnDays) ?? 30,
    maxUsers: asNumber(source.maxUsers),
    seatsUsed: asNumber(source.seatsUsed) ?? 0,
    customer: asString(source.customer),
    plan: asString(source.plan),
    activatedAt: asString(source.activatedAt),
    lastCheckAt: asString(source.lastCheckAt),
    lastAttemptAt: asString(source.lastAttemptAt),
    lastError: asString(source.lastError),
    offlineDays: asNumber(source.offlineDays),
    updatesAllowed: source.updatesAllowed !== false,
    updatesBlockedReason: asString(source.updatesBlockedReason),
  };
};

/**
 * Identity of the SITUATION the banner is reporting, not of the banner.
 *
 * "Don't show this again" is stored against this string, so dismissing a
 * "expires in 21 days" notice does not also silence "your licence expired" three
 * weeks later, and entering a new key clears every earlier dismissal. Deriving
 * it from status + expiry + key is what makes those three things true.
 */
export const licenseNoticeSignature = (state: LicenseState): string =>
  [state.status, state.expiresAt ?? "", state.keyMasked].join("|");

/** Statuses that produce a banner at all. `active` and `unconfigured` never do. */
const BANNER_STATUSES: LicenseStatus[] = ["expiring", "expired", "revoked", "suspended", "invalid", "none"];

export interface BannerDecisionInput {
  state: LicenseState | null;
  /** Signature the user chose never to see again (DB-backed preference). */
  suppressedSignature: string | null;
  /** Signature closed for this browser session only. */
  sessionDismissedSignature: string | null;
  isAdmin: boolean;
}

/**
 * Should the licence banner be on screen?
 *
 * `none` — an installation that never entered a key — is shown to ADMINS only.
 * Everyone else would see a notice about a purchase they cannot make, on an app
 * that is working perfectly; the people who can act on it still get it. Every
 * other reportable status is shown to everyone, because a licence lapsing is
 * something a whole team benefits from noticing early.
 */
export const shouldShowLicenseBanner = ({
  state,
  suppressedSignature,
  sessionDismissedSignature,
  isAdmin,
}: BannerDecisionInput): boolean => {
  if (!state || !state.configured) return false;
  if (!BANNER_STATUSES.includes(state.status)) return false;
  if (state.status === "none" && !isAdmin) return false;
  const signature = licenseNoticeSignature(state);
  if (suppressedSignature === signature) return false;
  if (sessionDismissedSignature === signature) return false;
  return true;
};

/** How loudly the banner should read. */
export type LicenseNoticeTone = "warning" | "danger";

export const licenseNoticeTone = (state: LicenseState): LicenseNoticeTone =>
  state.status === "expiring" ? "warning" : "danger";

/** True when the team is at or over its licensed seat count. */
export const isAtSeatLimit = (state: LicenseState | null): boolean =>
  !!state && state.maxUsers !== null && state.seatsUsed >= state.maxUsers;

/** Seats left, or null when the licence does not cap them. */
export const seatsRemaining = (state: LicenseState | null): number | null =>
  state && state.maxUsers !== null ? Math.max(0, state.maxUsers - state.seatsUsed) : null;

// ---------------------------------------------------------------------------
// Session-scoped "Close"
//
// Closing the banner hides it until the tab is closed; "don't show again" is the
// durable one and lives in the user's DB-backed preferences. sessionStorage is
// the right home for the first: it is per tab and it is allowed to be lost.
// main.tsx has already swapped in an in-memory stand-in on the browsers where
// touching it throws (utils/safeStorage), and the try/catch covers the rest.
// ---------------------------------------------------------------------------

const SESSION_DISMISS_KEY = "ccrm_license_notice_closed";

export const readSessionDismissal = (): string | null => {
  try {
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY);
  } catch {
    return null;
  }
};

export const writeSessionDismissal = (signature: string): void => {
  try {
    window.sessionStorage.setItem(SESSION_DISMISS_KEY, signature);
  } catch {
    /* storage unavailable — the banner simply comes back on the next render */
  }
};
