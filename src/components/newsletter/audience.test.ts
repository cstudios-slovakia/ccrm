import test from "node:test";
import assert from "node:assert/strict";
import { audienceLabel, defaultAudience, isAudienceValid, normalizeAudience, parseExtraAddresses } from "./audience.ts";

const t = (en: string) => en;

test("a new audience is all clients and valid", () => {
  const a = defaultAudience();
  assert.equal(a.clients.mode, "all");
  assert.ok(isAudienceValid(a));
});

test("picking nothing is invalid, picking a category or a client is valid", () => {
  const a = defaultAudience();
  a.clients.mode = "pick";
  assert.equal(isAudienceValid(a), false);
  a.clients.categoryIds = ["c1"];
  assert.ok(isAudienceValid(a));
  a.clients.categoryIds = [];
  a.clients.clientIds = ["client-1"];
  assert.ok(isAudienceValid(a));
});

test("extra addresses: separators, Name <addr>, duplicates and invalid ones", () => {
  const r = parseExtraAddresses("Ann <ann@x.sk>, bob@x.sk; ANN@x.sk\nfoo@\n\n  carl@y.hu ");
  assert.deepEqual(r.valid, ["ann@x.sk", "bob@x.sk", "carl@y.hu"]);
  assert.deepEqual(r.invalid, ["foo@"]);
});

test("normalizeAudience fills a partial audience from the server", () => {
  const a = normalizeAudience({ clients: { mode: "pick", categoryIds: ["a"], clientIds: [] } } as never);
  assert.equal(a.clients.mode, "pick");
  assert.equal(a.leads.enabled, false);
  assert.equal(a.extra.raw, "");
  assert.deepEqual(normalizeAudience(null), defaultAudience());
});

test("audience label", () => {
  assert.equal(audienceLabel(defaultAudience(), t), "All clients");
  const a = defaultAudience();
  a.clients = { mode: "pick", categoryIds: ["1", "2"], clientIds: ["x", "y", "z"] };
  a.leads.enabled = true;
  assert.equal(audienceLabel(a, t), "2 categories, 3 clients + leads");
});
