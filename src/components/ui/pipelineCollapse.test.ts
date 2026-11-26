import assert from "node:assert/strict";
import test from "node:test";
import { collapsePipeline, pipelineCurrentIndex, type PipelineStripSegment } from "./pipelineCollapse.ts";

const seg = (key: string, filled: boolean, current = false): PipelineStripSegment => ({
  key,
  title: key.toUpperCase(),
  tooltip: key,
  filled,
  current,
  colorClass: filled ? "" : "bg-slate-300",
  ...(filled ? { color: "#123456" } : null),
});

/** n steps plus an outcome; steps up to `at` are filled, `at` is current. */
const strip = (n: number, at: number) => [
  ...Array.from({ length: n }, (_, i) => seg(`s${i}`, i <= at, i === at)),
  seg("outcome", false),
];

const titles = (segments: PipelineStripSegment[]) => segments.map((s) => s.title);

test("pipelineCurrentIndex: flagged step, else last reached, else -1", () => {
  assert.equal(pipelineCurrentIndex(strip(5, 2)), 2);
  assert.equal(pipelineCurrentIndex([seg("a", true), seg("b", true), seg("c", false)]), 1);
  assert.equal(pipelineCurrentIndex([seg("a", false), seg("b", false)]), -1);
});

test("collapsePipeline: short strips come back as the same array", () => {
  const short = strip(6, 2);
  assert.equal(collapsePipeline(short), short);
  const tiny = strip(2, 0);
  assert.equal(collapsePipeline(tiny, 0), tiny);
});

test("collapsePipeline: folds around the current step", () => {
  const out = collapsePipeline(strip(12, 6));
  assert.deepEqual(titles(out), ["✓ 6", "S6", "S7", "+4", "OUTCOME"]);
  assert.equal(out[0].filled, true);
  assert.equal(out[0].tooltip, "S0 → S1 → S2 → S3 → S4 → S5");
  assert.equal(out[3].filled, false);
  assert.equal(out[3].tooltip, "S8 → S9 → S10 → S11");
  assert.equal(out[1].current, true);
  assert.equal(new Set(out.map((s) => s.key)).size, out.length, "keys stay unique");
});

test("collapsePipeline: a group of one keeps its own name", () => {
  assert.deepEqual(titles(collapsePipeline(strip(10, 1))), ["S0", "S1", "S2", "+7", "OUTCOME"]);
  assert.deepEqual(titles(collapsePipeline(strip(10, 7))), ["✓ 7", "S7", "S8", "S9", "OUTCOME"]);
});

test("collapsePipeline: nothing reached starts at the first step", () => {
  assert.deepEqual(titles(collapsePipeline(strip(10, -1))), ["S0", "S1", "+8", "OUTCOME"]);
});

test("collapsePipeline: a closed record folds every step into history", () => {
  const closed = [...Array.from({ length: 10 }, (_, i) => seg(`s${i}`, true)), seg("lost", true, true)];
  const out = collapsePipeline(closed);
  assert.deepEqual(titles(out), ["✓ 10", "LOST"]);
});

test("collapsePipeline: max = 0 folds a short strip that does not fit", () => {
  assert.deepEqual(titles(collapsePipeline(strip(6, 3), 0)), ["✓ 3", "S3", "S4", "S5", "OUTCOME"]);
});
