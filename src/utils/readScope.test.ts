import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_READ_SCOPE,
  isRestricted,
  parseReadScope,
  referenceLeadName,
  referenceProjectName,
  sameReadScope,
} from "./readScope.ts";

test("a server that sends no readScope means no restriction", () => {
  assert.deepEqual(parseReadScope(undefined), EMPTY_READ_SCOPE);
  assert.deepEqual(parseReadScope(null), EMPTY_READ_SCOPE);
  assert.deepEqual(parseReadScope("nope"), EMPTY_READ_SCOPE);
});

test("parseReadScope keeps only well-formed entries", () => {
  const scope = parseReadScope({
    restricted: ["leads", 7, "projects"],
    rowScoped: ["tasks"],
    referenceNames: { leads: { "lead-1": "Alpha", "lead-2": 5 }, projects: [] },
  });
  assert.deepEqual(scope.restricted, ["leads", "projects"]);
  assert.deepEqual(scope.rowScoped, ["tasks"]);
  assert.deepEqual(scope.referenceNames.leads, { "lead-1": "Alpha" });
  assert.deepEqual(scope.referenceNames.projects, {});
});

test("isRestricted tells 'may not see' from 'nothing there'", () => {
  const scope = parseReadScope({ restricted: ["employees"], rowScoped: ["tasks"] });
  assert.equal(isRestricted(scope, "employees"), true);
  assert.equal(isRestricted(scope, "tasks"), false);
});

test("reference names resolve by string id and tolerate empty ids", () => {
  const scope = parseReadScope({ referenceNames: { leads: { "42": "Acme" }, projects: { p1: "Site" } } });
  assert.equal(referenceLeadName(scope, 42), "Acme");
  assert.equal(referenceLeadName(scope, "42"), "Acme");
  assert.equal(referenceLeadName(scope, "missing"), undefined);
  assert.equal(referenceLeadName(scope, null), undefined);
  assert.equal(referenceProjectName(scope, "p1"), "Site");
  assert.equal(referenceProjectName(scope, ""), undefined);
});

test("sameReadScope compares by value", () => {
  const a = parseReadScope({ restricted: ["leads"], referenceNames: { leads: { x: "X" } } });
  const b = parseReadScope({ restricted: ["leads"], referenceNames: { leads: { x: "X" } } });
  assert.equal(sameReadScope(a, b), true);
  assert.equal(sameReadScope(a, EMPTY_READ_SCOPE), false);
});
