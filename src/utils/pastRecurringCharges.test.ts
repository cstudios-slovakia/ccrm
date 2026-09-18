import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialCategory, FinancialRecord, FinancialType } from "../types";
import { aggregateOverviewTable, overviewRecordDate, type OverviewColumn } from "./financialOverviewTable.ts";
import { futureWindow, projectFutureMovements } from "./futureMovements.ts";
import { ledgerRecordSplit, projectPastRecurringCharges } from "./pastRecurringCharges.ts";

const TODAY = "2026-09-18";

const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id || "r",
  type: "expense",
  title: over.title || over.id || "movement",
  categoryId: null,
  amountPlanned: 0,
  amountReal: 0,
  status: "pending",
  issueDate: "2026-09-01",
  isRecurring: false,
  ...over
});

/** A monthly rule on the 1st, 500 €, running since June, entered and paid on its first charge. */
const rule = (over: Partial<FinancialRecord>): FinancialRecord =>
  rec({
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 },
    recurringStartDate: "2026-06-01",
    issueDate: "2026-06-01",
    paidDate: "2026-06-01",
    status: "paid",
    amountPlanned: 500,
    amountReal: 500,
    ...over
  });

const chargesOf = (records: FinancialRecord[], id: string, today = TODAY) =>
  projectPastRecurringCharges(records, today)
    .charges.filter((c) => c.record.id === id)
    .map((c) => [c.date, c.amount]);

// ==========================================
// Which charges are drawn
// ==========================================

test("a rule started months ago draws every charge up to today, and its own row once", () => {
  const rent = rule({ id: "rent", title: "Rent" });
  const ledger = projectPastRecurringCharges([rent], TODAY);

  assert.deepEqual(
    ledger.charges.map((c) => [c.date, c.amount]),
    [
      ["2026-06-01", 500],
      ["2026-07-01", 500],
      ["2026-08-01", 500],
      ["2026-09-01", 500]
    ]
  );
  // The 1 June row is the June charge: drawn as the charge, not beside it.
  assert.ok(ledger.claimedIds.has("rent"));
  assert.ok(!ledger.uncountedIds.has("rent"));
  assert.ok(ledger.charges.every((c) => c.type === "expense" && c.record === rent));
});

test("each charge has a stable id of its own, distinct from the rule's and from the forecast's", () => {
  const rent = rule({ id: "rent" });
  const ids = projectPastRecurringCharges([rent], TODAY).charges.map((c) => c.id);
  assert.deepEqual(ids, [
    "past:recurring:rent:2026-06-01",
    "past:recurring:rent:2026-07-01",
    "past:recurring:rent:2026-08-01",
    "past:recurring:rent:2026-09-01"
  ]);
  const forecastIds = projectFutureMovements([rent], "2026-09-19", "2026-12-31").map((m) => m.id);
  assert.ok(forecastIds.every((id) => !ids.includes(id) && id !== "rent"));
});

test("a rule row on a later charge date is that charge — one payment, drawn once", () => {
  // Started in June but entered (and settled) on the August charge.
  const rent = rule({ id: "rent", issueDate: "2026-08-01", paidDate: "2026-08-01" });
  const ledger = projectPastRecurringCharges([rent], TODAY);

  assert.equal(ledger.charges.filter((c) => c.date === "2026-08-01").length, 1);
  assert.ok(ledger.claimedIds.has("rent"));
  // June and July are charges the schedule made before anyone entered the row.
  assert.deepEqual(
    ledger.charges.map((c) => c.date),
    ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]
  );
});

test("a charge on the rule's own day is settled whatever the row's status says", () => {
  // The row is still "pending", but the schedule charged on that day and the
  // table counts it as real — the charge row carries it, real.
  const rent = rule({ id: "rent", status: "pending", paidDate: null, amountReal: 0 });
  const ledger = projectPastRecurringCharges([rent], TODAY);
  assert.ok(ledger.claimedIds.has("rent"));
  assert.deepEqual(ledger.charges[0], {
    id: "past:recurring:rent:2026-06-01",
    record: rent,
    type: "expense",
    date: "2026-06-01",
    amount: 500
  });
});

test("a rule row that comes before its schedule stays, counts, and its charges follow it", () => {
  // Entered and paid on 18 March, set to charge on the 1st: the first charge
  // is 1 April, and the 18 March payment is the rule's first one.
  const fee = rule({
    id: "fee",
    type: "income",
    amountPlanned: 280,
    amountReal: 280,
    recurringStartDate: "2026-03-18",
    issueDate: "2026-03-18",
    paidDate: "2026-03-18"
  });
  const ledger = projectPastRecurringCharges([fee], TODAY);

  assert.deepEqual(
    ledger.charges.map((c) => c.date),
    ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]
  );
  assert.ok(!ledger.claimedIds.has("fee"));
  assert.ok(!ledger.uncountedIds.has("fee"));
  assert.deepEqual(ledgerRecordSplit(fee, ledger), { real: 280, estimated: 0 });

  // Planned rather than paid, the first payment is still expected, not settled.
  const planned = { ...fee, status: "planned" as const, paidDate: null, amountReal: 0 };
  assert.deepEqual(ledgerRecordSplit(planned, projectPastRecurringCharges([planned], TODAY)), {
    real: 0,
    estimated: 280
  });
});

test("a rule row after a charge, on a day the schedule does not charge, stays visible and adds nothing", () => {
  // Charges on the 1st since February, but the row was paid on 5 February:
  // the 1 February charge already paid for February.
  const late = rule({
    id: "late",
    recurringStartDate: "2026-02-01",
    issueDate: "2026-02-05",
    paidDate: "2026-02-05"
  });
  const ledger = projectPastRecurringCharges([late], TODAY);

  assert.ok(!ledger.claimedIds.has("late"), "the rule is still on screen to be edited");
  assert.ok(ledger.uncountedIds.has("late"));
  assert.deepEqual(ledgerRecordSplit(late, ledger), { real: 0, estimated: 0 });
  assert.equal(ledger.charges.length, 8, "February to September");
});

test("a rule dated ahead of today with past charges behind it adds nothing either", () => {
  // Due in October, charging since June: the June–September charges are drawn
  // and the October row is not a fifth payment on top of them.
  const rent = rule({ id: "rent", issueDate: "2026-06-01", paidDate: null, dueDate: "2026-10-10", status: "pending" });
  const ledger = projectPastRecurringCharges([rent], TODAY);
  assert.ok(ledger.uncountedIds.has("rent"));
  assert.equal(ledger.charges.length, 4);
});

// ==========================================
// Pause, price history, today
// ==========================================

test("a paused rule keeps every charge on or before its end date as real, and none after", () => {
  const gym = rule({
    id: "gym",
    recurringFrequency: "weekly",
    recurringConfig: { dayOfWeek: 1 },
    recurringStartDate: "2026-07-06",
    recurringEndDate: "2026-08-17",
    issueDate: "2026-07-06",
    paidDate: "2026-07-06",
    amountPlanned: 40,
    amountReal: 40
  });
  assert.deepEqual(chargesOf([gym], "gym"), [
    ["2026-07-06", 40],
    ["2026-07-13", 40],
    ["2026-07-20", 40],
    ["2026-07-27", 40],
    ["2026-08-03", 40],
    ["2026-08-10", 40],
    ["2026-08-17", 40]
  ]);

  // A rule paused the old way, by status alone, has not erased its history.
  const legacy = rule({ id: "legacy", status: "cancelled" });
  assert.equal(chargesOf([legacy], "legacy").length, 4);
});

test("a charge before a price change keeps the old amount", () => {
  const rent = rule({
    id: "rent",
    recurringStartDate: "2026-04-01",
    issueDate: "2026-04-01",
    paidDate: "2026-04-01",
    amountPlanned: 600,
    amountReal: 600,
    recurringAmountHistory: [{ until: "2026-06-30", amountPlanned: 500, amountReal: 500 }]
  });
  assert.deepEqual(chargesOf([rent], "rent"), [
    ["2026-04-01", 500],
    ["2026-05-01", 500],
    ["2026-06-01", 500],
    ["2026-07-01", 600],
    ["2026-08-01", 600],
    ["2026-09-01", 600]
  ]);
});

test("a charge dated today is drawn here and not in the forecast; tomorrow's is the forecast's", () => {
  const rent = rule({
    id: "rent",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 18 },
    recurringStartDate: "2026-07-18",
    issueDate: "2026-07-18",
    paidDate: "2026-07-18"
  });
  const past = projectPastRecurringCharges([rent], TODAY).charges.map((c) => c.date);
  const window = futureWindow(TODAY, 2);
  const future = projectFutureMovements([rent], window.startIso, window.endIso).map((m) => m.date);

  assert.deepEqual(past, ["2026-07-18", "2026-08-18", "2026-09-18"]);
  assert.deepEqual(future, ["2026-10-18", "2026-11-18"]);
  // Every charge lands on exactly one side of today.
  assert.equal(new Set([...past, ...future]).size, past.length + future.length);
});

// ==========================================
// Edges
// ==========================================

test("one-off movements, rules that have not started and zero-value rules draw no charges", () => {
  const ledger = projectPastRecurringCharges(
    [
      rec({ id: "one-off", status: "paid", amountPlanned: 100, amountReal: 100, paidDate: "2026-09-01" }),
      rule({ id: "upcoming", recurringStartDate: "2026-10-01", issueDate: "2026-10-01", paidDate: null, status: "planned" }),
      rule({ id: "free", amountPlanned: 0, amountReal: 0 })
    ],
    TODAY
  );
  assert.deepEqual(ledger.charges, []);
  // A rule that has not charged yet keeps its row exactly as before; so does a
  // zero-value rule, which has no charge row that could stand in for it.
  assert.ok(!ledger.claimedIds.has("upcoming") && !ledger.uncountedIds.has("upcoming"));
  assert.ok(!ledger.claimedIds.has("free"));
});

test("a rule with no start date is drawn from its own row onwards", () => {
  const old = rule({ id: "old", recurringStartDate: null, issueDate: "2026-08-01", paidDate: "2026-08-01" });
  assert.deepEqual(
    chargesOf([old], "old").map(([date]) => date),
    ["2026-08-01", "2026-09-01"]
  );
});

// ==========================================
// Cross-check against the overview table
// ==========================================

const categories: FinancialCategory[] = [
  { id: "exp", type: "expense", name: "exp", level: 1, parentId: null },
  { id: "inc", type: "income", name: "inc", level: 1, parentId: null }
];

/** 2026 in monthly columns, the way the view builds them: a column is future once its 1st is after today. */
const monthColumns: OverviewColumn[] = Array.from({ length: 12 }, (_, i) => {
  const m = String(i + 1).padStart(2, "0");
  const startIso = `2026-${m}-01`;
  return {
    id: `2026-${m}`,
    startIso,
    endIso: new Date(Date.UTC(2026, i + 1, 0)).toISOString().slice(0, 10),
    isFuture: startIso > TODAY
  };
});

type Split = { real: number; estimated: number };
type MonthTotals = Record<FinancialType, Split>;

/**
 * The ledger's month headers with the forecast overlay off, summed the way
 * `groupedMovementsByMonth` sums them: every stored record except the rule
 * rows a charge stands in for, filed under its ledger date and worth
 * `ledgerRecordSplit`, plus every past charge as settled money.
 */
function ledgerMonthTotals(records: FinancialRecord[], today: string): Map<string, MonthTotals> {
  const ledger = projectPastRecurringCharges(records, today);
  const months = new Map<string, MonthTotals>();
  const add = (type: FinancialType, date: string, { real, estimated }: Split) => {
    const key = date.slice(0, 7);
    const month = months.get(key) ?? { income: { real: 0, estimated: 0 }, expense: { real: 0, estimated: 0 } };
    month[type].real += real;
    month[type].estimated += estimated;
    months.set(key, month);
  };
  records.forEach((r) => {
    if (ledger.claimedIds.has(r.id)) return;
    add(r.type, overviewRecordDate(r), ledgerRecordSplit(r, ledger));
  });
  ledger.charges.forEach((c) => add(c.type, c.date, { real: c.amount, estimated: 0 }));
  return months;
}

test("every month's ledger totals equal the overview table's column for the same records", () => {
  const records: FinancialRecord[] = [
    // Own row on its first charge.
    rule({ id: "rent", categoryId: "exp" }),
    // Own row before the schedule.
    rule({
      id: "fee",
      type: "income",
      categoryId: "inc",
      amountPlanned: 280,
      amountReal: 280,
      recurringStartDate: "2026-03-18",
      issueDate: "2026-03-18",
      paidDate: "2026-03-18"
    }),
    // Own row after a charge, not on a charge date.
    rule({ id: "late", categoryId: "exp", recurringStartDate: "2026-02-01", issueDate: "2026-02-05", paidDate: "2026-02-05" }),
    // Paused, still "pending", uncategorized.
    rule({
      id: "gym",
      recurringFrequency: "weekly",
      recurringConfig: { dayOfWeek: 1 },
      recurringStartDate: "2026-07-06",
      recurringEndDate: "2026-08-17",
      issueDate: "2026-07-06",
      paidDate: null,
      status: "pending",
      amountPlanned: 40,
      amountReal: 0
    }),
    // Re-priced mid-year.
    rule({
      id: "lease",
      categoryId: "exp",
      recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 15 },
      recurringStartDate: "2026-01-15",
      issueDate: "2026-01-15",
      paidDate: "2026-01-15",
      amountPlanned: 900,
      amountReal: 900,
      recurringAmountHistory: [{ until: "2026-05-31", amountPlanned: 800, amountReal: 800 }]
    }),
    // Charges today, and paused the old way by status.
    rule({
      id: "retainer",
      type: "income",
      categoryId: "inc",
      status: "cancelled",
      recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 18 },
      recurringStartDate: "2026-05-18",
      issueDate: "2026-05-18",
      paidDate: null,
      amountPlanned: 1200,
      amountReal: 0
    }),
    // Charges later this month than today.
    rule({
      id: "internet",
      categoryId: "exp",
      recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 25 },
      recurringStartDate: "2026-04-25",
      issueDate: "2026-04-25",
      paidDate: "2026-04-25",
      amountPlanned: 30,
      amountReal: 30
    }),
    // One-off movements in every state.
    rec({ id: "inv-paid", type: "income", categoryId: "inc", status: "paid", amountPlanned: 2500, amountReal: 2500, issueDate: "2026-07-02", paidDate: "2026-07-09" }),
    rec({ id: "inv-part", type: "income", categoryId: "inc", status: "partially_paid", amountPlanned: 9200, amountReal: 4000, issueDate: "2026-08-20", dueDate: "2026-09-05" }),
    rec({ id: "bill-overdue", categoryId: "exp", status: "overdue", amountPlanned: 350, issueDate: "2026-08-01", dueDate: "2026-08-15" }),
    rec({ id: "bill-cancelled", categoryId: "exp", status: "cancelled", amountPlanned: 75, issueDate: "2026-06-11" })
  ];

  const table = aggregateOverviewTable(records, categories, monthColumns);
  const ledger = ledgerMonthTotals(records, TODAY);
  const zero: Split = { real: 0, estimated: 0 };
  const cell = ({ real, estimated }: Split) => ({ real, estimated });

  // Every month that has fully elapsed: identical, settled and expected alike.
  monthColumns
    .filter((col) => col.endIso < TODAY)
    .forEach((col) => {
      const month = ledger.get(col.id);
      assert.deepEqual(cell(month?.income ?? zero), cell(table.totalIncomesByCol[col.id]), `income, ${col.id}`);
      assert.deepEqual(cell(month?.expense ?? zero), cell(table.totalExpensesByCol[col.id]), `expense, ${col.id}`);
    });

  // The current month: the table's column is not a future one, so it also
  // counts as real the charges still to come this month. The ledger draws
  // those in the forecast overlay, which starts tomorrow. Add them back and
  // the month agrees too.
  const september = ledger.get("2026-09")!;
  const rest = projectFutureMovements(records, futureWindow(TODAY, 1).startIso, "2026-09-30").filter(
    (m) => m.source === "recurring"
  );
  const restOf = (type: FinancialType) => rest.filter((m) => m.type === type).reduce((s, m) => s + m.amount, 0);
  assert.deepEqual(rest.map((m) => [m.record.id, m.date]), [["internet", "2026-09-25"]]);
  assert.deepEqual(
    { real: september.income.real + restOf("income"), estimated: september.income.estimated },
    cell(table.totalIncomesByCol["2026-09"])
  );
  assert.deepEqual(
    { real: september.expense.real + restOf("expense"), estimated: september.expense.estimated },
    cell(table.totalExpensesByCol["2026-09"])
  );

  // And the fixture really does exercise the charges: May is late + the lease
  // at its old price + internet; June adds the rent and the lease's new price.
  assert.deepEqual(cell(ledger.get("2026-05")!.expense), { real: 500 + 800 + 30, estimated: 0 });
  assert.deepEqual(cell(ledger.get("2026-06")!.expense), { real: 500 + 500 + 900 + 30, estimated: 0 });
});
