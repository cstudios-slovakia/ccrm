import assert from "node:assert/strict";
import test from "node:test";
import { baselineOf, diffRecords, skipHoldsBaseline, skipIsLostWork, skippedCollection, stockRowId, withStockRowIds } from "./syncDiff.ts";

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

test("an untouched custom-entry map is not unsaved work", () => {
  // What a restricted role's push carries when it changed nothing (seen on the live demo).
  assert.equal(skipIsLostWork("unifiedEntriesData", { unifiedEntriesData: {} }), false);
  assert.equal(skipIsLostWork("unifiedEntriesData", { unifiedEntriesData: { e1: [] } }), false);
  assert.equal(skipIsLostWork("unifiedEntriesData", { unifiedEntriesData: { e1: [{ id: "r1" }] } }), true);
  assert.equal(skipIsLostWork("unifiedEntriesData:delete", { deleted: { unifiedEntriesData: { e1: ["r1"] } } }), true);
  assert.equal(skipIsLostWork("unifiedEntriesData:delete", { deleted: {} }), false);
});

test("a refused registry counts only when the push changed it", () => {
  // Every push carries the registry whole, so App.tsx drops it from the payload it
  // checks when it still matches what the server sent. Without that, a user with no
  // general_config edit was warned on every push, starting right after login.
  const registry = [{ id: "e1", name: "Cars" }];
  assert.equal(skipIsLostWork("unifiedEntries", { unifiedEntries: registry }), true);
  assert.equal(skipIsLostWork("unifiedEntries", { unifiedEntries: undefined }), false);
});

// Stored-vs-derived audit W2: stock rows have no id of their own, so every push used
// to re-send the whole stock table as absolute numbers and revert concurrent changes.

test("an unchanged stock row is not re-sent", () => {
  // As sync.php returns them: with the synthetic id.
  const server = [
    { warehouseId: "wh-1", itemId: "it-1", quantity: 10, reservedQuantity: 0, location: null, id: "wh-1:it-1" },
    { warehouseId: "wh-1", itemId: "it-2", quantity: 4, reservedQuantity: 0, location: null, id: "wh-1:it-2" },
  ];
  const baseline = baselineOf(withStockRowIds(server));
  // A lead edit elsewhere: the stock list is untouched.
  assert.deepEqual(diffRecords(withStockRowIds(server), baseline).changed, []);
  // A receipt on it-2 only.
  const edited = [server[0], { ...server[1], quantity: 7 }];
  const { changed } = diffRecords(withStockRowIds(edited), baseline);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].itemId, "it-2");
  assert.equal(changed[0].quantity, 7);
});

test("a stock row created in this tab gets a stable id and is sent once", () => {
  const local = { warehouseId: "wh-2", itemId: "it-9", quantity: 3, reservedQuantity: 0 };
  const first = withStockRowIds([local]);
  assert.equal(first[0].id, "wh-2:it-9");
  assert.equal(first[0].id, stockRowId(local));
  // Same source object, same normalised object: the baseline hash matches next time.
  assert.equal(withStockRowIds([local])[0], first[0]);
  const sent = diffRecords(first, new Map());
  assert.equal(sent.changed.length, 1);
  assert.deepEqual(diffRecords(withStockRowIds([local]), sent.next).changed, []);
});
