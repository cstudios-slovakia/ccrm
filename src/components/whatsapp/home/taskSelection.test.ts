import assert from "node:assert/strict";
import test from "node:test";
import { selectAll, toggleSelected } from "./taskSelection.ts";

test("selecting a task keeps the others, and clearing one does not clear the rest", () => {
  const one = toggleSelected(new Set(), "a", true);
  const both = toggleSelected(one, "b", true);
  assert.deepEqual([...both], ["a", "b"]);
  assert.deepEqual([...toggleSelected(both, "a", false)], ["b"]);
});

test("select all follows the ids on screen", () => {
  assert.deepEqual([...selectAll(["a", "b"], true)], ["a", "b"]);
  assert.equal(selectAll(["a"], false).size, 0);
});
