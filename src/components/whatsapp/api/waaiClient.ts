import { API_VERSION, type ApiErrorBody, type ApiErrorCode, type SessionResponse } from "./contract.ts";
import { readEventStream, type SseEvent } from "./eventStream.ts";

/**
 * The WhatsApp module's connection to WAAI (docs/WAAI-NATIVE-MODULE.md §4.2, §4.3).
 *
 * The browser asks the CRM for a 60 second sign-in token (`api/waai_sso.php`), trades it at WAAI for an
 * access token, and sends that as `Authorization: Bearer`. The access token lives in this object's memory
 * and nowhere else: not in storage, not in a URL. It is renewed five minutes before it expires, and once
 * more when WAAI says 401; concurrent calls wait for one exchange, never start several.
 */

/** The major version of WAAI's module API this build of the CRM speaks. A different one shows "needs an update". */
export const REQUIRED_WAAI_API = API_VERSION;

/** What a call can fail with: WAAI's codes, plus the ones that never reach WAAI. */
export type WaaiErrorCode =
  | ApiErrorCode
  /** The browser could not reach the server at all. */
  | "network"
  /** The server answered, but not with what the contract says. */
  | "invalid_response"
  /** The CRM has no usable WAAI connection (Settings → Integrations → WhatsApp). */
  | "crm_not_configured"
  /** The CRM refused this user (no WhatsApp permission, or a rate limit). */
  | "crm_forbidden"
  | "crm_error";

export class WaaiApiError extends Error {
  /** HTTP status; 0 when there was none. */
  readonly status: number;
  readonly code: WaaiErrorCode;
  readonly requestId: string | null;
  /** Seconds, from `Retry-After`. */
  readonly retryAfter: number | null;

  constructor(status: number, code: WaaiErrorCode, message: string, requestId: string | null = null, retryAfter: number | null = null) {
    super(message);
    this.name = "WaaiApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

export interface WaaiClientOptions {
  /** `/waai-api` (through the CRM) or `https://wa.example/api/ccrm/v1` (direct). No trailing slash. */
  base: string;
  /** A fresh sign-in token from the CRM. Throws `WaaiApiError` with a `crm_*` code when it cannot. */
  fetchSsoToken: () => Promise<string>;
  fetch?: typeof fetch;
  /** Milliseconds; replaceable for tests. */
  now?: () => number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Sent as JSON, or as it is when it is a `FormData`. */
  body?: unknown;
  signal?: AbortSignal;
}

/** Renew this long before the token runs out. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

export class WaaiClient {
  readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private session: SessionResponse | null = null;
  private expiresAt = 0;
  private exchanging: Promise<SessionResponse> | null = null;
  private readonly opts: WaaiClientOptions;

  constructor(opts: WaaiClientOptions) {
    this.opts = opts;
    this.base = opts.base.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? ((...args) => globalThis.fetch(...args));
    this.now = opts.now ?? (() => Date.now());
  }

  /** The signed-in user, once there is a session. */
  get user(): SessionResponse["user"] | null {
    return this.session?.user ?? null;
  }

  hasSession(): boolean {
    return this.session !== null;
  }

  /** Make sure there is a session (trading the CRM's token if there is none or it is about to end). */
  async open(): Promise<SessionResponse> {
    if (this.session && this.now() < this.expiresAt - REFRESH_MARGIN_MS) return this.session;
    return this.exchange();
  }

  /** One exchange at a time: callers that arrive while one is running share its result. */
  private exchange(): Promise<SessionResponse> {
    if (!this.exchanging) {
      this.exchanging = (async () => {
        const token = await this.opts.fetchSsoToken();
        const body = await this.send<SessionResponse>("POST", "/session", { body: { token } }, null);
        if (
          !body ||
          typeof body.access_token !== "string" ||
          !body.access_token.startsWith("wam_") ||
          typeof body.expires_in !== "number" ||
          typeof body.api_version !== "number" ||
          typeof body.user?.id !== "string"
        ) {
          throw new WaaiApiError(200, "invalid_response", "WAAI sent an unexpected sign-in answer.");
        }
        this.session = body;
        this.expiresAt = this.now() + body.expires_in * 1000;
        return body;
      })().finally(() => {
        this.exchanging = null;
      });
    }
    return this.exchanging;
  }

  /**
   * Run `call` with the current access token. A 401 means the token is gone (expired, revoked, the person was
   * unmapped): trade for a new one - unless another call already did - and run it once more. A second 401
   * is the answer.
   */
  private async authorized<T>(call: (token: string) => Promise<T>): Promise<T> {
    const session = await this.open();
    const used = session.access_token;
    try {
      return await call(used);
    } catch (err) {
      const rejected = err instanceof WaaiApiError && err.status === 401 && (err.code === "invalid_token" || err.code === "unauthorized");
      if (!rejected) throw err;
      if (this.session?.access_token === used) await this.exchange();
      return call(this.session!.access_token);
    }
  }

  request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    return this.authorized((token) => this.send<T>(method, path, opts, token));
  }

  get<T>(path: string, opts?: RequestOptions) {
    return this.request<T>("GET", path, opts);
  }
  post<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>("POST", path, { ...opts, body });
  }
  put<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>("PUT", path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>("PATCH", path, { ...opts, body });
  }
  del<T>(path: string, opts?: RequestOptions) {
    return this.request<T>("DELETE", path, opts);
  }

  /** Read a server-sent event stream until it ends or `opts.signal` aborts. */
  stream(path: string, onEvent: (event: SseEvent) => void, opts: Pick<RequestOptions, "query" | "signal"> = {}): Promise<void> {
    return this.authorized(async (token) => {
      let res: Response;
      try {
        res = await this.fetchImpl(this.url(path, opts.query), {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          credentials: "omit",
          cache: "no-store",
          signal: opts.signal,
        });
      } catch (err) {
        if (isAbort(err)) return;
        throw new WaaiApiError(0, "network", "WAAI could not be reached.");
      }
      if (!res.ok) throw await this.failure(res);
      if (!res.body) throw new WaaiApiError(res.status, "invalid_response", "The stream has no body.");
      await readEventStream(res.body, onEvent, opts.signal);
    });
  }

  /** The address of a signed media link from a response (`/media/…?u=&exp=&sig=`). */
  mediaUrl(signedPath: string): string {
    return signedPath.startsWith("/") ? this.base + signedPath : signedPath;
  }

  /** Best effort: end the session at WAAI. Never throws. */
  async signOut(): Promise<void> {
    const token = this.session?.access_token;
    this.session = null;
    this.expiresAt = 0;
    if (!token) return;
    try {
      await this.fetchImpl(this.url("/session"), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
        keepalive: true,
      });
    } catch {
      // The token ends on its own within the hour.
    }
  }

  private url(path: string, query?: RequestOptions["query"]): string {
    let url = this.base + path;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
      const text = params.toString();
      if (text) url += (url.includes("?") ? "&" : "?") + text;
    }
    return url;
  }

  private async send<T>(method: string, path: string, opts: RequestOptions, token: string | null): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    let res: Response;
    try {
      // `omit`: the CRM's own session cookie has no business at WAAI, and WAAI's API ignores cookies.
      res = await this.fetchImpl(this.url(path, opts.query), {
        method,
        headers,
        body,
        credentials: "omit",
        cache: "no-store",
        signal: opts.signal,
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new WaaiApiError(0, "network", "WAAI could not be reached.");
    }
    if (!res.ok) throw await this.failure(res);
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      throw new WaaiApiError(res.status, "invalid_response", "WAAI sent an answer that is not JSON.");
    }
  }

  /** An error answer as a `WaaiApiError`: the envelope when there is one, else what the status says. */
  private async failure(res: Response): Promise<WaaiApiError> {
    const retry = Number(res.headers.get("Retry-After"));
    const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
    let envelope: ApiErrorBody["error"] | null = null;
    try {
      const json = (await res.json()) as Partial<ApiErrorBody> | null;
      if (json?.error && typeof json.error.code === "string") envelope = json.error;
    } catch {
      // not JSON: a proxy's error page, say
    }
    if (envelope) return new WaaiApiError(res.status, envelope.code, envelope.message ?? "", envelope.request_id ?? null, retryAfter);
    const code: WaaiErrorCode =
      res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : res.status === 404 ? "not_found" : res.status === 429 ? "rate_limited" : "server_error";
    return new WaaiApiError(res.status, code, `WAAI answered ${res.status}.`, null, retryAfter);
  }
}
