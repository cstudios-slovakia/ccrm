import test from "node:test";
import assert from "node:assert/strict";
import type { Project } from "../../types/index.ts";
import { computeDeadlines } from "./deadlines.ts";

const TODAY = new Date(2026, 10, 20, 15, 30);
const project = (id: string, completionDeadline: string | undefined, over: Partial<Project> = {}): Project =>
  ({ id, name: `P ${id}`, status: "active", archived: false, completionDeadline, ...over }) as unknown as Project;
const base = { isActive: (p: Project) => p.status === "active", clientNameOf: (p: Project) => `Client of ${p.id}`, today: TODAY };

test("tone boundaries: yesterday is overdue, today and day 14 are soon, day 15 is later", () => {
  const d = computeDeadlines({
    ...base,
    projects: [
      project("yesterday", "2026-11-19"),
      project("today", "2026-11-20"),
      project("d14", "2026-12-04"),
      project("d15", "2026-12-05"),
    ],
  });
  assert.deepEqual(d.rows.map((r) => [r.projectId, r.daysFromToday, r.tone]), [
    ["yesterday", -1, "overdue"],
    ["today", 0, "soon"],
    ["d14", 14, "soon"],
    ["d15", 15, "later"],
  ]);
  assert.deepEqual([d.overdue, d.soon, d.later], [1, 2, 1]);
});

test("only active, non-archived projects with a readable deadline count", () => {
  const d = computeDeadlines({
    ...base,
    projects: [
      project("ok", "2026-11-25"),
      project("closed", "2026-11-25", { status: "done" }),
      project("archived", "2026-11-25", { archived: true }),
      project("none", undefined),
      project("blank", ""),
      project("bad", "2026-02-31"),
    ],
  });
  assert.deepEqual(d.rows.map((r) => r.projectId), ["ok"]);
  assert.equal(d.soon, 1);
});

test("rows are nearest first and limited, counters cover them all", () => {
  const projects = Array.from({ length: 10 }, (_, i) => project(`p${i}`, `2026-12-${String(20 - i).padStart(2, "0")}`));
  const d = computeDeadlines({ ...base, projects });
  assert.equal(d.rows.length, 7);
  assert.equal(d.rows[0].projectId, "p9");
  assert.equal(d.rows[6].projectId, "p3");
  assert.equal(d.overdue + d.soon + d.later, 10);
  assert.equal(computeDeadlines({ ...base, projects, limit: 2 }).rows.length, 2);
  assert.equal(computeDeadlines({ ...base, projects, soonDays: 30 }).later, 0);
});

test("names and the deadline as a local day", () => {
  const d = computeDeadlines({ ...base, projects: [project("x", "2026-11-25", { name: "" })] });
  assert.equal(d.rows[0].name, "x");
  assert.equal(d.rows[0].clientName, "Client of x");
  assert.deepEqual([d.rows[0].deadline.getFullYear(), d.rows[0].deadline.getMonth(), d.rows[0].deadline.getDate()], [2026, 10, 25]);
});

test("empty input", () => {
  assert.deepEqual(computeDeadlines({ ...base, projects: [] }), { overdue: 0, soon: 0, later: 0, rows: [] });
});
