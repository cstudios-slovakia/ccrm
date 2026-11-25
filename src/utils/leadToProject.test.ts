import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProjectFromLead, fillEmptyContactFromLead } from "./leadToProject.ts";
import type { Lead, ProjectAttribute } from "../types/index.ts";

const lead = {
  id: "lead-1",
  name: "  Acme s.r.o.  ",
  phone: "+421 900 111 222",
  email: "info@acme.test",
  owner: "Eva",
  city: "Bratislava",
  data: { "la-note": "from lead" },
} as unknown as Lead;

const type = {
  id: "pt-1",
  attributes: [
    { id: "pa-note", name: "Note", type: "textfield" },
    { id: "pa-email", name: "Email", type: "textfield" },
  ] as ProjectAttribute[],
};
const leadAttributes = [{ id: "la-note", name: "Note", type: "textfield" }] as ProjectAttribute[];

describe("buildProjectFromLead", () => {
  const proj = buildProjectFromLead(lead, type, leadAttributes, { id: "proj-1", status: "new" });

  it("is named after the lead and paired with it", () => {
    assert.equal(proj.name, "Acme s.r.o.");
    assert.equal(proj.leadId, "lead-1");
    assert.equal(proj.clientId, "lead-1");
    assert.equal(proj.id, "proj-1");
    assert.equal(proj.status, "new");
    assert.equal(proj.projectTypeId, "pt-1");
  });

  it("carries the lead's phone and e-mail as the project's contact", () => {
    assert.equal(proj.contactPhone, "+421 900 111 222");
    assert.equal(proj.contactEmail, "info@acme.test");
  });

  it("makes the lead's owner the manager and still copies custom fields", () => {
    assert.deepEqual(proj.managers, ["Eva"]);
    assert.equal(proj.data["pa-note"], "from lead");
    assert.equal(proj.data["pa-email"], "info@acme.test");
  });

  it("carries the lead's division and rating", () => {
    const withBoth = buildProjectFromLead({ ...lead, division: " Branch Budapest ", rating: 4 } as unknown as Lead, type, leadAttributes, { id: "p", status: "new" });
    assert.equal(withBoth.division, "Branch Budapest");
    assert.equal(withBoth.rating, 4);
  });

  it("leaves division null and the project unrated when the lead has neither", () => {
    const none = buildProjectFromLead({ ...lead, division: "", rating: 0 } as unknown as Lead, type, leadAttributes, { id: "p", status: "new" });
    assert.equal(none.division, null);
    assert.equal("rating" in none, false);
    assert.equal("rating" in buildProjectFromLead({ ...lead, division: undefined, rating: undefined } as unknown as Lead, type, leadAttributes, { id: "p", status: "new" }), false);
  });

  it("stores no contact instead of an empty string when the lead has none", () => {
    const bare = buildProjectFromLead({ ...lead, phone: "", email: undefined, owner: "" } as unknown as Lead, type, leadAttributes, { id: "p", status: "new" });
    assert.equal(bare.contactPhone, null);
    assert.equal(bare.contactEmail, null);
    assert.deepEqual(bare.managers, []);
  });
});

describe("fillEmptyContactFromLead", () => {
  it("fills an empty phone and e-mail from the lead", () => {
    const out = fillEmptyContactFromLead({ contactPhone: null, contactEmail: "  " }, lead);
    assert.equal(out.contactPhone, "+421 900 111 222");
    assert.equal(out.contactEmail, "info@acme.test");
  });

  it("never overwrites what the project already has", () => {
    const project = { contactPhone: "+1 555", contactEmail: "own@x.test" };
    assert.equal(fillEmptyContactFromLead(project, lead), project);
  });

  it("fills only the missing half", () => {
    const out = fillEmptyContactFromLead({ contactPhone: "+1 555", contactEmail: undefined }, lead);
    assert.equal(out.contactPhone, "+1 555");
    assert.equal(out.contactEmail, "info@acme.test");
  });

  it("leaves the project alone when the lead has nothing to give", () => {
    const project = { contactPhone: null, contactEmail: null };
    assert.equal(fillEmptyContactFromLead(project, { phone: "", email: "" }), project);
    assert.equal(fillEmptyContactFromLead(project, null), project);
  });
});
