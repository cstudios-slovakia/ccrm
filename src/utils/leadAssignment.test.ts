import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LEAD_ASSIGNMENT,
  isAutoAssignActive,
  normalizeLeadAssignment,
  resolveAssignmentPool,
} from "./leadAssignment.ts";

const TEAM = ["Sam", "Ada", "Alex"];

test("anything unusable normalizes to auto-assignment being off", () => {
  assert.deepEqual(normalizeLeadAssignment(undefined), DEFAULT_LEAD_ASSIGNMENT);
  assert.deepEqual(normalizeLeadAssignment(null), DEFAULT_LEAD_ASSIGNMENT);
  assert.deepEqual(normalizeLeadAssignment("off"), DEFAULT_LEAD_ASSIGNMENT);
  assert.deepEqual(normalizeLeadAssignment({ mode: "nonsense" }), DEFAULT_LEAD_ASSIGNMENT);
});

test("the normalized shape is stable, so the settings signature cannot flip-flop", () => {
  // An absent value and the blob the server echoes back must compare equal, or
  // the settings-sync effect pushes forever. See computeSettingsSig in App.tsx.
  assert.equal(
    JSON.stringify(normalizeLeadAssignment(undefined)),
    JSON.stringify(normalizeLeadAssignment({ mode: "off", users: [], rotate: true })),
  );
});

test("the user pool is cleaned up but keeps the order it was given", () => {
  const cfg = normalizeLeadAssignment({
    mode: "selected",
    users: ["Alex", "  ", "Sam", "Alex", " Ada "],
  });
  assert.deepEqual(cfg.users, ["Alex", "Sam", "Ada"]);
  assert.equal(cfg.rotate, true);
});

test("rotation is only off when it is switched off explicitly", () => {
  assert.equal(normalizeLeadAssignment({ mode: "all" }).rotate, true);
  assert.equal(normalizeLeadAssignment({ mode: "all", rotate: false }).rotate, false);
});

test("mode off assigns to nobody, however the pool is filled in", () => {
  const cfg = normalizeLeadAssignment({ mode: "off", users: TEAM });
  assert.deepEqual(resolveAssignmentPool(cfg, TEAM), []);
  assert.equal(isAutoAssignActive(cfg, TEAM), false);
});

test("mode all covers everyone, in a stable alphabetical order", () => {
  const cfg = normalizeLeadAssignment({ mode: "all" });
  assert.deepEqual(resolveAssignmentPool(cfg, TEAM), ["Ada", "Alex", "Sam"]);
  assert.equal(isAutoAssignActive(cfg, TEAM), true);
});

test("mode all with nobody registered assigns to nobody", () => {
  const cfg = normalizeLeadAssignment({ mode: "all" });
  assert.equal(isAutoAssignActive(cfg, []), false);
});

test("selected users rotate in the order the admin listed them", () => {
  const cfg = normalizeLeadAssignment({ mode: "selected", users: ["Sam", "Ada"] });
  assert.deepEqual(resolveAssignmentPool(cfg, TEAM), ["Sam", "Ada"]);
});

test("a colleague who left drops out of the rotation instead of stranding leads", () => {
  const cfg = normalizeLeadAssignment({ mode: "selected", users: ["Sam", "Robin", "Ada"] });
  assert.deepEqual(resolveAssignmentPool(cfg, TEAM), ["Sam", "Ada"]);
});

test("a pool whose every member has left counts as inactive, not as configured", () => {
  const cfg = normalizeLeadAssignment({ mode: "selected", users: ["Robin"] });
  assert.deepEqual(resolveAssignmentPool(cfg, TEAM), []);
  assert.equal(isAutoAssignActive(cfg, TEAM), false);
});

test("a renamed-case user still matches the pool entry", () => {
  const cfg = normalizeLeadAssignment({ mode: "selected", users: ["sam"] });
  assert.deepEqual(resolveAssignmentPool(cfg, TEAM), ["Sam"]);
});
