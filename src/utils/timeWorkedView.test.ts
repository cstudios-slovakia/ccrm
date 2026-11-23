import test from "node:test";
import assert from "node:assert/strict";
import { makeT } from "./timeTracking.ts";
import { ofYourTimeLabel, parallelWith, workedAndDeliveredLabel } from "./timeWorkedView.ts";

const t = makeT("en");
const e = (id: string, from: string, to: string, userId = "u1") => ({
  id, userId, title: id, running: false,
  startAt: `2026-11-19T${from}:00Z`, endAt: `2026-11-19T${to}:00Z`, durationSec: 0,
});

test("label shows both numbers only when they differ", () => {
  assert.equal(workedAndDeliveredLabel(t, 6 * 3600, 2 * 3600), "Worked 2:00 · Delivered 6:00");
  assert.equal(workedAndDeliveredLabel(t, 3600, 3600), null);
  assert.match(workedAndDeliveredLabel(makeT("sk"), 6 * 3600, 2 * 3600) ?? "", /Odpracované 2:00 · Dodané 6:00/);
});

test("of-your-time line", () => {
  assert.equal(ofYourTimeLabel(t, 7200, 2400), "0:40 of your time");
  assert.equal(ofYourTimeLabel(makeT("hu"), 7200, 2400), "0:40 a saját idődből");
  assert.equal(ofYourTimeLabel(t, 7200, 7200), null);
});

test("parallelWith finds the same user's overlapping entries only", () => {
  const a = e("a", "09:00", "11:00");
  const list = [a, e("c", "10:00", "12:00"), e("b", "09:30", "10:00"), e("x", "09:00", "11:00", "u2"), e("late", "11:00", "12:00")];
  assert.deepEqual(parallelWith(a, list, 0).map((o) => o.id), ["b", "c"]);
});
