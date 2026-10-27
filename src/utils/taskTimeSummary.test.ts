import test from "node:test";
import assert from "node:assert/strict";
import { taskCostFigure, withRunningSeconds, type TaskPersonTime } from "./taskTimeSummary.ts";

const person = (userId: string, seconds: number, cost?: number | null): TaskPersonTime => {
  const row: TaskPersonTime = { userId, seconds };
  if (cost !== undefined) row.cost = cost;
  return row;
};

test("task cost sums every person when each cost is visible", () => {
  const figure = taskCostFigure([person("erik", 3600, 24.58), person("ada", 1800, 10.1)], "erik");
  assert.equal(figure.total, 34.68);
  assert.equal(figure.own, 24.58);
  assert.equal(figure.ownUnrated, false);
});

test("someone else's hidden cost is not added into a task total", () => {
  const figure = taskCostFigure([person("erik", 3600, 24.58), person("ada", 1800)], "erik");
  assert.equal(figure.total, null);
  assert.equal(figure.own, 24.58);
});

test("a missing rate is not treated as zero", () => {
  const figure = taskCostFigure([person("erik", 3600, null)], "erik");
  assert.equal(figure.total, null);
  assert.equal(figure.own, null);
  assert.equal(figure.ownUnrated, true);
});

test("no people means no cost figure", () => {
  assert.deepEqual(taskCostFigure([], "erik"), { total: null, own: null, ownUnrated: false });
});

test("running time is added to that person without inventing a cost", () => {
  const saved = [person("erik", 60, 1.5)];
  const rows = withRunningSeconds(saved, { userId: "erik", seconds: 30 });
  assert.equal(rows[0].seconds, 90);
  assert.equal(rows[0].cost, 1.5);
  assert.equal(saved[0].seconds, 60);
  const started = withRunningSeconds([], { userId: "ada", seconds: 12 });
  assert.deepEqual(started, [{ userId: "ada", seconds: 12 }]);
  assert.equal("cost" in started[0], false);
});
