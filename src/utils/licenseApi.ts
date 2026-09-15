/**
 * Network side of licensing: the four calls the SPA makes to api/license.php.
 *
 * Kept apart from utils/license.ts on purpose. That module is pure — no imports,
 * no fetch, no DOM — which is what lets `node --test` run its rules directly
 * over the TypeScript source. Everything that needs the network lives here.
 */

import { fetchWithTimeout } from "./fetchWithTimeout";
import { parseLicenseState, normalizeLicenseError } from "./license";
import type { LicenseState, LicenseErrorCode } from "./license";

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

const LICENSE_ENDPOINT = "/api/license.php";

export interface LicenseActionResult {
  ok: boolean;
  error: LicenseErrorCode | null;
  state: LicenseState | null;
}

/** Current licence state, or null when it cannot be read (never throws). */
export const fetchLicenseState = async (): Promise<LicenseState | null> => {
  try {
    const res = await fetchWithTimeout(`${LICENSE_ENDPOINT}?action=status`, {}, 20000);
    if (!res.ok) return null;
    const json = await res.json();
    return parseLicenseState(json?.license);
  } catch {
    return null;
  }
};

const postLicenseAction = async (
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<LicenseActionResult> => {
  try {
    const res = await fetchWithTimeout(
      LICENSE_ENDPOINT,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs
    );
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* a non-JSON body is reported as a transport failure below */
    }
    if (!json || typeof json !== "object") {
      return { ok: false, error: "bad_response", state: null };
    }
    return {
      ok: json.success === true,
      error: json.success === true ? null : normalizeLicenseError(json.error),
      state: parseLicenseState(json.license),
    };
  } catch {
    // AbortError (timeout) or a dropped connection. "unreachable" is the honest
    // report: we cannot tell a dead network from a dead licence server here.
    return { ok: false, error: "unreachable", state: null };
  }
};

/**
 * Send a licence key — or a signed offline token — to the backend.
 * The backend decides which it is; one field takes both.
 */
export const activateLicense = (keyOrToken: string): Promise<LicenseActionResult> =>
  // Generous timeout: this hop involves a second round trip from our server to
  // the licence server, and it is a deliberate, once-a-year action.
  postLicenseAction({ action: "activate", key: keyOrToken }, 45000);

export const refreshLicense = (): Promise<LicenseActionResult> =>
  postLicenseAction({ action: "refresh" }, 45000);

export const removeLicense = (): Promise<LicenseActionResult> =>
  postLicenseAction({ action: "remove" }, 20000);
