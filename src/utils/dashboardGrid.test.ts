import assert from "node:assert/strict";
import test from "node:test";
import {
  breakpointForWidth,
  freeDropTargets,
  insertAt,
  planGrid,
  rowCountOf,
  spanOf,
  type GridItem
} from "./dashboardGrid.ts";

const item = (id: string, size: GridItem["size"], rowSpan?: number): GridItem => ({ id, size, rowSpan });

const at = (placements: ReturnType<typeof planGrid>, id: string) => {
  const found = placements.find(p => p.id === id);
  assert.ok(found, `no placement for ${id}`);
  return found;
};

test("spans follow the breakpoint the board is rendered at", () => {
  assert.equal(spanOf("sm", "lg"), 3);
  assert.equal(spanOf("lg", "lg"), 8);
  assert.equal(spanOf("sm", "md"), 6);
  assert.equal(spanOf("lg", "md"), 12);
  assert.equal(spanOf("sm", "base"), 12);
  assert.equal(breakpointForWidth(1440), "lg");
  assert.equal(breakpointForWidth(900), "md");
  assert.equal(breakpointForWidth(500), "base");
});

test("cards flow left to right and wrap when the row runs out", () => {
  const plan = planGrid([item("a", "sm"), item("b", "sm"), item("c", "lg")]);
  assert.deepEqual(at(plan, "a"), { id: "a", row: 0, col: 0, span: 3, rowSpan: 1 });
  assert.deepEqual(at(plan, "b"), { id: "b", row: 0, col: 3, span: 3, rowSpan: 1 });
  // 8 will not fit in the 6 columns left, so it takes a row of its own and
  // leaves the top right of the board empty.
  assert.deepEqual(at(plan, "c"), { id: "c", row: 1, col: 0, span: 8, rowSpan: 1 });
  assert.equal(rowCountOf(plan), 2);
});

test("the cursor never goes back, so a hole stays a hole", () => {
  const plan = planGrid([item("a", "sm"), item("b", "full"), item("c", "sm")]);
  assert.deepEqual(at(plan, "b"), { id: "b", row: 1, col: 0, span: 12, rowSpan: 1 });
  // `c` would fit in the nine columns `a` left behind on row 0, but placement
  // only ever moves forward — it starts a third row instead.
  assert.deepEqual(at(plan, "c"), { id: "c", row: 2, col: 0, span: 3, rowSpan: 1 });
});

test("a two-row card keeps its columns busy on the row below", () => {
  const plan = planGrid([item("tall", "lg", 2), item("a", "sm"), item("b", "sm")]);
  assert.deepEqual(at(plan, "tall"), { id: "tall", row: 0, col: 0, span: 8, rowSpan: 2 });
  assert.deepEqual(at(plan, "a"), { id: "a", row: 0, col: 8, span: 3, rowSpan: 1 });
  assert.deepEqual(at(plan, "b"), { id: "b", row: 1, col: 8, span: 3, rowSpan: 1 });
  assert.equal(rowCountOf(plan), 2);
});

test("a second row is only claimed on a wide board", () => {
  const plan = planGrid([item("tall", "lg", 2), item("a", "sm")], "md");
  assert.equal(at(plan, "tall").rowSpan, 1);
  assert.deepEqual(at(plan, "a"), { id: "a", row: 1, col: 0, span: 6, rowSpan: 1 });
});

test("a small card can be dropped into the empty half of the top row", () => {
  const rest = [item("a", "sm"), item("b", "sm"), item("leads", "lg"), item("tasks", "lg"), item("pipe", "sm")];
  const targets = freeDropTargets(rest, item("dragged", "sm"));

  assert.deepEqual(
    targets.map(t => [t.row, t.col, t.insertIndex]),
    [
      [0, 6, 2],  // the six free columns beside the two small cards
      [1, 8, 3],  // the four columns beside the leads table
      [3, 0, 5]   // a fresh row under everything
    ]
  );
});

test("a card is never offered a gap it does not fit in", () => {
  const rest = [item("a", "sm"), item("b", "sm"), item("leads", "lg")];
  const targets = freeDropTargets(rest, item("dragged", "lg"));
  // Eight columns will not go into the six that are free, so the only offer is
  // a new row at the bottom.
  assert.deepEqual(targets.map(t => [t.row, t.col, t.insertIndex]), [[2, 0, 3]]);
});

test("a medium card fits the same gap a large one does not", () => {
  const rest = [item("a", "sm"), item("b", "sm"), item("leads", "lg")];
  const targets = freeDropTargets(rest, item("dragged", "md"));
  assert.equal(targets[0]?.row, 0);
  assert.equal(targets[0]?.col, 6);
  assert.equal(targets[0]?.span, 4);
  assert.equal(targets[0]?.insertIndex, 2);
});

test("no gap is offered where dropping would shove other cards aside", () => {
  const rest = [item("a", "sm"), item("b", "sm"), item("c", "sm"), item("d", "sm")];
  const targets = freeDropTargets(rest, item("dragged", "sm"));
  // The row is full; the only free space is the row after it.
  assert.deepEqual(targets.map(t => [t.row, t.col, t.insertIndex]), [[1, 0, 4]]);
});

test("a full-width card is only ever offered the bottom", () => {
  const rest = [item("a", "sm")];
  const targets = freeDropTargets(rest, item("dragged", "full"));
  assert.deepEqual(targets.map(t => [t.row, t.col, t.insertIndex]), [[1, 0, 1]]);
});

test("the gap beside a two-row card is offered", () => {
  const rest = [item("tall", "lg", 2), item("a", "sm")];
  const targets = freeDropTargets(rest, item("dragged", "sm"));
  // Row 0 is full; row 1 still has three columns free beside the tall card.
  assert.equal(targets[0]?.row, 1);
  assert.equal(targets[0]?.col, 8);
  assert.equal(targets[0]?.insertIndex, 2);
});

test("insertAt moves a card to a position counted without it", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(insertAt(items, "a", 2).map(i => i.id), ["b", "c", "a"]);
  assert.deepEqual(insertAt(items, "c", 0).map(i => i.id), ["c", "a", "b"]);
  assert.deepEqual(insertAt(items, "b", 1).map(i => i.id), ["a", "b", "c"]);
  assert.deepEqual(insertAt(items, "zz", 0).map(i => i.id), ["a", "b", "c"]);
  assert.deepEqual(insertAt(items, "a", 99).map(i => i.id), ["b", "c", "a"]);
});
