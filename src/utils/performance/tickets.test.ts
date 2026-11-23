import test from "node:test";
import assert from "node:assert/strict";
import type { Ticket } from "../../types/index.ts";
import { DEFAULT_TICKET_STATUS_DEFS } from "../tickets.ts";
import { buildPeriod } from "./period.ts";
import { computeResponseTime, computeTicketsByStatus, firstResponseWithinSla } from "./tickets.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const NOW = new Date(2026, 10, 20, 15, 30);
const period = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), NOW); // previous: 12-31 Oct
const all = buildPeriod("all", null, null, NOW);
const HOUR = 3_600_000;

const ticket = (id: string, createdAt: string, over: Partial<Ticket> = {}): Ticket =>
  ({ id, ticketNumber: id, subject: id, status: "open", priority: "normal", type: "question", createdAt, ...over }) as unknown as Ticket;

/** "YYYY-MM-DD HH:MM:SS" (UTC) `hours` after the given stamp. */
const after = (stamp: string, hours: number): string =>
  new Date(Date.parse(`${stamp.replace(" ", "T")}Z`) + hours * HOUR).toISOString().slice(0, 19).replace("T", " ");

test("tickets by status category: five categories in order, shares, open count", () => {
  const statuses = DEFAULT_TICKET_STATUS_DEFS;
  const firstOf = (category: string) => statuses.find((s) => s.category === category)!.id;
  const tickets = [
    ticket("n", "2026-11-10 12:00:00", { status: firstOf("new") }),
    ticket("o1", "2026-11-10 12:00:00", { status: firstOf("open") }),
    ticket("o2", "2026-11-11 12:00:00", { status: firstOf("open") }),
    ticket("w", "2026-11-12 12:00:00", { status: firstOf("waiting") }),
    ticket("r", "2026-11-13 12:00:00", { status: firstOf("resolved") }),
    ticket("u", "2026-11-14 12:00:00", { status: "made-up-status" }), // unknown counts as open
    ticket("old", "2026-10-10 12:00:00", { status: firstOf("closed") }), // outside the period
  ];
  const d = computeTicketsByStatus({ tickets, ticketStatuses: statuses, period });
  assert.equal(d.total, 6);
  assert.equal(d.open, 5);
  assert.deepEqual(d.categories.map((c) => [c.category, c.count]), [["new", 1], ["open", 3], ["waiting", 1], ["resolved", 1], ["closed", 0]]);
  assert.equal(d.categories[1].sharePct, 50);
  assert.equal(d.categories[4].sharePct, 0);

  assert.equal(computeTicketsByStatus({ tickets, ticketStatuses: statuses, period: all }).total, 7);
});

test("tickets by status: empty input has five categories and no shares", () => {
  const d = computeTicketsByStatus({ tickets: [], ticketStatuses: DEFAULT_TICKET_STATUS_DEFS, period });
  assert.equal(d.total, 0);
  assert.equal(d.open, 0);
  assert.equal(d.categories.length, 5);
  assert.ok(d.categories.every((c) => c.sharePct === null && c.count === 0));
});

test("tickets by status: boundary, an instant on the first and last millisecond is in, one either side is out", () => {
  const at = (date: Date) => computeTicketsByStatus({ tickets: [ticket("x", date.toISOString())], ticketStatuses: DEFAULT_TICKET_STATUS_DEFS, period }).total;
  assert.equal(at(new Date(2026, 10, 1, 0, 0, 0, 0)), 1);
  assert.equal(at(new Date(2026, 10, 20, 23, 59, 59, 999)), 1);
  assert.equal(at(new Date(2026, 9, 31, 23, 59, 59, 999)), 0);
  assert.equal(at(new Date(2026, 10, 21, 0, 0, 0, 0)), 0);
});

test("a server stamp without a zone is UTC, converted to local before the day is compared", () => {
  // 23:30 UTC on 20 Nov is already 21 Nov east of UTC and still 20 Nov west of it.
  const stamp = "2026-11-20 23:30:00";
  const localDay = new Date(Date.parse("2026-11-20T23:30:00Z")).getDate();
  assert.equal(computeTicketsByStatus({ tickets: [ticket("x", stamp)], ticketStatuses: DEFAULT_TICKET_STATUS_DEFS, period }).total, localDay === 20 ? 1 : 0);
});

/* ------------------------------------------------------------------ response time */

const answered = (id: string, createdAt: string, hours: number) => ticket(id, createdAt, { slaFirstRespondedAt: after(createdAt, hours) });
const isWithinSla = (t: Ticket) => (t.id.startsWith("ok") ? true : t.id.startsWith("late") ? false : null);

const tickets = [
  answered("old-1", "2026-10-28 12:00:00", 1.5), // week 44, previous period
  answered("ok-1", "2026-11-03 12:00:00", 3), // week 45
  answered("late-1", "2026-11-17 12:00:00", 1), // week 47
  answered("none-1", "2026-11-18 12:00:00", 0.5), // week 47
  ticket("unanswered", "2026-11-18 12:00:00"),
];

test("average, change, share within the limit, and the last four ISO weeks", () => {
  const d = computeResponseTime({ tickets, period, today: NOW, slaMs: 4 * HOUR, isWithinSla });
  assert.equal(d.averageMs, 1.5 * HOUR); // (3 + 1 + 0.5) / 3
  assert.equal(d.deltaMs, 0); // previous period: 1.5 h
  assert.equal(d.withinSlaPct, 50); // ok-1 met, late-1 missed, none-1 not tracked
  assert.equal(d.slaMs, 4 * HOUR);
  assert.deepEqual(d.weeks, [
    { isoWeek: 44, averageMs: 1.5 * HOUR },
    { isoWeek: 45, averageMs: 3 * HOUR },
    { isoWeek: 46, averageMs: null },
    { isoWeek: 47, averageMs: 0.75 * HOUR },
  ]);
});

test("the weeks end with the week of the period end when it lies before today", () => {
  const october = buildPeriod("custom", day(2026, 10, 1), day(2026, 10, 31), NOW);
  const d = computeResponseTime({ tickets, period: october, today: NOW, slaMs: null, isWithinSla });
  assert.deepEqual(d.weeks.map((w) => w.isoWeek), [41, 42, 43, 44]); // 31 Oct is in week 44
  assert.equal(d.weeks[3].averageMs, 1.5 * HOUR);
  assert.equal(d.slaMs, null);
});

test("response time: empty input and no answered ticket give nulls, all time has no change", () => {
  const empty = computeResponseTime({ tickets: [], period, today: NOW, slaMs: null, isWithinSla });
  assert.deepEqual(empty, { averageMs: null, deltaMs: null, withinSlaPct: null, slaMs: null, weeks: empty.weeks });
  assert.equal(empty.weeks.length, 4);
  assert.ok(empty.weeks.every((w) => w.averageMs === null));

  const unansweredOnly = computeResponseTime({ tickets: [ticket("u", "2026-11-05 12:00:00")], period, today: NOW, slaMs: null, isWithinSla });
  assert.equal(unansweredOnly.averageMs, null);

  assert.equal(computeResponseTime({ tickets, period: all, today: NOW, slaMs: null, isWithinSla }).deltaMs, null);
});

test("response time period boundary on the creation instant", () => {
  const at = (date: Date) =>
    computeResponseTime({ tickets: [{ ...answered("ok-x", date.toISOString().slice(0, 19).replace("T", " "), 2) }], period, today: NOW, slaMs: null, isWithinSla }).averageMs;
  // Stamps are UTC, so build them from the instant.
  assert.equal(at(new Date(2026, 10, 1, 0, 0, 0, 0)), 2 * HOUR);
  assert.equal(at(new Date(2026, 10, 20, 23, 59, 59, 0)), 2 * HOUR);
  assert.equal(at(new Date(2026, 9, 31, 23, 59, 59, 0)), null);
  assert.equal(at(new Date(2026, 10, 21, 0, 0, 0, 0)), null);
});

test("firstResponseWithinSla compares the first response with the stamped due time", () => {
  const t = (due: string | null, responded: string | null) =>
    ticket("x", "2026-11-01 10:00:00", { slaFirstResponseDueAt: due, slaFirstRespondedAt: responded });
  assert.equal(firstResponseWithinSla(t("2026-11-01 14:00:00", "2026-11-01 13:59:59")), true);
  assert.equal(firstResponseWithinSla(t("2026-11-01 14:00:00", "2026-11-01 14:00:00")), true);
  assert.equal(firstResponseWithinSla(t("2026-11-01 14:00:00", "2026-11-01 14:00:01")), false);
  assert.equal(firstResponseWithinSla(t(null, "2026-11-01 14:00:00")), null);
  assert.equal(firstResponseWithinSla(t("2026-11-01 14:00:00", null)), null);
});
