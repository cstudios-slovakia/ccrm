import test from "node:test";
import assert from "node:assert/strict";
import {
  getMondayOfWeek,
  getWeekDates,
  getIsoWeekNumber,
  extractWeeklyPlanRefs,
  weeklyPlanRefKey,
  collectWeekFilterChips,
  cardMatchesActiveFilters,
  type WeeklyPlanEntity,
  type WeeklyPlanCard,
} from "./weeklyPlanApi.ts";

test("getMondayOfWeek and getWeekDates compute Mon-Fri and Mon-Sun ranges", () => {
  // Wednesday 2026-11-11
  const wed = new Date(2026, 10, 11, 15, 30, 0);
  const mon = getMondayOfWeek(wed);
  assert.deepEqual(getWeekDates(mon, true), [
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
  ]);
  assert.deepEqual(getWeekDates(mon, false), [
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
  ]);

  // Sunday 2026-11-15 resolves back to the same Monday 2026-11-09
  const sun = new Date(2026, 10, 15, 22, 0, 0);
  assert.equal(getWeekDates(sun, false)[0], "2026-11-09");
  assert.equal(getIsoWeekNumber(mon), 46);
});

const SAMPLE_ENTITIES: WeeklyPlanEntity[] = [
  { id: "proj-1", name: "Web Redesign", type: "project" },
  { id: "client-1", name: "Novák Stavby s.r.o.", type: "client" },
  { id: "lead-1", name: "Acme Corp", type: "lead" },
  { id: "emp-1", name: "Erik Putz", type: "employee" },
  { id: "tk-1", name: "TK-104 Server down", type: "ticket" },
  { id: "task-1", name: "Fix login bug", type: "task" },
  { id: "usr-1", name: "Mária", type: "user" },
];

test("extractWeeklyPlanRefs handles multi-word @entities, #tags, and ignores plain emails", () => {
  const content =
    "Review @Web Redesign for @Novák Stavby s.r.o. with @Erik Putz, check @Fix login bug & @TK-104 Server down #urgent #q4-goal (email: erik@example.com)";
  const refs = extractWeeklyPlanRefs(content, SAMPLE_ENTITIES);

  const kindsAndIds = refs.map((r) => `${r.kind}:${r.id}`);
  assert.ok(kindsAndIds.includes("project:proj-1"));
  assert.ok(kindsAndIds.includes("client:client-1"));
  assert.ok(kindsAndIds.includes("employee:emp-1"));
  assert.ok(kindsAndIds.includes("task:task-1"));
  assert.ok(kindsAndIds.includes("ticket:tk-1"));
  assert.ok(kindsAndIds.includes("tag:urgent"));
  assert.ok(kindsAndIds.includes("tag:q4-goal"));
  // Email domain must NOT become a mention reference
  assert.equal(refs.some((r) => r.label.includes("example.com")), false);
});

test("collectWeekFilterChips and cardMatchesActiveFilters dim unfiltered cards cleanly", () => {
  const cardA: WeeklyPlanCard = {
    id: "c1",
    date: "2026-11-09",
    content: "Kickoff @Web Redesign #urgent",
    position: 0,
    completed: false,
    refs: extractWeeklyPlanRefs("Kickoff @Web Redesign #urgent", SAMPLE_ENTITIES),
  };
  const cardB: WeeklyPlanCard = {
    id: "c2",
    date: "2026-11-10",
    content: "Follow up @Acme Corp with @Mária #urgent",
    position: 0,
    completed: false,
    refs: extractWeeklyPlanRefs("Follow up @Acme Corp with @Mária #urgent", SAMPLE_ENTITIES),
  };
  const cardC: WeeklyPlanCard = {
    id: "c3",
    date: "2026-11-11",
    content: "Internal team sync",
    position: 0,
    completed: false,
    refs: [],
  };

  const chips = collectWeekFilterChips([cardA, cardB, cardC], SAMPLE_ENTITIES);
  const urgentChip = chips.find((c) => c.kind === "tag" && c.label === "urgent");
  const projChip = chips.find((c) => c.kind === "project" && c.id === "proj-1");
  const leadChip = chips.find((c) => c.kind === "lead" && c.id === "lead-1");

  assert.equal(urgentChip?.count, 2);
  assert.equal(projChip?.count, 1);
  assert.equal(leadChip?.count, 1);

  // With no active filters, all cards match (100% opacity)
  assert.equal(cardMatchesActiveFilters(cardA, new Set(), SAMPLE_ENTITIES), true);
  assert.equal(cardMatchesActiveFilters(cardC, new Set(), SAMPLE_ENTITIES), true);

  // Filtering by @Web Redesign keeps cardA visible and marks cardB + cardC as unfiltered (10% opacity)
  const projFilter = new Set([weeklyPlanRefKey(projChip!)]);
  assert.equal(cardMatchesActiveFilters(cardA, projFilter, SAMPLE_ENTITIES), true);
  assert.equal(cardMatchesActiveFilters(cardB, projFilter, SAMPLE_ENTITIES), false);
  assert.equal(cardMatchesActiveFilters(cardC, projFilter, SAMPLE_ENTITIES), false);

  // Filtering by #urgent keeps cardA and cardB visible, dims cardC
  const urgentFilter = new Set([weeklyPlanRefKey(urgentChip!)]);
  assert.equal(cardMatchesActiveFilters(cardA, urgentFilter, SAMPLE_ENTITIES), true);
  assert.equal(cardMatchesActiveFilters(cardB, urgentFilter, SAMPLE_ENTITIES), true);
  assert.equal(cardMatchesActiveFilters(cardC, urgentFilter, SAMPLE_ENTITIES), false);
});
