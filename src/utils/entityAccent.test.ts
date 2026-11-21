import assert from "node:assert/strict";
import test from "node:test";
import {
  entityAccentStyle,
  entityAccentVars,
  resolveEntityHex,
  resolveRouteEntityHex,
  resolveSectionId,
} from "./entityAccent.ts";
import { SECTION_PALETTE } from "./sectionPalette.ts";

test("every SectionVisualId resolves to its canonical palette color", () => {
  for (const [id, entry] of Object.entries(SECTION_PALETTE)) {
    assert.equal(resolveSectionId(id), id);
    assert.equal(resolveEntityHex(id), entry.color);
  }
});

test("singular entity aliases and dynamic routes resolve to canonical section colors", () => {
  assert.equal(resolveEntityHex("lead"), SECTION_PALETTE.leads.color);
  assert.equal(resolveEntityHex("client"), SECTION_PALETTE.clients.color);
  assert.equal(resolveEntityHex("project"), SECTION_PALETTE.projects.color);
  assert.equal(resolveEntityHex("task"), SECTION_PALETTE.tasks.color);
  assert.equal(resolveEntityHex("ticket"), SECTION_PALETTE.tickets.color);
  assert.equal(resolveEntityHex("order"), SECTION_PALETTE.orders.color);
  assert.equal(resolveEntityHex("invoice"), SECTION_PALETTE.invoices.color);
  assert.equal(resolveEntityHex("offer"), SECTION_PALETTE.invoices.color);
  assert.equal(resolveEntityHex("product"), SECTION_PALETTE.warehouse.color);
  assert.equal(resolveEntityHex("employee"), SECTION_PALETTE.employees.color);
  assert.equal(resolveEntityHex("agency_worker"), SECTION_PALETTE.agency.color);
  assert.equal(resolveEntityHex("newsletter"), SECTION_PALETTE.newsletter.color);

  assert.equal(resolveRouteEntityHex("leads/lead-123"), SECTION_PALETTE.leads.color);
  assert.equal(resolveRouteEntityHex("project-abc"), SECTION_PALETTE.projects.color);
  assert.equal(resolveRouteEntityHex("client-Acme"), SECTION_PALETTE.clients.color);
  assert.equal(resolveRouteEntityHex("employee-42"), SECTION_PALETTE.employees.color);
});

test("custom dashboards and unified entries honor custom hex colors", () => {
  assert.equal(
    resolveRouteEntityHex("dash_sales", [{ id: "sales", color: "#0ea5e9" }], []),
    "#0ea5e9"
  );
  assert.equal(
    resolveRouteEntityHex("ue_contracts", [], [{ id: "contracts", color: "#9333ea" }]),
    "#9333ea"
  );
});

test("entityAccentVars deepens light hex colors so white text stays readable", () => {
  const warmBronzeVars = entityAccentVars(SECTION_PALETTE.employees.color);
  assert.equal(warmBronzeVars["--entity-accent"], "#c29b62");
  assert.notEqual(warmBronzeVars["--entity-accent-solid"], "#c29b62");
  assert.ok(warmBronzeVars["--entity-accent-solid"].startsWith("rgb("));

  const styleFromEntity = entityAccentStyle("projects");
  assert.equal(styleFromEntity["--entity-accent"], SECTION_PALETTE.projects.color);
  assert.equal(styleFromEntity["--entity-accent-solid"], SECTION_PALETTE.projects.color);
});
