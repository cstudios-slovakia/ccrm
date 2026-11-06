import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INTEGRATION_SECRET_KEYS, clearedSecretKeys } from "./secretClears.ts";

test("emptying a stored secret is an explicit clear", () => {
  assert.deepEqual(clearedSecretKeys({ openAiKey: "********" }, { openAiKey: "" }), ["openAiKey"]);
  assert.deepEqual(clearedSecretKeys({ openAiKey: "sk-real" }, {}), ["openAiKey"]);
});

test("a blank that stays blank is not a clear (stale tab)", () => {
  assert.deepEqual(clearedSecretKeys({ openAiKey: "" }, { openAiKey: "" }), []);
  assert.deepEqual(clearedSecretKeys({}, { openAiKey: "" }), []);
});

test("an unchanged or replaced secret is not a clear", () => {
  assert.deepEqual(clearedSecretKeys({ openAiKey: "********" }, { openAiKey: "********" }), []);
  assert.deepEqual(clearedSecretKeys({ openAiKey: "********" }, { openAiKey: "sk-new" }), []);
});

test("the client list matches ccrm_integration_secret_keys() in auth.php", () => {
  const php = readFileSync(new URL("../../public/api/auth.php", import.meta.url), "utf8");
  const body = /function ccrm_integration_secret_keys\(\): array \{\s*return \[([\s\S]*?)\];/.exec(php)?.[1] ?? "";
  const serverKeys = [...body.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...INTEGRATION_SECRET_KEYS].sort(), serverKeys);
});
