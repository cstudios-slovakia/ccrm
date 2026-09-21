import assert from "node:assert/strict";
import test from "node:test";
import { passwordMeetsRules, passwordRules } from "./passwordRules.ts";

test("length counts from 12 characters", () => {
  assert.equal(passwordRules("Abcdefghij1").length, false);
  assert.equal(passwordRules("Abcdefghijk1").length, true);
});

test("mix needs upper case, lower case and a digit", () => {
  assert.equal(passwordRules("abcdefghijk1").mix, false);
  assert.equal(passwordRules("ABCDEFGHIJK1").mix, false);
  assert.equal(passwordRules("Abcdefghijkl").mix, false);
  assert.equal(passwordRules("Abcdefghijk1").mix, true);
});

test("a password passes only when every rule does", () => {
  assert.equal(passwordMeetsRules(""), false);
  assert.equal(passwordMeetsRules("Short1a"), false);
  assert.equal(passwordMeetsRules("alllowercase123"), false);
  assert.equal(passwordMeetsRules("NewPassw0rdOK"), true);
});
