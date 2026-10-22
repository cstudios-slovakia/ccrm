import type { UserProfile } from "../types/index.ts";

/** The slice of a /sync.php GET answer that says who the server session belongs to. */
interface SyncSessionAnswer {
  authenticated?: boolean;
  sessionUser?: { email?: string | null } | null;
  users?: UserProfile[] | null;
}

/**
 * The user a still-valid server session belongs to, taken from a sync answer.
 *
 * The login lives in a PHP session cookie that outlasts the tab ("Remember me"),
 * while the app keeps its current user in per-tab sessionStorage. A fresh tab
 * therefore starts logged out although the server would happily serve it data.
 * This finds the matching entry in the answer's own users list, so the first
 * pull can sign the tab back in without a login screen in between.
 *
 * Only an explicit `authenticated: true` counts, and the e-mail must match a row
 * the server sent: a missing, empty or unknown address adopts nobody.
 */
export function adoptableSessionUser(data: SyncSessionAnswer | null | undefined): UserProfile | null {
  if (!data || data.authenticated !== true) return null;
  const email = String(data.sessionUser?.email ?? "").trim().toLowerCase();
  if (email === "" || !Array.isArray(data.users)) return null;
  return data.users.find((u) => String(u?.email ?? "").trim().toLowerCase() === email) ?? null;
}
