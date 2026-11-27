import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickerProjectTypes, withPickerClients, workableProjectStubs } from "./workableProjects.ts";
import { EMPTY_READ_SCOPE, parseReadScope } from "./readScope.ts";
import type { Lead, Project } from "../types";

const pickerScope = parseReadScope({
  timePicker: {
    projects: [
      { id: "proj-b", name: "Webová stránka", clientId: "client-1", status: "active" },
      { id: "proj-a", name: "Alfa", clientId: "", status: "" },
      { name: "no id, dropped" },
    ],
    clients: [{ id: "client-1", name: "Acme" }, { id: "lead-9", name: "Lead without client" }],
    projectTypes: [{ id: "pt-1", name: "Web" }],
  },
});

describe("workableProjectStubs", () => {
  it("is empty when the server named no project", () => {
    assert.deepEqual(workableProjectStubs(EMPTY_READ_SCOPE, "new"), []);
  });

  it("falls back to the named projects from an older server", () => {
    const scope = {
      ...EMPTY_READ_SCOPE,
      referenceNames: { leads: {}, projects: { "proj-2": "Webová stránka", "proj-1": "Alfa" }, agencyWorkers: {} },
    };
    const stubs = workableProjectStubs(scope, "new");
    assert.deepEqual(stubs.map((p) => [p.id, p.name]), [["proj-1", "Alfa"], ["proj-2", "Webová stránka"]]);
    assert.equal(stubs[0].archived, false);
    assert.equal(stubs[0].status, "new");
  });

  it("uses the slim list: client and status kept, an empty status takes the default", () => {
    const stubs = workableProjectStubs(pickerScope, "new");
    assert.deepEqual(stubs.map((p) => [p.id, p.clientId, p.status]), [["proj-a", null, "new"], ["proj-b", "client-1", "active"]]);
  });

  it("keeps a project created in this session until the server lists it", () => {
    const created = { ...workableProjectStubs(pickerScope, "new")[0], id: "proj-new", name: "Nový" } as Project;
    const listed = { ...created, id: "proj-b" } as Project;
    const stubs = workableProjectStubs(pickerScope, "new", [created, listed]);
    assert.deepEqual(stubs.map((p) => p.id), ["proj-a", "proj-new", "proj-b"]);
  });
});

describe("withPickerClients / pickerProjectTypes", () => {
  it("adds the clients the person does not already see, name only", () => {
    const seen = [{ id: "client-1", name: "Acme (full)" } as Lead];
    const leads = withPickerClients(pickerScope, seen);
    assert.deepEqual(leads.map((l) => [l.id, l.name]), [["client-1", "Acme (full)"], ["lead-9", "Lead without client"]]);
  });

  it("leaves the leads alone without a slim list", () => {
    const seen = [{ id: "client-1", name: "Acme" } as Lead];
    assert.equal(withPickerClients(EMPTY_READ_SCOPE, seen), seen);
  });

  it("turns the slim project types into records for the create form", () => {
    assert.deepEqual(pickerProjectTypes(pickerScope).map((t) => [t.id, t.name]), [["pt-1", "Web"]]);
    assert.deepEqual(pickerProjectTypes(EMPTY_READ_SCOPE), []);
  });
});
