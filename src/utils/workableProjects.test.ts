import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workableProjectStubs } from "./workableProjects.ts";
import { EMPTY_READ_SCOPE } from "./readScope.ts";

describe("workableProjectStubs", () => {
  it("is empty when the server named no project", () => {
    assert.deepEqual(workableProjectStubs(EMPTY_READ_SCOPE, "new"), []);
  });

  it("turns the named projects into pickable, name-sorted stubs", () => {
    const scope = {
      ...EMPTY_READ_SCOPE,
      referenceNames: { leads: {}, projects: { "proj-2": "Webová stránka", "proj-1": "Alfa" } },
    };
    const stubs = workableProjectStubs(scope, "new");
    assert.deepEqual(stubs.map((p) => [p.id, p.name]), [["proj-1", "Alfa"], ["proj-2", "Webová stránka"]]);
    assert.equal(stubs[0].archived, false);
    assert.equal(stubs[0].status, "new");
  });
});
