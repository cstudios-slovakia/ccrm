import assert from "node:assert/strict";
import test from "node:test";
import { failureOf, uploadWithProgress, type XhrLike } from "./uploadXhr.ts";

function fakeXhr(opts: Partial<XhrLike> = {}): XhrLike {
  return {
    open: () => {},
    setRequestHeader: () => {},
    send: function () {
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    },
    abort: () => {},
    upload: { onprogress: null },
    onload: null,
    onerror: null,
    onabort: null,
    status: 200,
    responseText: JSON.stringify({ ok: true }),
    getResponseHeader: () => null,
    withCredentials: false,
    ...opts,
  };
}

test("failureOf maps structured JSON error envelopes", () => {
  const json = JSON.stringify({
    error: {
      code: "payload_too_large",
      message: "File exceeds 32MB",
      request_id: "req-99",
    },
  });
  const err = failureOf(413, json, null);
  assert.equal(err.status, 413);
  assert.equal(err.code, "payload_too_large");
  assert.equal(err.message, "File exceeds 32MB");
  assert.equal(err.requestId, "req-99");
});

test("failureOf falls back to HTTP status codes when response is not JSON", () => {
  const err401 = failureOf(401, "Unauthorized HTML", null);
  assert.equal(err401.code, "unauthorized");

  const err403 = failureOf(403, "Forbidden", null);
  assert.equal(err403.code, "forbidden");

  const err404 = failureOf(404, "Not Found", null);
  assert.equal(err404.code, "not_found");

  const err429 = failureOf(429, "Too Many Requests", "60");
  assert.equal(err429.code, "rate_limited");
  assert.equal(err429.retryAfter, 60);

  const err500 = failureOf(500, "Server Error", null);
  assert.equal(err500.code, "server_error");
});

test("uploadWithProgress sends headers and resolves JSON on success", async () => {
  const headers: Record<string, string> = {};
  const progressCalls: number[] = [];

  const xhr = fakeXhr({
    setRequestHeader: (k, v) => {
      headers[k] = v;
    },
    send: function () {
      if (this.upload.onprogress) {
        this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
      }
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 5);
    },
    status: 200,
    responseText: JSON.stringify({ message: { id: "m-new" } }),
  });

  const res = await uploadWithProgress<{ message: { id: string } }>(
    {
      url: "https://example.com/send",
      token: "secret-token",
      body: new FormData(),
      onProgress: (p) => progressCalls.push(p),
    },
    () => xhr,
  );

  assert.equal(headers.Authorization, "Bearer secret-token");
  assert.equal(headers.Accept, "application/json");
  assert.equal(res.message.id, "m-new");
  assert.ok(progressCalls.includes(0.5));
  assert.ok(progressCalls.includes(1));
});

test("uploadWithProgress rejects with WaaiApiError on HTTP failure", async () => {
  const xhr = fakeXhr({
    status: 400,
    responseText: JSON.stringify({ error: { code: "invalid_input", message: "Bad file" } }),
  });

  await assert.rejects(
    async () => {
      await uploadWithProgress(
        {
          url: "https://example.com/send",
          token: "secret-token",
          body: new FormData(),
        },
        () => xhr,
      );
    },
    (err: any) => err.code === "invalid_input" && err.status === 400,
  );
});

test("uploadWithProgress rejects on network error", async () => {
  const xhr = fakeXhr({
    send: function () {
      setTimeout(() => {
        if (this.onerror) this.onerror();
      }, 5);
    },
  });

  await assert.rejects(
    async () => {
      await uploadWithProgress(
        {
          url: "https://example.com/send",
          token: "token",
          body: new FormData(),
        },
        () => xhr,
      );
    },
    (err: any) => err.code === "network",
  );
});

test("uploadWithProgress rejects on aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    async () => {
      await uploadWithProgress(
        {
          url: "https://example.com/send",
          token: "token",
          body: new FormData(),
          signal: controller.signal,
        },
        () => fakeXhr(),
      );
    },
    (err: any) => err.name === "AbortError",
  );
});
