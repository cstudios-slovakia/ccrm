import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectDataFromLead,
  isLeadAttributeMissing,
  leadMatchesCustomFieldQuery,
  normalizeLeadAttributes,
} from "./leadAttributes.ts";
import type { ProjectAttribute } from "../types/index.ts";

describe("leadAttributes", () => {
  it("normalizes saved attributes, drops duplicates and invalid types, keeps options unique", () => {
    const normalized = normalizeLeadAttributes([
      null,
      { id: "", name: "Ignored", type: "textfield" },
      { id: "a1", name: " Budget Class ", type: "select", required: 1, options: [" A ", "B", "A", ""] },
      { id: "a1", name: "Duplicate id", type: "textfield" },
      { id: "a2", name: "Checklist", type: "checkbox", required: true, options: ["One", "Two"], requiredOptions: ["Two", "Missing"] },
      { id: "a3", name: "Fallback", type: "unknown_type" },
    ]);

    assert.equal(normalized.length, 3);
    assert.deepEqual(normalized[0], {
      id: "a1",
      name: "Budget Class",
      type: "select",
      required: true,
      options: ["A", "B"],
    });
    // Checkboxes carry requiredOptions at option level, never attribute-level required.
    assert.deepEqual(normalized[1], {
      id: "a2",
      name: "Checklist",
      type: "checkbox",
      required: false,
      options: ["One", "Two"],
      requiredOptions: ["Two"],
    });
    assert.equal(normalized[2].type, "textfield");
  });

  it("checks missing required values across field types", () => {
    const textAttr: ProjectAttribute = { id: "t", name: "Text", type: "textfield", required: true };
    const moneyAttr: ProjectAttribute = { id: "m", name: "Budget", type: "money", required: true };
    const filesAttr: ProjectAttribute = { id: "f", name: "Files", type: "files", required: true };
    const optAttr: ProjectAttribute = { id: "o", name: "Opt", type: "textfield", required: false };

    assert.equal(isLeadAttributeMissing(textAttr, "", "EUR"), true);
    assert.equal(isLeadAttributeMissing(textAttr, "ok", "EUR"), false);
    assert.equal(isLeadAttributeMissing(moneyAttr, { amount: null, currency: "EUR" }, "EUR"), true);
    assert.equal(isLeadAttributeMissing(moneyAttr, { amount: 0, currency: "EUR" }, "EUR"), false);
    assert.equal(isLeadAttributeMissing(filesAttr, [], "EUR"), true);
    assert.equal(isLeadAttributeMissing(filesAttr, [{ name: "a.pdf", size: "1 MB", path: "/u/a.pdf" }], "EUR"), false);
    assert.equal(isLeadAttributeMissing(optAttr, "", "EUR"), false);
  });

  it("matches search queries across text, money, checklist, files, and contacts", () => {
    const attrs: ProjectAttribute[] = [
      { id: "area", name: "Area", type: "number", required: false },
      { id: "budget", name: "Budget", type: "money", required: false },
      { id: "docs", name: "Docs", type: "files", required: false },
      { id: "checks", name: "Checks", type: "checkbox", required: false, options: ["GDPR", "NDA"] },
      { id: "ref", name: "Ref", type: "contact", required: false },
    ];
    const lead = {
      data: {
        area: "145",
        budget: { amount: 25000, currency: "CZK" },
        docs: [{ name: "floorplan-v2.pdf", size: "2 MB", path: "/uploads/fp.pdf" }],
        checks: { checked: ["GDPR"], extra: [{ label: "Site visit", required: false }] },
        ref: "lead-99",
      },
    };
    const resolveContact = (id: string) => (id === "lead-99" ? "Acme Partner" : "");

    assert.equal(leadMatchesCustomFieldQuery(lead, attrs, "czk", resolveContact), true);
    assert.equal(leadMatchesCustomFieldQuery(lead, attrs, "floorplan", resolveContact), true);
    assert.equal(leadMatchesCustomFieldQuery(lead, attrs, "gdpr", resolveContact), true);
    assert.equal(leadMatchesCustomFieldQuery(lead, attrs, "acme", resolveContact), true);
    assert.equal(leadMatchesCustomFieldQuery(lead, attrs, "145", resolveContact), true);
    assert.equal(leadMatchesCustomFieldQuery(lead, attrs, "nonexistent", resolveContact), false);
  });

  it("copies matching lead custom fields onto converted project data alongside contact heuristics", () => {
    const leadAttrs: ProjectAttribute[] = [
      { id: "lf_area", name: "Roof Area", type: "number", required: false },
      { id: "lf_email", name: "Client Email", type: "textfield", required: false },
      { id: "lf_tier", name: "Tier", type: "select", required: false, options: ["Gold", "Silver"] },
    ];
    const projectAttrs: ProjectAttribute[] = [
      { id: "pf_phone", name: "Phone", type: "textfield", required: false },
      { id: "pf_area", name: "  roof area ", type: "number", required: false },
      { id: "pf_email", name: "Client Email", type: "textfield", required: false },
      { id: "pf_tier", name: "Tier", type: "textarea", required: false },
    ];

    const data = buildProjectDataFromLead(
      {
        email: "fallback@example.com",
        phone: "+421900111222",
        city: "Kosice",
        companyId: "12345678",
        data: {
          lf_area: "120",
          lf_email: "custom@example.com",
          lf_tier: "Gold",
        },
      },
      leadAttrs,
      projectAttrs,
    );

    assert.equal(data.pf_phone, "+421900111222");
    assert.equal(data.pf_area, "120");
    // Custom field value takes precedence over generic lead.email heuristic when names match.
    assert.equal(data.pf_email, "custom@example.com");
    // Scalar -> textarea fallback works too.
    assert.equal(data.pf_tier, "Gold");
  });
});
