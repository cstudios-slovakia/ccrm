/*
  Microsoft 365 (Exchange Online) mailboxes: connected by signing in with Microsoft
  instead of a password (api/graph_oauth.php). Microsoft switched password logins off for
  IMAP and SMTP, so such a mailbox has no host and no password in its profile: only the
  account that signed in. The tokens stay on the server; the browser sees a mask where a
  token is stored.
*/

export const MICROSOFT_PROVIDER = "microsoft365";
const SECRET_MASK = "********";

export interface MicrosoftMailStatus {
  /** An administrator has entered the app registration; without it nobody can sign in. */
  configured: boolean;
  connected: boolean;
  account: string;
  /** Signed in once, and the sign-in has run out or was revoked. */
  needsReconnect: boolean;
  error?: string;
}

/** Whose mailbox: the signed-in user's own, or a company mailbox (admin). */
export type MicrosoftMailTarget = { kind: "user" } | { kind: "company"; mailboxId: string };

export interface MicrosoftSignInResult {
  ok: boolean;
  account?: string;
  error?: string;
  /** The user closed the sign-in window without finishing. */
  cancelled?: boolean;
}

export interface MicrosoftAppRegistration {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  configured: boolean;
  source: "own" | "integrations" | null;
  redirectUri: string;
}

type ProfileLike = { provider?: unknown; isValidated?: unknown; graphAccount?: unknown; graphRefreshToken?: unknown } | null | undefined;

export const isMicrosoftProfile = (settings: ProfileLike): boolean => settings?.provider === MICROSOFT_PROVIDER;

/**
 * A profile that was signed in and no longer is: the server clears the stored token when
 * Microsoft refuses it, and a cleared token arrives without its mask.
 */
export const microsoftProfileNeedsReconnect = (settings: ProfileLike): boolean =>
  isMicrosoftProfile(settings) && settings?.isValidated === true && !settings?.graphRefreshToken;

/** The profile the client keeps after a successful sign-in. The server already stored the real one. */
export const microsoftProfileAfterSignIn = (account: string) => ({
  provider: MICROSOFT_PROVIDER,
  graphAccount: account.trim().toLowerCase(),
  graphRefreshToken: SECRET_MASK,
  isValidated: true,
});

const targetQuery = (target: MicrosoftMailTarget): string =>
  target.kind === "company" ? `&mailboxId=${encodeURIComponent(target.mailboxId)}` : "";

const targetBody = (target: MicrosoftMailTarget) =>
  target.kind === "company" ? { target: "company", mailboxId: target.mailboxId } : { target: "user" };

const readJson = async <T>(res: Response): Promise<T & { success?: boolean; error?: string }> => {
  let data: (T & { success?: boolean; error?: string }) | null = null;
  try {
    data = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok || !data || data.success === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};

const post = <T>(action: string, body: unknown) =>
  fetch(`/api/graph_oauth.php?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => readJson<T>(res));

export const fetchMicrosoftMailStatus = (target: MicrosoftMailTarget, live = false): Promise<MicrosoftMailStatus> =>
  fetch(`/api/graph_oauth.php?action=status${targetQuery(target)}${live ? "&live=1" : ""}`).then((res) => readJson<MicrosoftMailStatus>(res));

export const disconnectMicrosoftMail = (target: MicrosoftMailTarget) => post<unknown>("disconnect", targetBody(target));

export const fetchMicrosoftApp = (): Promise<MicrosoftAppRegistration> =>
  fetch("/api/graph_oauth.php?action=app").then((res) => readJson<MicrosoftAppRegistration>(res));

export const saveMicrosoftApp = (app: { clientId: string; tenantId: string; clientSecret: string }) =>
  post<{ configured: boolean }>("save_app", app);

/** What the sign-in window posts back when it is done (see ccrm_graph_oauth_page in graph_oauth.php). */
export const readSignInMessage = (data: unknown): MicrosoftSignInResult | null => {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; ok?: unknown; account?: unknown; error?: unknown };
  if (d.type !== "ccrm-graph-oauth") return null;
  return {
    ok: d.ok === true,
    account: typeof d.account === "string" ? d.account : undefined,
    error: typeof d.error === "string" ? d.error : undefined,
  };
};

const POLL_MS = 2000;
const GIVE_UP_MS = 10 * 60 * 1000;

/**
 * Opens Microsoft's sign-in in a small window and resolves when the mailbox is connected, the
 * sign-in failed, or the window was closed. Call it straight from a click: the window has to
 * be opened before anything is awaited, or the browser blocks it. When it is blocked anyway
 * the whole page goes to Microsoft and comes back to the app afterwards.
 *
 * The window reports back with a message. Some sign-in pages cut the link between the two
 * windows, so the server is also asked every two seconds whether the mailbox is connected.
 */
export async function signInWithMicrosoft(target: MicrosoftMailTarget): Promise<MicrosoftSignInResult> {
  const popup = window.open("", "ccrm-microsoft-signin", "width=520,height=700,menubar=no,toolbar=no");
  let url: string;
  // Signing in again while the old sign-in still works: "connected" proves nothing then.
  let wasConnected = false;
  try {
    const start = await post<{ url: string; connected?: boolean }>("start", targetBody(target));
    url = start.url;
    wasConnected = start.connected === true;
  } catch (e) {
    popup?.close();
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!popup) {
    window.location.assign(url);
    return new Promise<MicrosoftSignInResult>(() => undefined); // the page is leaving
  }
  popup.location.href = url;

  return new Promise<MicrosoftSignInResult>((resolve) => {
    const started = Date.now();
    let done = false;
    let closedChecks = 0;
    const finish = (result: MicrosoftSignInResult) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
      try {
        popup.close();
      } catch {
        /* already gone */
      }
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const result = readSignInMessage(event.data);
      if (result) finish(result);
    };
    const poll = async () => {
      if (done) return;
      let closed = false;
      try {
        closed = popup.closed;
      } catch {
        closed = false;
      }
      try {
        const status = await fetchMicrosoftMailStatus(target);
        if (status.connected && (!wasConnected || closed)) {
          finish({ ok: true, account: status.account });
          return;
        }
      } catch {
        /* a failed poll is just tried again */
      }
      // Closed and still not connected after one more look: the user gave up.
      if (closed && ++closedChecks >= 2) finish({ ok: false, cancelled: true });
      else if (Date.now() - started > GIVE_UP_MS) finish({ ok: false, cancelled: true });
    };
    window.addEventListener("message", onMessage);
    const timer = window.setInterval(() => void poll(), POLL_MS);
  });
}
