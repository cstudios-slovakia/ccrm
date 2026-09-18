import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialRecord } from "../types";
import {
  addIsoMonths,
  claimedRecordIds,
  futureTotals,
  futureWindow,
  hasFutureBeyond,
  nextFutureWindow,
  projectFutureMovements
} from "./futureMovements.ts";

const TODAY = "2026-09-17";

const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id || "r",
  type: "expense",
  title: over.title || "movement",
  amountPlanned: 0,
  amountReal: 0,
  status: "pending",
  issueDate: "2026-09-01",
  isRecurring: false,
  ...over
});

const rule = (over: Partial<FinancialRecord>): FinancialRecord =>
  rec({
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 5 },
    recurringStartDate: "2026-01-05",
    amountPlanned: 500,
    ...over
  });

// ==========================================
// Window maths
// ==========================================

test("a one-month window starts tomorrow and ends on the same day next month", () => {
  assert.deepEqual(futureWindow(TODAY, 1), { startIso: "2026-09-18", endIso: "2026-10-17" });
});

test("widening the window keeps the same start and pushes the end out a month at a time", () => {
  assert.deepEqual(futureWindow(TODAY, 3), { startIso: "2026-09-18", endIso: "2026-12-17" });
});

test("the next window picks up exactly where the loaded one stopped, with no gap or overlap", () => {
  const loaded = futureWindow(TODAY, 2);
  const next = nextFutureWindow(TODAY, 2);
  assert.equal(loaded.endIso, "2026-11-17");
  assert.equal(next.startIso, "2026-11-18");
  assert.equal(next.endIso, "2026-12-17");
});

test("a month added to the 31st lands on the end of a shorter month, not in the month after", () => {
  assert.equal(addIsoMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addIsoMonths("2026-12-15", 1), "2027-01-15");
});

// ==========================================
// Recurring rules
// ==========================================

test("a monthly rule contributes one row per charge inside the window and none outside it", () => {
  const out = projectFutureMovements([rule({ id: "rent", title: "Rent" })], "2026-09-18", "2026-12-17");
  assert.deepEqual(
    out.map((m) => m.date),
    ["2026-10-05", "2026-11-05", "2026-12-05"]
  );
  assert.ok(out.every((m) => m.source === "recurring" && m.amount === 500));
});

test("a re-priced rule charges each future month at the amount now in force", () => {
  const out = projectFutureMovements(
    [
      rule({
        id: "rent",
        amountPlanned: 600,
        recurringAmountHistory: [{ until: "2026-09-17", amountPlanned: 500, amountReal: 500 }]
      })
    ],
    "2026-09-18",
    "2026-11-17"
  );
  assert.deepEqual(
    out.map((m) => m.amount),
    [600, 600]
  );
});

test("a rule past its end date stops charging", () => {
  const out = projectFutureMovements(
    [rule({ id: "rent", recurringEndDate: "2026-10-31" })],
    "2026-09-18",
    "2026-12-17"
  );
  assert.deepEqual(
    out.map((m) => m.date),
    ["2026-10-05"]
  );
});

test("a paused rule charges nothing at all", () => {
  const out = projectFutureMovements([rule({ id: "rent", status: "cancelled" })], "2026-09-18", "2026-12-17");
  assert.deepEqual(out, []);
});

test("a rule already marked paid still charges ahead - the payment settled one month, not the rule", () => {
  const out = projectFutureMovements([rule({ id: "rent", status: "paid" })], "2026-09-18", "2026-10-17");
  assert.deepEqual(
    out.map((m) => m.date),
    ["2026-10-05"]
  );
});

// ==========================================
// Invoices and one-off movements
// ==========================================

test("an invoice issued in the past but payable inside the window is forecast on its due date", () => {
  const out = projectFutureMovements(
    [
      rec({
        id: "fa1",
        type: "income",
        title: "FA2026-014",
        issueDate: "2026-08-20",
        dueDate: "2026-10-05",
        amountPlanned: 1200
      })
    ],
    "2026-09-18",
    "2026-10-17"
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "2026-10-05");
  assert.equal(out[0].source, "due");
  assert.equal(out[0].amount, 1200);
  assert.equal(out[0].type, "income");
});

test("a partially paid invoice is forecast for the remainder only", () => {
  const out = projectFutureMovements(
    [
      rec({
        id: "fa2",
        type: "income",
        status: "partially_paid",
        issueDate: "2026-08-20",
        dueDate: "2026-10-05",
        amountPlanned: 9200,
        amountReal: 4000
      })
    ],
    "2026-09-18",
    "2026-10-17"
  );
  assert.deepEqual(
    out.map((m) => m.amount),
    [5200]
  );
});

test("a movement with no due date is forecast on the day it was entered for", () => {
  const out = projectFutureMovements(
    [rec({ id: "s1", issueDate: "2026-10-01", amountPlanned: 300 })],
    "2026-09-18",
    "2026-10-17"
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "2026-10-01");
  assert.equal(out[0].source, "scheduled");
});

test("a paid or cancelled movement is never forecast", () => {
  const out = projectFutureMovements(
    [
      rec({ id: "p", status: "paid", dueDate: "2026-10-05", amountPlanned: 100, amountReal: 100 }),
      rec({ id: "c", status: "cancelled", dueDate: "2026-10-06", amountPlanned: 100 })
    ],
    "2026-09-18",
    "2026-10-17"
  );
  assert.deepEqual(out, []);
});

test("an overdue invoice is not a future movement - its date is behind us", () => {
  const out = projectFutureMovements(
    [rec({ id: "od", status: "overdue", issueDate: "2026-07-01", dueDate: "2026-08-15", amountPlanned: 400 })],
    "2026-09-18",
    "2026-10-17"
  );
  assert.deepEqual(out, []);
});

test("movements dated today stay in the ledger and are not repeated in the forecast", () => {
  const window = futureWindow(TODAY, 1);
  const out = projectFutureMovements(
    [rec({ id: "t", issueDate: TODAY, dueDate: TODAY, amountPlanned: 50 })],
    window.startIso,
    window.endIso
  );
  assert.deepEqual(out, []);
});

test("a zero-value movement produces no row", () => {
  const out = projectFutureMovements(
    [rec({ id: "z", dueDate: "2026-10-05", amountPlanned: 0, amountReal: 0 })],
    "2026-09-18",
    "2026-10-17"
  );
  assert.deepEqual(out, []);
});

// ==========================================
// Ordering, claims and totals
// ==========================================

test("rows come back oldest first whatever order the records arrived in", () => {
  const out = projectFutureMovements(
    [
      rec({ id: "b", title: "B", dueDate: "2026-10-12", amountPlanned: 10 }),
      rule({ id: "rent", title: "Rent" }),
      rec({ id: "a", title: "A", dueDate: "2026-09-20", amountPlanned: 10 })
    ],
    "2026-09-18",
    "2026-10-17"
  );
  assert.deepEqual(
    out.map((m) => m.date),
    ["2026-09-20", "2026-10-05", "2026-10-12"]
  );
});

test("the forecast claims the invoices it moved forward, but never a recurring rule", () => {
  const out = projectFutureMovements(
    [rule({ id: "rent" }), rec({ id: "fa", dueDate: "2026-10-05", amountPlanned: 100 })],
    "2026-09-18",
    "2026-10-17"
  );
  const claimed = claimedRecordIds(out);
  assert.ok(claimed.has("fa"));
  assert.ok(!claimed.has("rent"));
});

test("a rule that starts in the future is its own first charge — claimed, not drawn twice", () => {
  const upcoming = rule({
    id: "pausal",
    type: "income",
    issueDate: "2026-10-01",
    dueDate: "2026-10-10",
    recurringStartDate: "2026-10-01",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 }
  });
  const running = rule({ id: "rent" });

  const out = projectFutureMovements([upcoming, running], "2026-09-18", "2026-10-17");

  assert.deepEqual(
    out.filter((m) => m.record.id === "pausal").map((m) => m.date),
    ["2026-10-01"]
  );
  const claimed = claimedRecordIds(out);
  assert.ok(claimed.has("pausal"));
  // A rule that started months ago keeps its row; its charges sit beside it.
  assert.ok(!claimed.has("rent"));
});

test("a part-paid invoice is not claimed — the money already received stays where it arrived", () => {
  const partial = rec({
    id: "fa2",
    type: "income",
    status: "partially_paid",
    issueDate: "2026-09-01",
    paidDate: "2026-09-05",
    dueDate: "2026-10-15",
    amountPlanned: 9200,
    amountReal: 4000
  });

  const out = projectFutureMovements([partial], "2026-09-18", "2026-10-17");

  // Only the outstanding part is forecast...
  assert.deepEqual(out.map((m) => m.amount), [5200]);
  // ...and the record keeps its ledger row, or the 4 000 € already in the bank
  // would disappear from September the moment the overlay was switched on.
  assert.ok(!claimedRecordIds(out).has("fa2"));
});

test("totals separate what is coming in from what is going out", () => {
  const out = projectFutureMovements(
    [
      rec({ id: "in", type: "income", dueDate: "2026-10-01", amountPlanned: 1000 }),
      rec({ id: "out", type: "expense", dueDate: "2026-10-02", amountPlanned: 250 })
    ],
    "2026-09-18",
    "2026-10-17"
  );
  assert.deepEqual(futureTotals(out), { income: 1000, expense: 250, net: 750 });
});

// ==========================================
// Loading another month
// ==========================================

test("another month is offered while an open-ended rule keeps charging", () => {
  assert.equal(hasFutureBeyond([rule({ id: "rent" })], TODAY, 1), true);
  assert.equal(hasFutureBeyond([rule({ id: "rent" })], TODAY, 12), true);
});

test("no further month is offered once every source has run out", () => {
  const records = [
    rule({ id: "rent", recurringEndDate: "2026-11-30" }),
    rec({ id: "fa", dueDate: "2026-10-05", amountPlanned: 100 })
  ];
  // Past one loaded month (to 17 October) the rule still charges on 5 November;
  // past two there is nothing left, so no further month is worth offering.
  assert.equal(hasFutureBeyond(records, TODAY, 1), true);
  assert.equal(hasFutureBeyond(records, TODAY, 2), false);
});

test("another month is not offered when the active filters would hide everything in it", () => {
  const records = [rule({ id: "rent", type: "expense" })];
  assert.equal(hasFutureBeyond(records, TODAY, 1, (m) => m.type === "expense"), true);
  assert.equal(hasFutureBeyond(records, TODAY, 1, (m) => m.type === "income"), false);
});

test("nothing is offered, and nothing forecast, when there is nothing to forecast", () => {
  assert.equal(hasFutureBeyond([], TODAY, 1), false);
  assert.deepEqual(projectFutureMovements([], "2026-09-18", "2026-10-17"), []);
});
