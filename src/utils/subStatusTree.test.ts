import assert from "node:assert/strict";
import test from "node:test";
import { arrangeTree, buildRows, canOutdent, indentItem, indentParent, moveItem, outdentItem, type TreeItem } from "./subStatusTree.ts";

const G = ["new", "open", "closed"];
const it = (key: string, group: string, parent?: string): TreeItem => ({ key, group, ...(parent ? { parent } : {}) });
const keys = (l: TreeItem[]) => l.map((i) => i.key).join(",");
const base = () => [it("n", "new"), it("a", "open"), it("a1", "open", "a"), it("b", "open"), it("c", "open"), it("z", "closed")];
const idx = (key: string) => buildRows(base(), G).findIndex((r) => r.type === "item" && r.item.key === key);
const dividerIdx = (group: string) => buildRows(base(), G).findIndex((r) => r.type === "divider" && r.group === group);

test("indent picks the closest main status above in the same group", () => {
  assert.equal(indentParent(base(), G, "c"), "b");
  assert.equal(indentParent(base(), G, "b"), "a");
  assert.equal(indentParent(base(), G, "a"), null); // first in its group
  assert.equal(indentParent(base(), G, "a1"), null); // already a sub-status
  assert.equal(indentParent(base(), G, "z"), null); // another group's main is no candidate
});

test("a main status with sub-statuses cannot be indented", () => {
  assert.equal(indentParent([it("a", "open"), it("b", "open"), it("b1", "open", "b")], G, "b"), null);
});

test("indent and outdent round-trip", () => {
  const indented = indentItem(base(), G, "c")!;
  assert.equal(indented.find((i) => i.key === "c")!.parent, "b");
  assert.equal(canOutdent(indented, "c"), true);
  assert.equal(outdentItem(indented, G, "c").find((i) => i.key === "c")!.parent, undefined);
  assert.equal(indentItem(base(), G, "a"), null);
});

test("a main status carries its sub-statuses when dragged", () => {
  const out = moveItem(base(), G, "a", idx("c"))!;
  assert.equal(keys(out.filter((i) => i.group === "open")), "b,c,a,a1");
  assert.equal(out.find((i) => i.key === "a1")!.parent, "a");
});

test("a sub-status dropped on another main status of the group is re-parented", () => {
  const out = moveItem(base(), G, "a1", idx("b"))!;
  assert.equal(out.find((i) => i.key === "a1")!.parent, "b");
  assert.equal(keys(out.filter((i) => i.group === "open")), "a,b,a1,c");
});

test("a sub-status dropped into another group or on a divider is detached", () => {
  const toClosed = moveItem(base(), G, "a1", idx("z"))!;
  assert.equal(toClosed.find((i) => i.key === "a1")!.parent, undefined);
  assert.equal(toClosed.find((i) => i.key === "a1")!.group, "closed");
  const toDivider = moveItem(base(), G, "a1", dividerIdx("closed"))!;
  assert.equal(toDivider.find((i) => i.key === "a1")!.group, "closed");
  assert.equal(toDivider.find((i) => i.key === "a1")!.parent, undefined);
});

test("arrange drops broken parents and follows the parent's group", () => {
  const out = arrangeTree([it("x", "new", "ghost"), it("p", "open"), it("q", "new", "p")], G);
  assert.equal(out.find((i) => i.key === "x")!.parent, undefined);
  assert.equal(out.find((i) => i.key === "q")!.group, "open");
});
