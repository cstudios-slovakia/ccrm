import assert from "node:assert/strict";
import test from "node:test";
import { personalLanguage, resolveLanguage } from "./languagePrefs.ts";

test("fresh browser, nobody logged in: the company language", () => {
  assert.equal(resolveLanguage({ loggedIn: false, personal: null, remembered: null, system: "hu" }), "hu");
});

test("logged out: the language the last user chose personally wins over the company one", () => {
  assert.equal(resolveLanguage({ loggedIn: false, personal: null, remembered: "en", system: "hu" }), "en");
});

test("logged in with a personal language: it wins", () => {
  assert.equal(resolveLanguage({ loggedIn: true, personal: "en", remembered: "sk", system: "hu" }), "en");
});

test("logged in without a personal language: the company language, not the remembered one", () => {
  assert.equal(resolveLanguage({ loggedIn: true, personal: null, remembered: "en", system: "hu" }), "hu");
});

test("personalLanguage reads a JSON string or an object and ignores junk", () => {
  assert.equal(personalLanguage({ metadata_json: '{"language":"hu"}' }), "hu");
  assert.equal(personalLanguage({ metadata_json: { language: "en" } }), "en");
  assert.equal(personalLanguage({ metadata_json: { language: "de" } }), null);
  assert.equal(personalLanguage({ metadata_json: "not json" }), null);
  assert.equal(personalLanguage({ metadata_json: "{}" }), null);
  assert.equal(personalLanguage(null), null);
});
