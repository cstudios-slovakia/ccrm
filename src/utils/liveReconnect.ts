/**
 * Reconnect decisions for the Meeting Room focus helper. Pure, so the timing rules are testable
 * without a browser.
 *
 * A Realtime session lives at most 60 minutes (OpenAI "Managing conversations" guide), and Wi-Fi
 * drops happen, so a meeting that is still being recorded reconnects on its own: after 1 s, then
 * 3 s, then 10 s, and only then gives up into the visible error with a Retry button. Shortly
 * before the 60 minute limit the session is replaced proactively (new one first, old one closed
 * after), so there is no gap.
 */

export const RECONNECT_BACKOFF_MS: readonly number[] = [1000, 3000, 10000];

/** OpenAI's documented Realtime session limit. */
export const SESSION_MAX_MS = 60 * 60 * 1000;
/** Replace the session this long before the limit. */
export const ROTATE_MARGIN_MS = 5 * 60 * 1000;
/** A session that stayed up this long counts as healthy: the failure streak starts over. */
export const HEALTHY_AFTER_MS = 30 * 1000;

/** Delay before reconnect attempt number `failures` (0 = the first), or null to give up. */
export const nextReconnectDelay = (failures: number): number | null =>
  failures >= 0 && failures < RECONNECT_BACKOFF_MS.length ? RECONNECT_BACKOFF_MS[failures] : null;

/** How long after it went live a session should be replaced. */
export const rotateAfterMs = (maxMs = SESSION_MAX_MS, marginMs = ROTATE_MARGIN_MS): number =>
  Math.max(0, maxMs - marginMs);

/** A drop after a healthy stretch resets the streak; one right after connecting keeps counting. */
export const failuresAfterDrop = (failures: number, liveMs: number): number =>
  liveMs >= HEALTHY_AFTER_MS ? 0 : failures;

/**
 * The docs name no error code for an expired session, so an `error` event counts as expiry when
 * its code or message says so. Anything else is a real server error and is not retried blindly.
 */
export const isSessionExpiredError = (err: { code?: unknown; message?: unknown; type?: unknown } | null | undefined): boolean => {
  if (!err) return false;
  const text = [err.code, err.type, err.message].filter((x) => typeof x === "string").join(" ").toLowerCase();
  return /expired|max(?:imum)?[ _-]*(?:session[ _-]*)?duration|session[ _-]*(?:limit|timeout)/.test(text);
};
