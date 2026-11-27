import assert from "node:assert/strict";
import test from "node:test";
import { fetchModuleConfig, fetchSsoToken, parseModuleConfig } from "./crmConnection.ts";
import { WaaiApiError } from "./waaiClient.ts";

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })) as unknown as typeof fetch;

const good = {
  success: true,
  configured: true,
  module: { ui: "native", transport: "proxy", base: "/waai-api" },
  standalone_url: "https://wa.example.sk",
  embed_url: "https://wa.example.sk",
  can_manage: true,
  user_id: "usr_1",
};

test("the connection description is read field by field", () => {
  assert.deepEqual(parseModuleConfig(good), {
    configured: true,
    canManage: true,
    ui: "native",
    transport: "proxy",
    base: "/waai-api",
    standaloneUrl: "https://wa.example.sk",
    userId: "usr_1",
  });
});

test("a direct connection names WAAI's address as the base", () => {
  const c = parseModuleConfig({ ...good, module: { ui: "native", transport: "direct", base: "https://wa.example.sk/api/ccrm/v1" } });
  assert.equal(c?.base, "https://wa.example.sk/api/ccrm/v1");
});

test("no standalone address is fine", () => {
  assert.equal(parseModuleConfig({ ...good, standalone_url: null })?.standaloneUrl, null);
});

test("anything that is not the endpoint's answer is refused", () => {
  for (const bad of [null, "x", 5, {}, { ...good, success: false }, { ...good, module: null }, { ...good, module: { ui: "iframe", transport: "proxy", base: "/waai-api" } },
    { ...good, module: { ui: "native", transport: "carrier", base: "/waai-api" } }, { ...good, module: { ui: "native", transport: "proxy", base: "javascript:alert(1)" } },
    { ...good, module: { ui: "native", transport: "proxy", base: "//evil.example/x" } }]) {
    assert.equal(parseModuleConfig(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseModuleConfig({ ...good, standalone_url: "javascript:alert(1)" })?.standaloneUrl, null);
});

test("fetchModuleConfig returns the description, or says why not", async () => {
  assert.equal((await fetchModuleConfig(answer(200, good))).base, "/waai-api");
  await assert.rejects(fetchModuleConfig(answer(403, { success: false })), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_forbidden");
  await assert.rejects(fetchModuleConfig(answer(500, { success: false })), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_error");
  await assert.rejects(fetchModuleConfig(answer(200, { success: true })), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_error");
  await assert.rejects(fetchModuleConfig((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch), (e: unknown) => e instanceof WaaiApiError && e.code === "network");
});

test("fetchSsoToken returns the token", async () => {
  assert.equal(await fetchSsoToken(answer(200, { success: true, token: "a.b.c", expires_in: 60 })), "a.b.c");
});

test("fetchSsoToken maps the CRM's refusals", async () => {
  await assert.rejects(fetchSsoToken(answer(409, { success: false, code: "not_configured" })), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_not_configured");
  await assert.rejects(fetchSsoToken(answer(403, { success: false, code: "forbidden" })), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_forbidden");
  await assert.rejects(fetchSsoToken(answer(401, {})), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_forbidden");
  await assert.rejects(fetchSsoToken(answer(500, {})), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_error");
  await assert.rejects(fetchSsoToken(answer(200, { success: true })), (e: unknown) => e instanceof WaaiApiError && e.code === "crm_error");
  await assert.rejects(
    fetchSsoToken(answer(429, { success: false }, { "Retry-After": "30" })),
    (e: unknown) => e instanceof WaaiApiError && e.code === "rate_limited" && e.retryAfter === 30,
  );
});
