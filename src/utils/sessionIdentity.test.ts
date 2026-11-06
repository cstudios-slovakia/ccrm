import { test } from "node:test";
import assert from "node:assert/strict";
import { findSelf, isDifferentSessionUser } from "./sessionIdentity.ts";

const users = [
  { id: "u-1", email: "new@firm.sk" },
  { id: "u-2", email: "erik@firm.sk" },
];

test("findSelf follows the id after the user changed their own e-mail", () => {
  assert.equal(findSelf(users, { id: "u-1", email: "old@firm.sk" })?.email, "new@firm.sk");
});

test("findSelf falls back to the e-mail when the profile has no id", () => {
  assert.equal(findSelf(users, { email: "ERIK@firm.sk " })?.id, "u-2");
  assert.equal(findSelf(users, { id: "u-9", email: "erik@firm.sk" })?.id, "u-2");
  assert.equal(findSelf(users, null), undefined);
});

test("own e-mail change is not another user's session", () => {
  assert.equal(isDifferentSessionUser({ id: "u-1", email: "new@firm.sk" }, { id: "u-1", email: "old@firm.sk" }), false);
});

test("another user's session is detected by id, or by e-mail without ids", () => {
  assert.equal(isDifferentSessionUser({ id: "u-2", email: "erik@firm.sk" }, { id: "u-1", email: "new@firm.sk" }), true);
  assert.equal(isDifferentSessionUser({ email: "erik@firm.sk" }, { id: "u-1", email: "new@firm.sk" }), true);
  assert.equal(isDifferentSessionUser({ email: "" }, { id: "u-1", email: "new@firm.sk" }), false);
});
