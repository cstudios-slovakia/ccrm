import assert from "node:assert/strict";
import test from "node:test";
import { moveRelative } from "./reorder.ts";

const ids = ["a", "b", "c", "d"];
const move = (drag: string, target: string, position: "before" | "after") =>
  moveRelative(ids, (id) => id, drag, target, position);

test("moving down lands on the chosen edge of the target", () => {
  assert.deepEqual(move("a", "c", "before"), ["b", "a", "c", "d"]);
  assert.deepEqual(move("a", "c", "after"), ["b", "c", "a", "d"]);
});

test("moving up lands on the chosen edge of the target", () => {
  assert.deepEqual(move("d", "b", "before"), ["a", "d", "b", "c"]);
  assert.deepEqual(move("d", "b", "after"), ["a", "b", "d", "c"]);
});

test("to either end of the list", () => {
  assert.deepEqual(move("c", "a", "before"), ["c", "a", "b", "d"]);
  assert.deepEqual(move("b", "d", "after"), ["a", "c", "d", "b"]);
});

test("an unknown id or a drop onto itself changes nothing, and the input is never mutated", () => {
  assert.deepEqual(move("x", "a", "before"), ids);
  assert.deepEqual(move("a", "x", "before"), ids);
  assert.deepEqual(move("b", "b", "after"), ids);
  assert.deepEqual(ids, ["a", "b", "c", "d"]);
});
