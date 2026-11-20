import test from "node:test";
import assert from "node:assert/strict";
import type { Project } from "../../types/index.ts";
import type { ProjectPushesOverview, ProjectPushSummary } from "../projectPushesApi.ts";
import { computeDeployments } from "./deployments.ts";

const NOW = new Date(2026, 10, 20, 15, 30);
/** The UTC instant ("...Z") of a local wall-clock time, so the tests hold in any time zone. */
const utc = (y: number, m: number, d: number, hh = 12, mm = 0): string => new Date(y, m - 1, d, hh, mm).toISOString();

const project = (id: string): Project => ({ id, name: id.toUpperCase() }) as unknown as Project;
const nameOf = (p: Project) => p.name;
const summaryOf = (projects: ProjectPushSummary[], lastPush: ProjectPushesOverview["lastPush"] = null): ProjectPushesOverview => ({
  projects,
  lastPush,
  total: projects.reduce((sum, p) => sum + p.pushes, 0),
});
const entry = (projectId: string, pushes: number, lastPushAt: string | null): ProjectPushSummary => ({ projectId, pushes, lastPushAt });
const PROJECTS = [project("a"), project("b"), project("c"), project("d")];

test("empty summary: zero total, no latest push, no rows, scale 1", () => {
  assert.deepEqual(computeDeployments({ summary: summaryOf([]), projects: PROJECTS, now: NOW, nameOf }), {
    total: 0, lastPushAt: null, lastPushProject: null, rows: [], scaleMax: 1,
  });
});

test("projects without a push in the period are not listed, however recent their last push", () => {
  const data = computeDeployments({
    summary: summaryOf([entry("a", 0, utc(2026, 11, 19)), entry("b", 2, utc(2026, 11, 10))]),
    projects: PROJECTS, now: NOW, nameOf,
  });
  assert.deepEqual(data.rows.map((r) => r.projectId), ["b"]);
  assert.equal(data.total, 2);
});

test("stale: exactly 14 whole days is not stale, 15 is (local calendar days, not 24 h blocks)", () => {
  const data = computeDeployments({
    summary: summaryOf([entry("a", 1, utc(2026, 11, 6, 0, 1)), entry("b", 1, utc(2026, 11, 5, 23, 59)), entry("c", 1, utc(2026, 11, 20, 0, 1))]),
    projects: PROJECTS, now: NOW, nameOf,
  });
  const stale = Object.fromEntries(data.rows.map((r) => [r.projectId, r.stale]));
  assert.deepEqual(stale, { a: false, b: true, c: false });
});

test("staleDays is configurable", () => {
  const data = computeDeployments({
    summary: summaryOf([entry("a", 1, utc(2026, 11, 17))]), projects: PROJECTS, now: NOW, nameOf, staleDays: 2,
  });
  assert.equal(data.rows[0].stale, true);
});

test("most pushes first; a tie goes to the later last push, then the name", () => {
  const data = computeDeployments({
    summary: summaryOf([
      entry("a", 3, utc(2026, 11, 10)),
      entry("b", 5, utc(2026, 11, 1)),
      entry("c", 3, utc(2026, 11, 15)),
      entry("d", 3, utc(2026, 11, 15)),
    ]),
    projects: PROJECTS, now: NOW, nameOf,
  });
  assert.deepEqual(data.rows.map((r) => r.projectId), ["b", "c", "d", "a"]);
  assert.equal(data.scaleMax, 5);
});

test("limit cuts the rows but not the total", () => {
  const data = computeDeployments({
    summary: summaryOf([entry("a", 4, utc(2026, 11, 10)), entry("b", 3, utc(2026, 11, 10)), entry("c", 2, utc(2026, 11, 10))]),
    projects: PROJECTS, now: NOW, nameOf, limit: 2,
  });
  assert.deepEqual(data.rows.map((r) => r.projectId), ["a", "b"]);
  assert.equal(data.total, 9);
  assert.equal(data.scaleMax, 4);
});

test("a project the list does not contain is skipped everywhere, including the latest push", () => {
  const data = computeDeployments({
    summary: summaryOf(
      [entry("gone", 9, utc(2026, 11, 19)), entry("a", 1, utc(2026, 11, 10))],
      { projectId: "gone", pushedAt: utc(2026, 11, 19) },
    ),
    projects: PROJECTS, now: NOW, nameOf,
  });
  assert.deepEqual(data.rows.map((r) => r.projectId), ["a"]);
  assert.equal(data.total, 1);
  assert.equal(data.lastPushAt, null);
  assert.equal(data.lastPushProject, null);
});

test("an unreadable timestamp skips the row but the push still counts", () => {
  const data = computeDeployments({
    summary: summaryOf([entry("a", 2, "not a date"), entry("b", 1, null), entry("c", 1, utc(2026, 11, 10))]),
    projects: PROJECTS, now: NOW, nameOf,
  });
  assert.deepEqual(data.rows.map((r) => r.projectId), ["c"]);
  assert.equal(data.total, 4);
});

test("the latest push of the period and its project's display name", () => {
  const pushedAt = utc(2026, 11, 20, 13, 30);
  const data = computeDeployments({
    summary: summaryOf([entry("a", 1, pushedAt)], { projectId: "a", pushedAt }),
    projects: PROJECTS, now: NOW, nameOf: (p) => `Name of ${p.id}`,
  });
  assert.equal(data.lastPushAt?.getTime(), new Date(pushedAt).getTime());
  assert.equal(data.lastPushProject, "Name of a");
  assert.equal(data.rows[0].name, "Name of a");
});

test("an unreadable latest-push timestamp leaves the latest push empty", () => {
  const data = computeDeployments({
    summary: summaryOf([entry("a", 1, utc(2026, 11, 10))], { projectId: "a", pushedAt: "garbage" }),
    projects: PROJECTS, now: NOW, nameOf,
  });
  assert.equal(data.lastPushAt, null);
  assert.equal(data.lastPushProject, null);
});
