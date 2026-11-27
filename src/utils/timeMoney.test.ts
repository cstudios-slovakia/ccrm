import test from "node:test";
import assert from "node:assert/strict";
import { isFixedPayEntry, withoutFixedPayMoney, withoutFixedPayMoneyList } from "./timeMoney.ts";

const entry = (over: Record<string, unknown> = {}) => ({
  userId: "u1",
  cost: 12.5,
  costRate: 25,
  costRateSource: "monthly",
  costRateBasisDays: 21,
  billableRate: 60,
  ...over,
});

test("fixed pay sources are monthly and daily, nothing else", () => {
  assert.equal(isFixedPayEntry({ costRateSource: "monthly" }), true);
  assert.equal(isFixedPayEntry({ costRateSource: "daily" }), true);
  for (const s of ["hourly", "contractor_hourly", "contractor_daily", "contractor_monthly", "none", null, undefined]) {
    assert.equal(isFixedPayEntry({ costRateSource: s }), false, String(s));
  }
});

test("own fixed-pay entry loses every money field", () => {
  const out = withoutFixedPayMoney(entry(), "u1", false) as Record<string, unknown>;
  for (const k of ["cost", "costRate", "costRateSource", "costRateBasisDays", "billableRate"]) assert.equal(k in out, false, k);
  assert.equal(out.userId, "u1");
});

test("an admin with the costs permission keeps the sums of an employee on a monthly salary", () => {
  const e = entry({ userId: "emp" });
  assert.equal(withoutFixedPayMoney(e, "admin", true), e);
  assert.equal(withoutFixedPayMoney(entry(), "u1", true).cost, 12.5);
});

test("own hourly and contractor entries keep their cost", () => {
  for (const costRateSource of ["hourly", "contractor_hourly", "contractor_monthly"]) {
    const e = entry({ costRateSource });
    assert.equal(withoutFixedPayMoney(e, "u1", false), e);
  }
});

test("someone else's entry is left to withoutHiddenCost", () => {
  const e = entry({ userId: "other" });
  assert.equal(withoutFixedPayMoney(e, "u1", false), e);
});

test("the list keeps its identity when nothing changes", () => {
  const list = [entry({ costRateSource: "hourly" })];
  assert.equal(withoutFixedPayMoneyList(list, "u1", false), list);
  assert.equal(withoutFixedPayMoneyList([entry()], "u1", true).length, 1);
  const stripped = withoutFixedPayMoneyList([entry(), entry({ costRateSource: "hourly" })], "u1", false);
  assert.equal("cost" in stripped[0], false);
  assert.equal(stripped[1].cost, 12.5);
});
