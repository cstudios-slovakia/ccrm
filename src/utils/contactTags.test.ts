import test from "node:test";
import assert from "node:assert/strict";
import {
  collectAllContactTags,
  contactTagsSummary,
  normalizeContactTags,
  resolveContactTags,
} from "./contactTags.ts";

test("normalizeContactTags splits strings, trims, and deduplicates case-insensitively", () => {
  assert.deepEqual(normalizeContactTags([" CEO ", "billing", "ceo", "", "  HR  "]), ["CEO", "billing", "HR"]);
  assert.deepEqual(normalizeContactTags("CEO, Billing , ceo, , HR Manager"), ["CEO", "Billing", "HR Manager"]);
  assert.deepEqual(normalizeContactTags(null), []);
  assert.deepEqual(normalizeContactTags(undefined), []);
});

test("resolveContactTags prefers contactTags and falls back to contactRole", () => {
  assert.deepEqual(resolveContactTags(["Billing", "Logistics"], "Old Role"), ["Billing", "Logistics"]);
  assert.deepEqual(resolveContactTags([], "HR Manager, Dispatch"), ["HR Manager", "Dispatch"]);
  assert.deepEqual(resolveContactTags(null, "CEO"), ["CEO"]);
  assert.deepEqual(resolveContactTags(null, null), []);
});

test("contactTagsSummary joins tags cleanly and caps at 120 chars", () => {
  assert.equal(contactTagsSummary([]), null);
  assert.equal(contactTagsSummary(["CEO", "Billing"]), "CEO, Billing");
  const longTags = Array.from({ length: 20 }, (_, i) => `DepartmentRole${i + 1}`);
  const summary = contactTagsSummary(longTags);
  assert.ok(summary !== null && summary.length <= 120);
});

test("collectAllContactTags returns sorted case-insensitive unique tags across leads", () => {
  const tags = collectAllContactTags([
    { contactTags: ["Logistics", "ceo"], contactRole: null },
    { contactTags: null, contactRole: "CEO, Billing" },
    { contactTags: ["dispatch"], contactRole: "Ignored" },
  ]);
  assert.deepEqual(tags, ["Billing", "dispatch", "Logistics", "ceo"].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
});
