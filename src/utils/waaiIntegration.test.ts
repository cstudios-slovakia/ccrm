import assert from "node:assert/strict";
import test from "node:test";
import { WAAI_SCOPES, isIpOrCidr, normalizeEmbedOrigin, parseIpList, waaiEnvSnippet } from "./waaiIntegration.ts";

test("isIpOrCidr accepts addresses and CIDR blocks of both families", () => {
  for (const ok of ["10.0.0.1", "172.31.250.0/24", "0.0.0.0/0", "255.255.255.255", "2001:db8::/32", "::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.equal(isIpOrCidr(ok), true, ok);
  }
});

test("isIpOrCidr refuses anything else", () => {
  for (const bad of ["", "example.com", "10.0.0", "10.0.0.256", "10.0.0.1/33", "10.0.0.1/x", "10.0.0.1/24/8", "2001:db8::/129", "1:2:3", "http://10.0.0.1", " "]) {
    assert.equal(isIpOrCidr(bad), false, bad);
  }
});

test("parseIpList splits on commas, spaces and new lines, and drops duplicates", () => {
  const r = parseIpList("10.0.0.1, 10.0.0.2\n172.31.250.0/24;10.0.0.1\n");
  assert.deepEqual(r.ips, ["10.0.0.1", "10.0.0.2", "172.31.250.0/24"]);
  assert.deepEqual(r.invalid, []);
});

test("parseIpList reports what it could not read, and keeps the rest", () => {
  const r = parseIpList("10.0.0.1 nope 10.0.0.999");
  assert.deepEqual(r.ips, ["10.0.0.1"]);
  assert.deepEqual(r.invalid, ["nope", "10.0.0.999"]);
  assert.deepEqual(parseIpList("   "), { ips: [], invalid: [] });
});

test("normalizeEmbedOrigin reduces an address to its origin", () => {
  assert.equal(normalizeEmbedOrigin("https://wa.example.sk"), "https://wa.example.sk");
  assert.equal(normalizeEmbedOrigin("  https://wa.example.sk/ "), "https://wa.example.sk");
  assert.equal(normalizeEmbedOrigin("https://WA.example.sk:8443/"), "https://wa.example.sk:8443");
  assert.equal(normalizeEmbedOrigin(""), "");
});

test("normalizeEmbedOrigin allows plain http only for a local development host", () => {
  assert.equal(normalizeEmbedOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeEmbedOrigin("http://wa.localtest.me:3000"), "http://wa.localtest.me:3000");
  assert.equal(normalizeEmbedOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.equal(normalizeEmbedOrigin("http://wa.example.sk"), null);
  assert.equal(normalizeEmbedOrigin("http://evil-localtest.me"), null);
});

test("normalizeEmbedOrigin refuses paths, credentials, queries and non-URLs", () => {
  for (const bad of ["https://wa.example.sk/app", "https://user:pw@wa.example.sk", "https://wa.example.sk?x=1", "https://wa.example.sk/#x", "wa.example.sk", "ftp://wa.example.sk", "javascript:alert(1)"]) {
    assert.equal(normalizeEmbedOrigin(bad), null, bad);
  }
});

test("waaiEnvSnippet writes the three WAAI variables, with a placeholder until a token exists", () => {
  assert.equal(waaiEnvSnippet("https://crm.example.sk/", "ccrm_int_x"), "CRM_BASE_URL=https://crm.example.sk\nCRM_API_TOKEN=ccrm_int_x\nCRM_DRY_RUN=1");
  assert.match(waaiEnvSnippet("https://crm.example.sk"), /CRM_API_TOKEN=<token>/);
});

test("the scope list is the one the server grants", () => {
  assert.deepEqual([...WAAI_SCOPES], ["users:read", "directory:read", "tasks:push", "tasks:pull", "whatsapp:links", "timeline:push"]);
});
