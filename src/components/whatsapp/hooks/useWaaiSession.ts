import { useCallback, useEffect, useState } from "react";
import type { MetaResponse } from "../api/contract.ts";
import { fetchSsoToken } from "../api/crmConnection.ts";
import { REQUIRED_WAAI_API, WaaiApiError, WaaiClient } from "../api/waaiClient.ts";

/** Where the module stands with WAAI. Everything but `ready` is a screen of its own. */
export type SessionState =
  | { kind: "connecting" }
  | { kind: "ready"; client: WaaiClient; meta: MetaResponse }
  /** The CRM user has no WAAI user mapped to them. */
  | { kind: "not_linked" }
  /** The CRM and WAAI speak different major versions of the module API. */
  | { kind: "needs_update"; waaiVersion: number }
  /** WAAI has no sign-in secret (or CRM address) configured. */
  | { kind: "waai_not_ready" }
  /** The CRM has no usable connection. */
  | { kind: "crm_not_configured" }
  /** The CRM refused this user. */
  | { kind: "forbidden" }
  /** WAAI could not be reached or failed. */
  | { kind: "unreachable"; code: string; retryAfter: number | null };

/** The state a failed call leaves the module in. */
export function stateFromError(err: unknown): SessionState {
  if (err instanceof WaaiApiError) {
    switch (err.code) {
      case "not_linked":
        return { kind: "not_linked" };
      case "sso_not_configured":
        return { kind: "waai_not_ready" };
      case "crm_not_configured":
        return { kind: "crm_not_configured" };
      case "crm_forbidden":
        return { kind: "forbidden" };
      default:
        return { kind: "unreachable", code: err.code, retryAfter: err.retryAfter };
    }
  }
  return { kind: "unreachable", code: "network", retryAfter: null };
}

/**
 * Open a session with WAAI at `base`, read `/meta` and keep the client for the other hooks. Signs out at
 * WAAI (best effort) when the module goes away or `retry` starts over. `base` null = do nothing yet.
 */
export function useWaaiSession(base: string | null): { state: SessionState; retry: () => void } {
  const [state, setState] = useState<SessionState>({ kind: "connecting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    const client = new WaaiClient({ base, fetchSsoToken: () => fetchSsoToken() });
    setState({ kind: "connecting" });
    (async () => {
      try {
        const session = await client.open();
        if (session.api_version !== REQUIRED_WAAI_API) {
          if (!cancelled) setState({ kind: "needs_update", waaiVersion: session.api_version });
          return;
        }
        const meta = await client.get<MetaResponse>("/meta");
        if (!cancelled) setState({ kind: "ready", client, meta });
      } catch (err) {
        if (!cancelled) setState(stateFromError(err));
      }
    })();
    return () => {
      cancelled = true;
      void client.signOut();
    };
  }, [base, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
