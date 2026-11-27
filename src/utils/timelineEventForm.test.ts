import test from "node:test";
import assert from "node:assert/strict";
import { findTimelineEventIssue, resolveTimelineEventTitle, timelineEventTypeOptions } from "./timelineEventForm.ts";

const t = (en: string) => en;

test("a typed title wins over the type label", () => {
  assert.equal(resolveTimelineEventTitle("  Survey  ", "x", "Internal Note"), "Survey");
});

test("without a name the first line of the details wins over the type label", () => {
  assert.equal(resolveTimelineEventTitle("", "Site visit\nmore text", "Phone Call"), "Site visit");
  assert.equal(resolveTimelineEventTitle("", "x".repeat(100), "Phone Call").length, 80);
});

test("an empty form is saved under the event type's name", () => {
  assert.equal(resolveTimelineEventTitle(" ", "  ", "Phone Call"), "Phone Call");
});

test("nothing on the form is required", () => {
  assert.equal(findTimelineEventIssue({ title: "", content: "", attributes: [], isEmpty: () => true }, t), null);
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
  assert.deepEqual(timelineEventTypeOptions(undefined, t).map(o => o.value), ["phone", "email", "appointment"]); // notes have their own tab
  assert.deepEqual(timelineEventTypeOptions([{ id: "x", name: "Visit", color: "", icon: "", attributes: [] }], t), [{ value: "x", label: "Visit" }]);
});
