import test from "node:test";
import assert from "node:assert/strict";
import { timesheetCost, timesheetCostTotal } from "./timesheetCost.ts";

test("own cost is summed and costless entries add nothing", () => {
  const r = timesheetCost([{ userId: "me", cost: 10.5 }, { userId: "me", cost: 4.5 }, { userId: "me", cost: null }], "me", false, "EUR");
  assert.deepEqual(r, { bag: { EUR: 15 }, hidden: false });
});

test("another person's cost without the permission is hidden, never a partial sum", () => {
  const r = timesheetCost([{ userId: "me", cost: 10 }, { userId: "other", cost: 5 }], "me", false, "EUR");
  assert.deepEqual(r, { bag: null, hidden: true });
  assert.deepEqual(timesheetCost([{ userId: "me", cost: 10 }, { userId: "other", cost: 5 }], "me", true, "EUR"), { bag: { EUR: 15 }, hidden: false });
});

test("no cost at all gives null, not zero", () => {
  assert.deepEqual(timesheetCost([{ userId: "me", cost: null }], "me", false, "EUR"), { bag: null, hidden: false });
  assert.deepEqual(timesheetCost([], "me", true, "EUR"), { bag: null, hidden: false });
});

test("two currencies stay apart in a row and in the total", () => {
  const a = timesheetCost([{ userId: "me", cost: 10, currency: "EUR" }, { userId: "me", cost: 20, currency: "HUF" }], "me", false, "EUR");
  assert.deepEqual(a.bag, { EUR: 10, HUF: 20 });
  const b = timesheetCost([{ userId: "me", cost: 5, currency: "EUR" }], "me", false, "EUR");
  assert.deepEqual(timesheetCostTotal([a, b, { bag: null, hidden: false }]).bag, { EUR: 15, HUF: 20 });
});

test("the total is hidden when any row is hidden", () => {
  assert.deepEqual(timesheetCostTotal([{ bag: { EUR: 1 }, hidden: false }, { bag: null, hidden: true }]), { bag: null, hidden: true });
});
