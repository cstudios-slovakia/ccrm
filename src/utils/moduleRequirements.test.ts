import assert from "node:assert/strict";
import test from "node:test";
import { isPersonalMailboxConfigured, isVectorDbConfigured } from "./moduleRequirements.ts";

test("isVectorDbConfigured: needs a chosen backend that passed validation", () => {
  assert.equal(isVectorDbConfigured(undefined), false);
  assert.equal(isVectorDbConfigured({}), false);
  assert.equal(isVectorDbConfigured({ vectorDb: "mariadb" }), false);
  assert.equal(isVectorDbConfigured({ vectorDb: "none", vectorDbValidated: true }), false);
  assert.equal(isVectorDbConfigured({ vectorDbValidated: true }), false);
  assert.equal(isVectorDbConfigured({ vectorDb: "mariadb", vectorDbValidated: true }), true);
  assert.equal(isVectorDbConfigured({ vectorDb: "qdrant", vectorDbValidated: true }), true);
});

test("isPersonalMailboxConfigured: reads emailSettings.isValidated from metadata", () => {
  assert.equal(isPersonalMailboxConfigured(null), false);
  assert.equal(isPersonalMailboxConfigured({}), false);
  assert.equal(isPersonalMailboxConfigured({ metadata_json: "{}" }), false);
  assert.equal(isPersonalMailboxConfigured({ metadata_json: "not json" }), false);
  assert.equal(isPersonalMailboxConfigured({ metadata_json: '{"emailSettings":{"isValidated":false}}' }), false);
  assert.equal(isPersonalMailboxConfigured({ metadata_json: '{"emailSettings":{"isValidated":true}}' }), true);
  assert.equal(isPersonalMailboxConfigured({ metadata_json: { emailSettings: { isValidated: true } } }), true);
});
