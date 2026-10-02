import { test } from "node:test";
import assert from "node:assert/strict";
import { splitClientsForPicker, pushRecentClient } from "./clientPickerGroups.ts";

const leads = [
  { id: "a", createdAt: "2024-01-01 10:00:00" },
  { id: "b", createdAt: "2024-03-01 10:00:00" },
  { id: "c", createdAt: "2024-02-01 10:00:00" },
  { id: "d", createdAt: "" },
];

test("recent keeps the user's order and skips unknown ids and repeats", () => {
  const { recent } = splitClientsForPicker(leads, ["c", "zzz", "a", "c"]);
  assert.deepEqual(recent.map((l) => l.id), ["c", "a"]);
});

test("newest is by creation date and leaves recent out", () => {
  const { newest } = splitClientsForPicker(leads, ["b"]);
  assert.deepEqual(newest.map((l) => l.id), ["c", "a", "d"]);
});

test("rest keeps register order and leaves recent out", () => {
  const { rest } = splitClientsForPicker(leads, ["b"]);
  assert.deepEqual(rest.map((l) => l.id), ["a", "c", "d"]);
});

test("no history puts everything in newest and rest", () => {
  const { recent, newest, rest } = splitClientsForPicker(leads, undefined);
  assert.equal(recent.length, 0);
  assert.deepEqual(newest.map((l) => l.id), ["b", "c", "a", "d"]);
  assert.equal(rest.length, 4);
});

test("pushRecentClient moves a repeat to the front and caps the list", () => {
  assert.deepEqual(pushRecentClient(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(pushRecentClient(["a", "b"], "c", 2), ["c", "a"]);
  assert.deepEqual(pushRecentClient(["a"], ""), ["a"]);
});
