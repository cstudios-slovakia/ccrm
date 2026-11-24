import test from "node:test";
import assert from "node:assert/strict";
import { findTimelineEventIssue, resolveTimelineEventTitle, timelineEventTypeOptions } from "./timelineEventForm.ts";

const t = (en: string) => en;

test("a typed title wins over the type label", () => {
  assert.equal(resolveTimelineEventTitle("  Survey  ", "x", "Internal Note"), "Survey");
});

test("details alone fall back to the type label", () => {
  assert.equal(resolveTimelineEventTitle("", " ? ", "Phone Call"), "Phone Call");
});

test("no title and no details leaves nothing to save", () => {
  assert.equal(resolveTimelineEventTitle(" ", "  ", "Phone Call"), "");
});

test("an empty form is an issue on the title field", () => {
  const issue = findTimelineEventIssue({ title: "", content: "", attributes: [], isEmpty: () => false }, t);
  assert.equal(issue?.field, "title");
});

test("details without a title are fine", () => {
  assert.equal(findTimelineEventIssue({ title: "", content: "?", attributes: [], isEmpty: () => false }, t), null);
});

test("a missing required attribute is reported on that attribute", () => {
  const issue = findTimelineEventIssue({
    title: "A",
    content: "",
    attributes: [{ id: "a1", name: "Amount", required: true }, { id: "a2", name: "Note" }],
    isEmpty: () => true,
  }, t);
  assert.equal(issue?.field, "a1");
  assert.match(issue?.message ?? "", /Amount/);
});

test("the built-in types are used when the project type defines none", () => {
  assert.deepEqual(timelineEventTypeOptions(undefined, t).map(o => o.value), ["note", "phone", "email", "appointment"]);
  assert.deepEqual(timelineEventTypeOptions([{ id: "x", name: "Visit", color: "", icon: "", attributes: [] }], t), [{ value: "x", label: "Visit" }]);
});
