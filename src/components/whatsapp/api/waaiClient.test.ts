import assert from "node:assert/strict";
import test from "node:test";
import { REFRESH_MARGIN_MS, REQUIRED_WAAI_API, WaaiApiError, WaaiClient } from "./waaiClient.ts";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  credentials: RequestCredentials | undefined;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const session = (n: number, over: Record<string, unknown> = {}) => ({
  access_token: `wam_token-${n}`,
  expires_in: 3600,
  api_version: REQUIRED_WAAI_API,
  user: { id: "u1", role: "admin", name: "peter@example.sk", crm_user_id: "crm-1" },
  ...over,
});

const envelope = (status: number, code: string, message = "nope") => json(status, { error: { code, message, request_id: "req-1" } });

/** A WAAI stand-in: `handler` answers by path and method; every call is recorded. */
function harness(handler: (call: Call, tokens: { issued: number }) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const tokens = { issued: 0 };
  let clock = 1_000_000;
  let ssoCalls = 0;
  const client = new WaaiClient({
    base: "/waai-api/",
    fetchSsoToken: async () => `sso-${++ssoCalls}`,
    now: () => clock,
    fetch: async (input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const call: Call = {
        url: String(input),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
        credentials: init?.credentials,
      };
      calls.push(call);
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return json(200, session(++tokens.issued));
      }
      return handler(call, tokens);
    },
  });
  return { client, calls, tokens, advance: (ms: number) => (clock += ms), ssoCalls: () => ssoCalls };
}

test("the first call trades the CRM's token for an access token, then sends it as a bearer", async () => {
  const h = harness(() => json(200, { chats: 2, messages: 5 }));
  const unread = await h.client.get<{ chats: number }>("/unread");
  assert.equal(unread.chats, 2);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0]!.url, "/waai-api/session"); // a trailing slash in the base is dropped
  assert.deepEqual(JSON.parse(h.calls[0]!.body!), { token: "sso-1" });
  assert.equal(h.calls[0]!.headers.Authorization, undefined, "the exchange itself carries no bearer");
  assert.equal(h.calls[1]!.headers.Authorization, "Bearer wam_token-1");
  assert.equal(h.client.user?.id, "u1");
});

test("no call sends the CRM's cookies to WAAI", async () => {
  const h = harness(() => json(200, {}));
  await h.client.get("/meta");
  assert.ok(h.calls.every((c) => c.credentials === "omit"));
});

test("the token is kept and reused until it is about to run out", async () => {
  const h = harness(() => json(200, {}));
  await h.client.get("/meta");
  await h.client.get("/unread");
  assert.equal(h.tokens.issued, 1);
  h.advance(3600_000 - REFRESH_MARGIN_MS - 1);
  await h.client.get("/unread");
  assert.equal(h.tokens.issued, 1, "still more than five minutes left");
  h.advance(2);
  await h.client.get("/unread");
  assert.equal(h.tokens.issued, 2, "within five minutes of the end: renewed");
  assert.equal(h.calls.at(-1)!.headers.Authorization, "Bearer wam_token-2");
});

test("concurrent first calls share one exchange", async () => {
  const h = harness(() => json(200, {}));
  await Promise.all([h.client.get("/meta"), h.client.get("/unread"), h.client.get("/unread"), h.client.get("/meta")]);
  assert.equal(h.tokens.issued, 1);
  assert.equal(h.ssoCalls(), 1);
});

test("a 401 renews the token once and repeats the call", async () => {
  let rejectOnce = true;
  const h = harness((call) => {
    if (call.headers.Authorization === "Bearer wam_token-1" && rejectOnce) {
      rejectOnce = false;
      return envelope(401, "invalid_token");
    }
    return json(200, { ok: call.headers.Authorization });
  });
  const answer = await h.client.get<{ ok: string }>("/unread");
  assert.equal(answer.ok, "Bearer wam_token-2");
  assert.equal(h.tokens.issued, 2);
});

test("concurrent 401s trigger one renewal, not one each", async () => {
  const h = harness((call) =>
    call.headers.Authorization === "Bearer wam_token-1" ? envelope(401, "invalid_token") : json(200, { ok: true }),
  );
  await h.client.open();
  const results = await Promise.all([h.client.get("/a"), h.client.get("/b"), h.client.get("/c")]);
  assert.equal(results.length, 3);
  assert.equal(h.tokens.issued, 2, "one initial exchange and one renewal");
});

test("a call whose 401 arrives after someone else renewed does not renew again", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const h = harness(async (call) => {
    if (call.headers.Authorization === "Bearer wam_token-1") {
      if (call.url.endsWith("/slow")) await gate; // answers 401 late
      return envelope(401, "invalid_token");
    }
    return json(200, { ok: true });
  });
  await h.client.open();
  const slow = h.client.get("/slow");
  await h.client.get("/fast"); // 401, renews, retries with token 2
  release();
  await slow;
  assert.equal(h.tokens.issued, 2);
});

test("a second 401 in a row is the answer", async () => {
  const h = harness(() => envelope(401, "invalid_token", "gone"));
  await assert.rejects(h.client.get("/unread"), (err: unknown) => err instanceof WaaiApiError && err.status === 401 && err.code === "invalid_token");
  assert.equal(h.tokens.issued, 2, "renewed once, not in a loop");
});

test("other errors are not retried", async () => {
  const h = harness(() => envelope(403, "forbidden"));
  await assert.rejects(h.client.get("/admin/ai"), (err: unknown) => err instanceof WaaiApiError && err.status === 403);
  assert.equal(h.calls.filter((c) => c.url.endsWith("/admin/ai")).length, 1);
  assert.equal(h.tokens.issued, 1);
});

test("an error answer becomes a WaaiApiError with the code, the request id and Retry-After", async () => {
  const h = harness(() => json(429, { error: { code: "rate_limited", message: "slow down", request_id: "req-9" } }, { "Retry-After": "12" }));
  await assert.rejects(h.client.get("/unread"), (err: unknown) => {
    assert.ok(err instanceof WaaiApiError);
    assert.equal(err.status, 429);
    assert.equal(err.code, "rate_limited");
    assert.equal(err.requestId, "req-9");
    assert.equal(err.retryAfter, 12);
    assert.equal(err.message, "slow down");
    return true;
  });
});

test("an error that is not the envelope is mapped from its status", async () => {
  for (const [status, code] of [[404, "not_found"], [403, "forbidden"], [429, "rate_limited"], [502, "server_error"], [500, "server_error"]] as const) {
    const h = harness(() => new Response("<html>bad gateway</html>", { status }));
    await assert.rejects(h.client.get("/x"), (err: unknown) => err instanceof WaaiApiError && err.status === status && err.code === code, String(status));
  }
});

test("a failed exchange is reported with WAAI's code", async () => {
  const client = new WaaiClient({
    base: "/waai-api",
    fetchSsoToken: async () => "sso",
    fetch: async () => envelope(403, "not_linked"),
  });
  await assert.rejects(client.open(), (err: unknown) => err instanceof WaaiApiError && err.code === "not_linked" && err.status === 403);
  assert.equal(client.hasSession(), false);
});

test("an exchange the CRM cannot start fails with the CRM's error and does not call WAAI", async () => {
  let called = false;
  const client = new WaaiClient({
    base: "/waai-api",
    fetchSsoToken: async () => {
      throw new WaaiApiError(409, "crm_not_configured", "not configured");
    },
    fetch: async () => {
      called = true;
      return json(200, {});
    },
  });
  await assert.rejects(client.get("/meta"), (err: unknown) => err instanceof WaaiApiError && err.code === "crm_not_configured");
  assert.equal(called, false);
});

test("a network failure is a 'network' error", async () => {
  const client = new WaaiClient({
    base: "/waai-api",
    fetchSsoToken: async () => "sso",
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  await assert.rejects(client.get("/meta"), (err: unknown) => err instanceof WaaiApiError && err.code === "network" && err.status === 0);
});

test("an answer that breaks the contract is refused", async () => {
  const client = new WaaiClient({
    base: "/waai-api",
    fetchSsoToken: async () => "sso",
    fetch: async () => json(200, { access_token: "not-a-wam-token", expires_in: 3600, api_version: 1, user: { id: "u" } }),
  });
  await assert.rejects(client.open(), (err: unknown) => err instanceof WaaiApiError && err.code === "invalid_response");
});

test("a body is sent as JSON, query values are encoded, nulls are left out", async () => {
  const h = harness(() => json(200, {}));
  await h.client.post("/conversations/c1/send", { text: "hi" }, { query: { a: "x y", b: undefined, c: null, d: 3 } });
  const call = h.calls.at(-1)!;
  assert.equal(call.url, "/waai-api/conversations/c1/send?a=x+y&d=3");
  assert.equal(call.method, "POST");
  assert.equal(call.headers["Content-Type"], "application/json");
  assert.equal(call.body, '{"text":"hi"}');
});

test("a 204 answers undefined", async () => {
  const h = harness(() => json(204, null));
  assert.equal(await h.client.del("/messages/m1"), undefined);
});

test("signing out ends the session at WAAI and forgets the token", async () => {
  const h = harness(() => json(204, null));
  await h.client.open();
  await h.client.signOut();
  const last = h.calls.at(-1)!;
  assert.equal(last.method, "DELETE");
  assert.equal(last.url, "/waai-api/session");
  assert.equal(last.headers.Authorization, "Bearer wam_token-1");
  assert.equal(h.client.hasSession(), false);
  await h.client.signOut(); // nothing left to end: no further call
  assert.equal(h.calls.at(-1), last);
});

test("signing out never throws, even when WAAI cannot be reached", async () => {
  let fail = false;
  const client = new WaaiClient({
    base: "/waai-api",
    fetchSsoToken: async () => "sso",
    fetch: async (input, init) => {
      if (fail) throw new TypeError("offline");
      return init?.method === "POST" ? json(200, session(1)) : json(204, null);
    },
  });
  await client.open();
  fail = true;
  await client.signOut();
});

test("a signed media path becomes an address on the same base", () => {
  const client = new WaaiClient({ base: "https://wa.example.sk/api/ccrm/v1", fetchSsoToken: async () => "" });
  assert.equal(client.mediaUrl("/media/message/m1?u=u&exp=1&sig=s"), "https://wa.example.sk/api/ccrm/v1/media/message/m1?u=u&exp=1&sig=s");
  assert.equal(client.mediaUrl("https://elsewhere.example/x.png"), "https://elsewhere.example/x.png");
});

test("stream() sends the bearer, accepts event-stream and delivers events", async () => {
  const seen: string[] = [];
  const h = harness((call) => {
    assert.equal(call.headers.Accept, "text/event-stream");
    assert.equal(call.headers.Authorization, "Bearer wam_token-1");
    return new Response("event: qr\ndata: abc\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  await h.client.stream("/wa-accounts/a1/stream", (e) => seen.push(`${e.event}:${e.data}`));
  assert.deepEqual(seen, ["qr:abc"]);
});

test("stream() renews the token on a 401 like any other call", async () => {
  const h = harness((call) =>
    call.headers.Authorization === "Bearer wam_token-1"
      ? envelope(401, "invalid_token")
      : new Response("data: ok\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
  );
  const seen: string[] = [];
  await h.client.stream("/wa-accounts/a1/stream", (e) => seen.push(e.data));
  assert.deepEqual(seen, ["ok"]);
  assert.equal(h.tokens.issued, 2);
});

test("stream() supports POST with body", async () => {
  const seen: string[] = [];
  const h = harness((call) => {
    assert.equal(call.method, "POST");
    assert.equal(call.headers["Content-Type"], "application/json");
    assert.equal(call.headers.Accept, "text/event-stream");
    assert.equal(call.body, JSON.stringify({ window: "today" }));
    return new Response("event: delta\ndata: {\"delta\":\"hello\"}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  await h.client.stream("/conversations/c1/summary", (e) => seen.push(`${e.event}:${e.data}`), { body: { window: "today" } });
  assert.deepEqual(seen, ['delta:{"delta":"hello"}']);
});
