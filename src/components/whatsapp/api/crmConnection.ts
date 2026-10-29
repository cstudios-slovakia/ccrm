import { WaaiApiError } from "./waaiClient.ts";

/**
 * What the CRM itself says about the WhatsApp module: how it is set up (GET `api/waai_sso.php`) and a
 * sign-in token for the current user (POST, 60 seconds, one use). The CRM never calls WAAI; the browser does.
 */

export interface ModuleConfig {
  /** An active connection with a sign-in secret (and a WAAI address where the setup needs one). */
  configured: boolean;
  /** The user may change the connection (administrator). */
  canManage: boolean;
  /** Which interface the module shows. */
  ui: "native" | "embedded";
  /** `proxy`: WAAI is reached through this CRM's `/waai-api` path. `direct`: at WAAI's own address. */
  transport: "proxy" | "direct";
  /** What the native module calls: `/waai-api`, or `<WAAI address>/api/ccrm/v1`. */
  base: string;
  /** The standalone WAAI, when the connection names one. */
  standaloneUrl: string | null;
  /** The CRM user id. */
  userId: string;
}

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/** The GET answer, checked field by field; null when it is not what the endpoint sends. */
export function parseModuleConfig(body: unknown): ModuleConfig | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.success !== true) return null;
  const module = b.module;
  if (typeof module !== "object" || module === null) return null;
  const m = module as Record<string, unknown>;
  if ((m.ui !== "native" && m.ui !== "embedded") || (m.transport !== "proxy" && m.transport !== "direct")) return null;
  if (m.base !== "/waai-api" && !isHttpUrl(m.base)) return null;
  return {
    configured: b.configured === true,
    canManage: b.can_manage === true,
    ui: m.ui,
    transport: m.transport,
    base: m.base as string,
    standaloneUrl: isHttpUrl(b.standalone_url) ? b.standalone_url : null,
    userId: typeof b.user_id === "string" ? b.user_id : "",
  };
}

export async function fetchModuleConfig(fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<ModuleConfig> {
  let res: Response;
  try {
    res = await fetchImpl("/api/waai_sso.php", { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new WaaiApiError(0, "network", "The CRM could not be reached.");
  }
  const body = await res.json().catch(() => null);
  const config = res.ok ? parseModuleConfig(body) : null;
  if (!config) throw new WaaiApiError(res.status, res.status === 403 ? "crm_forbidden" : "crm_error", "The CRM did not describe the WhatsApp connection.");
  return config;
}

/** A sign-in token for the current CRM user, as the `fetchSsoToken` of a `WaaiClient`. */
export async function fetchSsoToken(fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl("/api/waai_sso.php", { method: "POST", credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new WaaiApiError(0, "network", "The CRM could not be reached.");
  }
  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  if (res.ok && typeof body?.token === "string" && body.token.length > 0) return body.token;
  if (res.status === 409) throw new WaaiApiError(409, "crm_not_configured", "The WhatsApp connection is not set up.");
  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After"));
    throw new WaaiApiError(429, "rate_limited", "Too many sign-ins.", null, Number.isFinite(retry) && retry > 0 ? retry : null);
  }
  if (res.status === 401 || res.status === 403) throw new WaaiApiError(res.status, "crm_forbidden", "The CRM refused the sign-in.");
  throw new WaaiApiError(res.status, "crm_error", "The CRM could not issue a sign-in token.");
}
