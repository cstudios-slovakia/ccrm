import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../types";
import { parseTaskGroupBy, parseTaskSort, sortTasks } from "./taskGrouping.ts";

const mk = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: id,
  description: "",
  status: "New",
  priority: "medium",
  deadline: "2026-10-20",
  owner: "",
  assignedUsers: [],
  ...over,
});

const ids = (tasks: Task[]) => tasks.map((t) => t.id);

const a = mk("a", { createdAt: "2026-10-01 09:00:00", deadline: "2026-10-30", priority: "low" });
const b = mk("b", { createdAt: "2026-10-03 08:15:00", deadline: "2026-10-10", priority: "high" });
const c = mk("c", { createdAt: "2026-10-02T12:00:00", deadline: "2026-10-20", priority: "medium" });

test("newest / oldest order by creation stamp, ISO and SQL formats mixed", () => {
  assert.deepEqual(ids(sortTasks([a, b, c], "newest")), ["b", "c", "a"]);
  assert.deepEqual(ids(sortTasks([a, b, c], "oldest")), ["a", "c", "b"]);
});

test("a task with no stamp yet is the newest, and arrival order is kept among those", () => {
  const fresh1 = mk("fresh1");
  const fresh2 = mk("fresh2");
  assert.deepEqual(ids(sortTasks([fresh1, fresh2, a, b], "newest")), ["fresh1", "fresh2", "b", "a"]);
  assert.deepEqual(ids(sortTasks([a, b, fresh1, fresh2], "oldest")), ["a", "b", "fresh1", "fresh2"]);
});

test("equal stamps fall back to the title", () => {
  const x = mk("x", { title: "Bravo", createdAt: "2026-10-01 09:00:00" });
  const y = mk("y", { title: "Alpha", createdAt: "2026-10-01 09:00:00" });
  assert.deepEqual(ids(sortTasks([x, y], "newest")), ["y", "x"]);
});

test("due, priority and title sorts", () => {
  assert.deepEqual(ids(sortTasks([a, b, c], "dueSoonest")), ["b", "c", "a"]);
  assert.deepEqual(ids(sortTasks([a, b, c], "dueLatest")), ["a", "c", "b"]);
  assert.deepEqual(ids(sortTasks([a, b, c], "priority")), ["b", "c", "a"]);
  assert.deepEqual(ids(sortTasks([c, b, a], "title")), ["a", "b", "c"]);
});

test("sortTasks does not mutate its input", () => {
  const input = [a, b, c];
  sortTasks(input, "newest");
  assert.deepEqual(ids(input), ["a", "b", "c"]);
});

test("a stored value that is not a valid choice falls back to the default", () => {
  assert.equal(parseTaskGroupBy("created"), "created");
  assert.equal(parseTaskGroupBy("nonsense"), "due");
  assert.equal(parseTaskGroupBy(null), "due");
  assert.equal(parseTaskSort("oldest"), "oldest");
  assert.equal(parseTaskSort("nonsense"), "newest");
});
