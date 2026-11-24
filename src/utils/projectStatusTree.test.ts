import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProjectStatusDefs, PROJECT_STATUS_GROUPS, projectStatusOptions, type ProjectStatusDef } from "./projects.ts";
import {
  arrangeProjectStatuses,
  flattenProjectStatuses,
  projectStatusChildren,
  projectStatusDepth,
  projectStatusFamily,
  projectStatusParent,
} from "./projectStatusTree.ts";

const def = (key: string, group: ProjectStatusDef["group"], parent?: string): ProjectStatusDef => ({
  key,
  color: "#112233",
  group,
  ...(parent ? { parent } : {}),
});

const keys = (list: readonly { key: string }[]) => list.map((d) => d.key);
const t = (en: string) => en;

test("flatten puts every sub-status directly under its parent, whatever the stored order", () => {
  const rows = flattenProjectStatuses([
    def("a", "in_progress"),
    def("b", "in_progress"),
    def("a1", "in_progress", "a"),
    def("b1", "in_progress", "b"),
    def("a2", "in_progress", "a"),
  ]);
  assert.deepEqual(rows.map((r) => r.def.key), ["a", "a1", "a2", "b", "b1"]);
  assert.deepEqual(rows.map((r) => r.depth), [0, 1, 1, 0, 1]);
});

test("children, parent, depth and family of a status", () => {
  const defs = [def("a", "in_progress"), def("a1", "in_progress", "a"), def("a2", "in_progress", "a"), def("b", "in_progress")];
  assert.deepEqual(keys(projectStatusChildren("a", defs)), ["a1", "a2"]);
  assert.deepEqual(projectStatusChildren("b", defs), []);
  assert.equal(projectStatusParent("a2", defs)?.key, "a");
  assert.equal(projectStatusParent("a", defs), undefined);
  assert.equal(projectStatusParent("nope", defs), undefined);
  assert.equal(projectStatusDepth("a1", defs), 1);
  assert.equal(projectStatusDepth("a", defs), 0);
  assert.equal(projectStatusDepth(undefined, defs), 0);
  assert.deepEqual(projectStatusFamily("a", defs), ["a", "a1", "a2"]);
  assert.deepEqual(projectStatusFamily("b", defs), ["b"]);
});

test("a parent that is missing, is the status itself or is a sub-status itself is dropped", () => {
  const defs = [
    def("a", "in_progress"),
    def("a1", "in_progress", "a"),
    def("ghost", "in_progress", "missing"),
    def("self", "in_progress", "self"),
    def("deep", "in_progress", "a1"),
  ];
  assert.equal(projectStatusDepth("ghost", defs), 0);
  assert.equal(projectStatusDepth("self", defs), 0);
  assert.equal(projectStatusDepth("deep", defs), 0);
  assert.equal(projectStatusDepth("a1", defs), 1);
  const arranged = arrangeProjectStatuses(defs, PROJECT_STATUS_GROUPS);
  assert.equal(arranged.find((d) => d.key === "ghost")?.parent, undefined);
  assert.equal(arranged.find((d) => d.key === "deep")?.parent, undefined);
  assert.equal(arranged.find((d) => d.key === "a1")?.parent, "a");
});

test("two statuses naming each other as parent both become top-level", () => {
  const defs = [def("x", "in_progress", "y"), def("y", "in_progress", "x")];
  assert.equal(projectStatusDepth("x", defs), 0);
  assert.equal(projectStatusDepth("y", defs), 0);
});

test("a sub-status takes its parent's group and the list is ordered by group, then tree", () => {
  const arranged = arrangeProjectStatuses(
    [
      def("done", "completed"),
      def("sub_of_done", "new", "done"),
      def("start", "new"),
      def("work", "in_progress"),
      def("work_a", "in_progress", "work"),
    ],
    PROJECT_STATUS_GROUPS,
  );
  assert.deepEqual(keys(arranged), ["start", "work", "work_a", "done", "sub_of_done"]);
  assert.equal(arranged.find((d) => d.key === "sub_of_done")?.group, "completed");
});

test("normalizeProjectStatusDefs keeps parents and applies the tree rules", () => {
  const out = normalizeProjectStatusDefs([
    { key: "new", color: "#0ea5e9", group: "new" },
    { key: "delivered", label: "Delivered", color: "#10b981", group: "in_progress" },
    { key: "partly_1", label: "Partly 1", color: "#10b981", group: "completed", parent: "delivered" },
    { key: "orphan", color: "#10b981", group: "in_progress", parent: "gone" },
  ]);
  assert.deepEqual(keys(out), ["new", "delivered", "partly_1", "orphan"]);
  const sub = out.find((d) => d.key === "partly_1");
  assert.equal(sub?.parent, "delivered");
  assert.equal(sub?.group, "in_progress");
  assert.equal("parent" in (out.find((d) => d.key === "orphan") ?? {}), false);
});

test("dropdown options mark sub-statuses with an indent", () => {
  const defs = normalizeProjectStatusDefs([
    { key: "new", color: "#0ea5e9", group: "new" },
    { key: "a", label: "A", color: "#10b981", group: "in_progress" },
    { key: "a1", label: "A1", color: "#10b981", group: "in_progress", parent: "a" },
  ]);
  const options = projectStatusOptions(t, defs);
  assert.deepEqual(options.map((o) => o.indent), [undefined, undefined, 1]);
});
