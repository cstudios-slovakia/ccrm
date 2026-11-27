import assert from "node:assert/strict";
import test from "node:test";
import { isSuggestionConverted, meetingSuggestionTaskId } from "./meetingSuggestions.ts";

const suggestion = { id: "task-1730000000000-0", title: "Send the offer", assignedUser: "Anna" };
const task = (over: Partial<{ id: string; title: string; owner: string; assignedUsers: string[] }> = {}) => ({
  id: meetingSuggestionTaskId(suggestion.id),
  title: "Send the offer",
  owner: "Anna",
  assignedUsers: ["Anna"],
  ...over,
});

test("the created task's id is derived from the suggestion, so it fits tasks.id", () => {
  assert.equal(meetingSuggestionTaskId("task-1730000000000-0"), "task-mt-task-1730000000000-0");
  assert.ok(meetingSuggestionTaskId("task-1730000000000-99").length <= 50);
});

test("an assignee alone is not 'Created': the task has to exist", () => {
  assert.equal(isSuggestionConverted(suggestion, []), false);
  assert.equal(isSuggestionConverted(suggestion, [task({ id: "task-other" })]), false);
});

test("the linked task makes it created, whoever it is assigned to now", () => {
  assert.equal(isSuggestionConverted(suggestion, [task()]), true);
  assert.equal(isSuggestionConverted({ ...suggestion, assignedUser: "" }, [task({ owner: "Ben", assignedUsers: ["Ben"] })]), true);
});

test("deleting the created task clears the badge", () => {
  assert.equal(isSuggestionConverted(suggestion, [task()].filter((t) => t.id !== meetingSuggestionTaskId(suggestion.id))), false);
});

test("a suggestion converted before ids were derived is matched on title and assignee", () => {
  const legacy = task({ id: "task-ai-1720000000000" });
  assert.equal(isSuggestionConverted(suggestion, [legacy]), true);
  assert.equal(isSuggestionConverted({ ...suggestion, assignedUser: "" }, [legacy]), false);
  assert.equal(isSuggestionConverted(suggestion, [task({ id: "task-ai-1720000000000", title: "Other" })]), false);
});
