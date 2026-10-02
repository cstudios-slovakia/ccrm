import assert from "node:assert/strict";
import test from "node:test";
import { excludedStatusKeys, toggleExcludedStatus } from "./statusEquation.ts";

const options = [
  { key: "new", closed: false },
  { key: "negotiation", closed: false },
  { key: "won", closed: true },
  { key: "refused", closed: true }
];

test("with nothing picked, the closed statuses are the excluded ones", () => {
  assert.deepEqual([...excludedStatusKeys(options, undefined)].sort(), ["refused", "won"]);
});

test("a pick replaces the default instead of adding to it", () => {
  assert.deepEqual([...excludedStatusKeys(options, ["new"])], ["new"]);
  // An explicitly empty pick means "exclude nothing", not "fall back".
  assert.equal(excludedStatusKeys(options, []).size, 0);
});

test("counting a closed status in stores the remaining exclusions", () => {
  assert.deepEqual(toggleExcludedStatus(options, undefined, "won"), ["refused"]);
});

test("excluding an open status adds it to the closed ones, in option order", () => {
  assert.deepEqual(toggleExcludedStatus(options, undefined, "new"), ["new", "won", "refused"]);
});

test("landing back on the default clears the pick so it follows Settings again", () => {
  assert.equal(toggleExcludedStatus(options, ["refused"], "won"), undefined);
  assert.equal(toggleExcludedStatus(options, ["new", "won", "refused"], "new"), undefined);
});

test("a status deleted in Settings is dropped from the stored pick", () => {
  assert.deepEqual(toggleExcludedStatus(options, ["gone", "won"], "new"), ["new", "won"]);
});
