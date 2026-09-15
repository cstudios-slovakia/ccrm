import assert from "node:assert/strict";
import test from "node:test";
import {
  autoCreateTypeIdsForLead,
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
  // Same map, keys written the other way round — the same JSON, for the same
  // reason. PHP sorts it with ksort(); see ccrm_normalize_project_auto_create.
  assert.equal(
    JSON.stringify(normalizeProjectAutoCreate({ categoryTypes: { Website: "ptype-roof", Marketing: "ptype-solar" } })),
    JSON.stringify(normalizeProjectAutoCreate({ categoryTypes: { Marketing: "ptype-solar", Website: "ptype-roof" } })),
  );
});

test("a category rule needs both halves to survive normalization", () => {
  assert.deepEqual(
    normalizeProjectAutoCreate({
      categoryTypes: { "  Website  ": "  ptype-roof  ", Marketing: "", "": "ptype-solar", Broken: 7 },
    }).categoryTypes,
    { Website: "ptype-roof" },
  );
  assert.deepEqual(normalizeProjectAutoCreate({ categoryTypes: ["ptype-roof"] }).categoryTypes, {});
  assert.deepEqual(normalizeProjectAutoCreate({ categoryTypes: "ptype-roof" }).categoryTypes, {});
});

test("the project type is trimmed and assignOwner needs an explicit false to turn off", () => {
  assert.deepEqual(
    normalizeProjectAutoCreate({ enabled: true, projectTypeId: "  ptype-roof  " }),
    { enabled: true, projectTypeId: "ptype-roof", categoryTypes: {}, assignOwner: true },
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

test("a category rule alone is enough to make the feature active", () => {
  // No fallback type at all, but leads in that category still get a project.
  const cfg = normalizeProjectAutoCreate({ enabled: true, categoryTypes: { Roofs: "ptype-roof" } });
  assert.equal(isProjectAutoCreateActive(cfg, TYPES), true);
  assert.equal(
    isProjectAutoCreateActive(normalizeProjectAutoCreate({ enabled: true, categoryTypes: { Roofs: "ptype-gone" } }), TYPES),
    false,
  );
});

test("enabled without a chosen type is not active", () => {
  assert.equal(isProjectAutoCreateActive(normalizeProjectAutoCreate({ enabled: true }), TYPES), false);
});

test("a chosen type does nothing while the feature is switched off", () => {
  assert.equal(
    isProjectAutoCreateActive(normalizeProjectAutoCreate({ enabled: false, projectTypeId: "ptype-roof" }), TYPES),
    false,
  );
});

test("a lead gets one project per interest category that names a type", () => {
  const cfg = normalizeProjectAutoCreate({
    enabled: true,
    projectTypeId: "ptype-roof",
    categoryTypes: { Roofs: "ptype-roof", Solar: "ptype-solar" },
  });
  assert.deepEqual(autoCreateTypeIdsForLead(cfg, ["Solar", "Roofs"], TYPES), ["ptype-solar", "ptype-roof"]);
  // Two categories naming the same type still make one project, not two.
  const sameType = normalizeProjectAutoCreate({
    enabled: true,
    categoryTypes: { Roofs: "ptype-roof", Tiles: "ptype-roof" },
  });
  assert.deepEqual(autoCreateTypeIdsForLead(sameType, ["Roofs", "Tiles"], TYPES), ["ptype-roof"]);
});

test("a lead no rule matched falls back to the single configured type", () => {
  const cfg = normalizeProjectAutoCreate({
    enabled: true,
    projectTypeId: "ptype-roof",
    categoryTypes: { Solar: "ptype-solar" },
  });
  assert.deepEqual(autoCreateTypeIdsForLead(cfg, [], TYPES), ["ptype-roof"]);
  assert.deepEqual(autoCreateTypeIdsForLead(cfg, undefined, TYPES), ["ptype-roof"]);
  assert.deepEqual(autoCreateTypeIdsForLead(cfg, ["Something else"], TYPES), ["ptype-roof"]);

  // ...and with no fallback configured, it simply gets nothing.
  const noFallback = normalizeProjectAutoCreate({ enabled: true, categoryTypes: { Solar: "ptype-solar" } });
  assert.deepEqual(autoCreateTypeIdsForLead(noFallback, ["Something else"], TYPES), []);
});

test("a category matches however it happens to be capitalized on the lead", () => {
  const cfg = normalizeProjectAutoCreate({ enabled: true, categoryTypes: { Solar: "ptype-solar" } });
  assert.deepEqual(autoCreateTypeIdsForLead(cfg, ["  sOLAR "], TYPES), ["ptype-solar"]);
});

test("a category pointing at a deleted type falls through to the fallback", () => {
  // Never returned for creation: the insert would fail against the foreign key.
  const cfg = normalizeProjectAutoCreate({
    enabled: true,
    projectTypeId: "ptype-roof",
    categoryTypes: { Solar: "ptype-gone" },
  });
  assert.deepEqual(autoCreateTypeIdsForLead(cfg, ["Solar"], TYPES), ["ptype-roof"]);
});

test("nothing is created while the feature is switched off", () => {
  const cfg = normalizeProjectAutoCreate({
    enabled: false,
    projectTypeId: "ptype-roof",
    categoryTypes: { Solar: "ptype-solar" },
  });
  assert.deepEqual(autoCreateTypeIdsForLead(cfg, ["Solar"], TYPES), []);
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
