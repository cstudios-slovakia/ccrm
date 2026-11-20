import test from "node:test";
import assert from "node:assert/strict";
import { niceCeil } from "./scale.ts";

test("niceCeil picks the smallest nice step at or above the value", () => {
  assert.equal(niceCeil(7.6), 8);
  assert.equal(niceCeil(21), 25);
  assert.equal(niceCeil(2.3), 2.5);
  assert.equal(niceCeil(1), 1);
  assert.equal(niceCeil(10), 10);
  assert.equal(niceCeil(11), 15);
  assert.equal(niceCeil(960), 1000);
  assert.equal(niceCeil(4200), 5000);
});

test("niceCeil works below one and on exact steps without float noise", () => {
  assert.equal(niceCeil(0.3), 0.3);
  assert.equal(niceCeil(0.31), 0.4);
  assert.equal(niceCeil(25), 25);
  assert.equal(niceCeil(2.5), 2.5);
});

test("niceCeil of nothing is 1", () => {
  assert.equal(niceCeil(0), 1);
  assert.equal(niceCeil(-5), 1);
  assert.equal(niceCeil(Number.NaN), 1);
});
