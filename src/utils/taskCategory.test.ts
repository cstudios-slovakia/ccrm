import test from "node:test";
import assert from "node:assert/strict";
import { isBugCategory, taskCategoryLabel, taskCategoryOptions, TASK_CATEGORY_BUG } from "./taskCategory.ts";

const en = (e: string) => e;
const sk = (_e: string, s: string) => s;

test("the workflow editor offers no category first, then Bug, in the user's language", () => {
  assert.deepEqual(taskCategoryOptions(en), [{ value: "", label: "No category" }, { value: TASK_CATEGORY_BUG, label: "Bug" }]);
  assert.equal(taskCategoryOptions(sk)[0].label, "Bez kategórie");
});

test("an empty or missing value is no category, and Bug is matched case-insensitively", () => {
  assert.equal(taskCategoryLabel(null, en), "No category");
  assert.equal(taskCategoryLabel("", en), "No category");
  assert.equal(isBugCategory("BUG"), true);
  assert.equal(isBugCategory("other"), false);
});
