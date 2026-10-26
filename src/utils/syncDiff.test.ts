import assert from "node:assert/strict";
import test from "node:test";
import { skipHoldsBaseline, skipIsLostWork, skippedCollection } from "./syncDiff.ts";

test("a reason suffix belongs to its collection", () => {
  assert.equal(skippedCollection("users:nameTaken"), "users");
  assert.equal(skippedCollection("users:emailTaken"), "users");
  assert.equal(skippedCollection("users:account"), "users");
  assert.equal(skippedCollection("leads:outside-scope"), "leads");
  assert.equal(skippedCollection("tasks:outside-scope"), "tasks");
  assert.equal(skippedCollection("employees:userId"), "employees");
  assert.equal(skippedCollection("settings:ORDER_STATUSES"), "settings");
  assert.equal(skippedCollection("leads:clients"), "leads");
  assert.equal(skippedCollection("leads:clients:delete"), "leads");
  assert.equal(skippedCollection("customDashboards:home:delete"), "customDashboards");
  assert.equal(skippedCollection("users:delete"), "users");
});

test("a refusal holds that collection's baseline", () => {
  const skipped = new Set(["users:nameTaken", "leads:outside-scope"]);
  assert.equal(skipHoldsBaseline(skipped, "users"), true);
  assert.equal(skipHoldsBaseline(skipped, "leads"), true);
  assert.equal(skipHoldsBaseline(skipped, "tasks"), false);
  assert.equal(skipHoldsBaseline(new Set(["leads:clients:delete"]), "leads"), true);
});

test("reason suffixes and unknown tags are unsaved work", () => {
  const payload = { users: [{ id: "u1", name: "A" }], leads: [], settings: { orderStatuses: [] } };
  for (const tag of ["users:nameTaken", "users:emailTaken", "users:account", "employees:userId", "tasks:outside-scope"]) {
    assert.equal(skipIsLostWork(tag, payload), true, tag);
  }
  assert.equal(skipIsLostWork("nope:whatever", payload), true);
  assert.equal(skipIsLostWork("settings:ORDER_STATUSES", payload), true);
  assert.equal(skipIsLostWork("settings:ORDER_STATUSES", {}), false);
  // A bare collection this push did not change stays quiet.
  assert.equal(skipIsLostWork("leads", payload), false);
  assert.equal(skipIsLostWork("leads:outside-scope", payload), true);
  assert.equal(skipIsLostWork("users:delete", { deleted: { users: ["u1"] } }), true);
  assert.equal(skipIsLostWork("users:delete", { users: [{ id: "u1" }] }), false);
  assert.equal(skipIsLostWork("leads:clients:delete", { deleted: { leads: ["l1"] } }), true);
});
