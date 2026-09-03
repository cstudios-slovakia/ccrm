import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROJECT_AUTO_CREATE,
  isProjectAutoCreateActive,
  normalizeProjectAutoCreate,
  pairableProjects,
  projectsForLead,
} from "./projectAutoCreate.ts";
import type { Project, ProjectType } from "../types.ts";

const TYPES = [
  { id: "ptype-roof", name: "Roof" },
  { id: "ptype-solar", name: "Solar" },
] as unknown as ProjectType[];

const project = (id: string, leadId: string | null, typeId = "ptype-roof"): Project => ({
  id,
  projectTypeId: typeId,
  leadId,
  clientId: leadId,
  status: "active",
  managers: [],
  data: {},
});

test("anything unusable normalizes to auto-creation being off", () => {
  assert.deepEqual(normalizeProjectAutoCreate(undefined), DEFAULT_PROJECT_AUTO_CREATE);
  assert.deepEqual(normalizeProjectAutoCreate(null), DEFAULT_PROJECT_AUTO_CREATE);
  assert.deepEqual(normalizeProjectAutoCreate("on"), DEFAULT_PROJECT_AUTO_CREATE);
  assert.deepEqual(normalizeProjectAutoCreate({ enabled: "yes" }), DEFAULT_PROJECT_AUTO_CREATE);
});

test("the normalized shape is stable, so the settings signature cannot flip-flop", () => {
  // An absent value and the blob the server echoes back must compare equal, or
  // the settings-sync effect pushes forever. See computeSettingsSig in App.tsx.
  assert.equal(
    JSON.stringify(normalizeProjectAutoCreate(undefined)),
    JSON.stringify(normalizeProjectAutoCreate({ enabled: false, projectTypeId: "", assignOwner: true })),
  );
});

test("the project type is trimmed and assignOwner needs an explicit false to turn off", () => {
  assert.deepEqual(
    normalizeProjectAutoCreate({ enabled: true, projectTypeId: "  ptype-roof  " }),
    { enabled: true, projectTypeId: "ptype-roof", assignOwner: true },
  );
  assert.equal(
    normalizeProjectAutoCreate({ enabled: true, projectTypeId: "x", assignOwner: false }).assignOwner,
    false,
  );
});

test("a project type that has since been deleted makes the rules inert", () => {
  // The card would otherwise look configured while the server creates nothing.
  const cfg = normalizeProjectAutoCreate({ enabled: true, projectTypeId: "ptype-gone" });
  assert.equal(isProjectAutoCreateActive(cfg, TYPES), false);
  assert.equal(isProjectAutoCreateActive({ ...cfg, projectTypeId: "ptype-solar" }, TYPES), true);
});

test("enabled without a chosen type is not active", () => {
  assert.equal(isProjectAutoCreateActive({ enabled: true, projectTypeId: "", assignOwner: true }, TYPES), false);
});

test("a chosen type does nothing while the feature is switched off", () => {
  assert.equal(isProjectAutoCreateActive({ enabled: false, projectTypeId: "ptype-roof", assignOwner: true }, TYPES), false);
});

test("a lead's projects are every project pointing at it, in the given order", () => {
  const projects = [
    project("proj-3", "lead-a"),
    project("proj-2", "lead-b"),
    project("proj-1", "lead-a", "ptype-solar"),
  ];
  assert.deepEqual(projectsForLead(projects, "lead-a").map((p) => p.id), ["proj-3", "proj-1"]);
  assert.deepEqual(projectsForLead(projects, "lead-z"), []);
});

test("only unpaired projects can be picked up from a lead", () => {
  // Offering a project that already belongs to another lead would silently
  // unpair it from there — that is a decision to make on the project itself.
  const projects = [project("proj-1", "lead-b"), project("proj-2", null), project("proj-3", "")];
  assert.deepEqual(pairableProjects(projects).map((p) => p.id), ["proj-2", "proj-3"]);
});
