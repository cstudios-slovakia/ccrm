import { useCallback, useEffect, useRef, useState } from "react";
import type { MetaResponse } from "../api/contract.ts";
import { fetchSsoToken } from "../api/crmConnection.ts";
import { REQUIRED_WAAI_API, WaaiApiError, WaaiClient } from "../api/waaiClient.ts";
import { loadDemoDataset, type DemoDirectory } from "../demo/demoDataset.ts";
import { demoMedia } from "../demo/demoMedia.ts";
import { createDemoWaai, DEMO_BASE } from "../demo/demoRouter.ts";

/** Where the module stands with WAAI. Everything but `ready` is a screen of its own. */
export type SessionState =
  | { kind: "connecting" }
  /** `demo`: the client talks to the in-browser demo, not to a WAAI. */
  | { kind: "ready"; client: WaaiClient; meta: MetaResponse; demo: boolean }
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

/** What the demo needs from the CRM; `null` means "this is not a demo instance". */
export interface DemoOptions {
  directory: DemoDirectory;
  userId: string;
  language: string;
}

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
 * Demo mode shows demo chats when there is no working WAAI account behind the module (docs/WHATSAPP-DEMO-MODULE.md
 * B1): a connection that is not configured or not usable. `forbidden` is not on the list: demo mode does not
 * bypass permissions.
 */
export function wantsDemo(state: SessionState): boolean {
  switch (state.kind) {
    case "crm_not_configured":
    case "waai_not_ready":
    case "not_linked":
    case "needs_update":
    case "unreachable":
      return true;
    case "ready":
      return !state.demo && state.meta.wa_accounts.length === 0;
    default:
      return false;
  }
}

/** Open a session with the WAAI at `base` and read `/meta`; the failure as the state it leaves the module in. */
async function openReal(base: string, cancelled: () => boolean): Promise<{ state: SessionState; client: WaaiClient }> {
  const client = new WaaiClient({
    base,
    fetchSsoToken: async () => {
      const token = await fetchSsoToken();
      if (cancelled()) throw new DOMException("Aborted", "AbortError");
      return token;
    },
  });
  try {
    const session = await client.open();
    if (session.api_version !== REQUIRED_WAAI_API) return { state: { kind: "needs_update", waaiVersion: session.api_version }, client };
    const meta = await client.get<MetaResponse>("/meta");
    return { state: { kind: "ready", client, meta, demo: false }, client };
  } catch (err) {
    return { state: stateFromError(err), client };
  }
}

/** The in-browser demo: the dataset from the CRM, the fake WAAI on top of it, a client that talks to it. */
async function openDemo(demo: () => DemoOptions): Promise<SessionState | null> {
  const loaded = await loadDemoDataset();
  if (!loaded) return null;
  const initial = demo();
  // The directory is read at request time, so records that arrive after the session started are found too.
  const directory: DemoDirectory = {
    get: (type, id) => demo().directory.get(type, id),
    search: (q) => demo().directory.search(q),
  };
  const { fetch: demoFetch } = createDemoWaai({
    dataset: loaded.dataset,
    edition: loaded.edition,
    directory,
    crmUserId: initial.userId,
    media: demoMedia,
    language: initial.language,
  });
  const client = new WaaiClient({ base: DEMO_BASE, fetch: demoFetch, fetchSsoToken: async () => "demo", isDemo: true });
  await client.open();
  const meta = await client.get<MetaResponse>("/meta");
  return { kind: "ready", client, meta, demo: true };
}

/**
 * Open a session and read `/meta`, keep the client for the other hooks. Signs out at WAAI (best effort) when
 * the module goes away or `retry` starts over.
 *
 *   demo null            exactly the real path: `base` null = do nothing yet.
 *   demo, no `base`      the in-browser demo.
 *   demo, with `base`    the real WAAI first; with no usable account behind it (B1) the demo instead. If the
 *                        server says this is not a demo instance, the real state stays.
 */
export function useWaaiSession(base: string | null, demo: DemoOptions | null): { state: SessionState; retry: () => void } {
  const [state, setState] = useState<SessionState>({ kind: "connecting" });
  const [attempt, setAttempt] = useState(0);
  const demoRef = useRef(demo);
  useEffect(() => {
    demoRef.current = demo;
  });
  const isDemo = demo !== null;

  useEffect(() => {
    if (!base && !isDemo) return;
    let cancelled = false;
    let real: WaaiClient | null = null;
    setState({ kind: "connecting" });
    (async () => {
      // What the module shows when the demo is not available: the real path's state, or "not configured".
      let fallback: SessionState = { kind: "crm_not_configured" };
      if (base) {
        const opened = await openReal(base, () => cancelled);
        real = opened.client;
        if (cancelled) return;
        fallback = opened.state;
        if (!isDemo || !wantsDemo(opened.state)) {
          setState(opened.state);
          return;
        }
        // Leaving the real session for the demo: end it.
        void opened.client.signOut();
        real = null;
      }
      try {
        const next = await openDemo(() => demoRef.current!);
        if (!cancelled) setState(next ?? fallback);
      } catch {
        if (!cancelled) setState(fallback);
      }
    })();
    return () => {
      cancelled = true;
      void real?.signOut();
    };
  }, [base, isDemo, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
