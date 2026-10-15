import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_LEAD_COLUMNS,
  LOCKED_LEAD_COLUMN,
  resolveLeadColumns,
  toStoredLeadColumns,
  moveLeadColumn,
} from "./leadColumns.ts";

describe("leadColumns", () => {
  it("defaults to all built-in columns visible with client leading", () => {
    const cols = resolveLeadColumns(null);
    assert.equal(cols.length, BUILTIN_LEAD_COLUMNS.length);
    assert.equal(cols[0].key, LOCKED_LEAD_COLUMN);
    assert.equal(cols[0].visible, true);
    for (const c of cols) {
      assert.equal(c.visible, true);
    }
  });

  it("preserves custom visibility while keeping locked client column visible", () => {
    const cols = resolveLeadColumns([
      { key: "client", visible: false }, // should be forced true
      { key: "city", visible: false },
      { key: "value", visible: true },
    ]);
    assert.equal(cols[0].key, "client");
    assert.equal(cols[0].visible, true);

    const cityCol = cols.find(c => c.key === "city");
    assert.equal(cityCol?.visible, false);

    // Missing columns should be appended
    assert.equal(cols.length, BUILTIN_LEAD_COLUMNS.length);
  });

  it("moves columns relatively but protects the locked column", () => {
    const cols = resolveLeadColumns(null);
    // Attempting to move locked column does nothing
    const noMove = moveLeadColumn(cols, "client", "city", "after");
    assert.deepEqual(noMove, cols);

    // Moving city after value
    const moved = moveLeadColumn(cols, "city", "value", "after");
    const cityIdx = moved.findIndex(c => c.key === "city");
    const valueIdx = moved.findIndex(c => c.key === "value");
    assert.equal(cityIdx, valueIdx + 1);
  });

  it("serializes to stored format", () => {
    const cols = resolveLeadColumns(null);
    const stored = toStoredLeadColumns(cols);
    assert.equal(stored.length, cols.length);
    assert.equal(stored[0].key, "client");
    assert.equal(stored[0].visible, true);
  });
});
