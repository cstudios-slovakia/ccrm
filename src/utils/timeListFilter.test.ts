import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_LIST_FILTER, NO_PROJECT, activeFilterCount, applyListFilter, filterOptions, staleSelections, toggleIn } from "./timeListFilter.ts";
import type { TimeEntry } from "./timeTracking.ts";

const e = (id: string, over: Partial<TimeEntry>): TimeEntry => ({ id, projectId: null, billable: true, tags: [], ...over }) as TimeEntry;
const list = [
  e("1", { projectId: "p1", projectName: "Strecha", billable: true, tags: ["a"] }),
  e("2", { projectId: "p1", projectName: "Strecha", billable: false, tags: ["b"] }),
  e("3", { projectId: "p2", projectName: "Alfa", billable: true }),
  e("4", { projectId: null, billable: false }),
];
const ids = (xs: readonly TimeEntry[]) => xs.map((x) => x.id);

test("no filter returns the same array", () => {
  assert.equal(applyListFilter(list, EMPTY_LIST_FILTER), list);
  assert.equal(activeFilterCount(EMPTY_LIST_FILTER), 0);
});

test("project, no project, billable and tags combine with AND across criteria and OR inside one", () => {
  assert.deepEqual(ids(applyListFilter(list, { ...EMPTY_LIST_FILTER, projects: ["p1"] })), ["1", "2"]);
  assert.deepEqual(ids(applyListFilter(list, { ...EMPTY_LIST_FILTER, projects: ["p2", NO_PROJECT] })), ["3", "4"]);
  assert.deepEqual(ids(applyListFilter(list, { ...EMPTY_LIST_FILTER, billable: "not-billable" })), ["2", "4"]);
  assert.deepEqual(ids(applyListFilter(list, { ...EMPTY_LIST_FILTER, tags: ["a", "b"] })), ["1", "2"]);
  const f = { projects: ["p1"], billable: "billable" as const, tags: ["a"] };
  assert.deepEqual(ids(applyListFilter(list, f)), ["1"]);
  assert.equal(activeFilterCount(f), 3);
});

test("options list the projects present (sorted), no-project and tags", () => {
  const o = filterOptions(list);
  assert.deepEqual(o.projects.map((p) => p.name), ["Alfa", "Strecha"]);
  assert.equal(o.hasNoProject, true);
  assert.deepEqual(o.tags, ["a", "b"]);
  assert.deepEqual(toggleIn(["x"], "y"), ["x", "y"]);
  assert.deepEqual(toggleIn(["x", "y"], "x"), ["y"]);
});

test("staleSelections lists selected values the shown week does not offer", () => {
  const o = filterOptions(list);
  const s = staleSelections({ projects: ["p1", "gone", NO_PROJECT], billable: "any", tags: ["a", "old"] }, o);
  assert.deepEqual(s, { projects: ["gone"], tags: ["old"] });
  assert.deepEqual(staleSelections(EMPTY_LIST_FILTER, o), { projects: [], tags: [] });
});
