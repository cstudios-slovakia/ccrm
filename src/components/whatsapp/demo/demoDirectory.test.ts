import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoDirectory } from "./demoDirectory.ts";

const leads = [
  { id: "demo-clients-1", name: "Lapidea Horský park", adjustment: 1200 },
  { id: "client-9", name: "Kováč s.r.o." },
  { id: "demo-clients-10", name: "Müller Architekten", adjustment: 0 },
];
const projects = [{ id: "demo-projects-1", name: "Fasáda Horský park" }];
const dir = buildDemoDirectory(leads, projects);

test("a client is a lead row with a client id or a positive adjustment; a plain lead is not", () => {
  assert.deepEqual(dir.get("lead", "demo-clients-1"), { name: "Lapidea Horský park", isClient: true });
  assert.deepEqual(dir.get("lead", "client-9"), { name: "Kováč s.r.o.", isClient: true });
  assert.deepEqual(dir.get("lead", "demo-clients-10"), { name: "Müller Architekten", isClient: false });
  assert.deepEqual(dir.get("project", "demo-projects-1"), { name: "Fasáda Horský park", isClient: false });
});

test("a record the CRM does not hold is not there", () => {
  assert.equal(dir.get("lead", "demo-clients-99"), null);
  assert.equal(dir.get("project", "demo-clients-1"), null);
});

test("search ignores case and accents, returns leads then projects, with the hash the record opens at", () => {
  const hits = dir.search("HORSKY");
  assert.deepEqual(hits.map((h) => [h.entity_type, h.crm_id]), [
    ["lead", "demo-clients-1"],
    ["project", "demo-projects-1"],
  ]);
  assert.equal(hits[0]!.url, "#client-Lapidea%20Horsk%C3%BD%20park");
  assert.equal(hits[1]!.url, "#projects/demo-projects-1");
  assert.equal(dir.search("muller")[0]!.url, "#lead-demo-clients-10");
  assert.deepEqual(dir.search("  "), []);
  assert.deepEqual(dir.search("zzz"), []);
});

test("search stops at twenty results", () => {
  const many = buildDemoDirectory(Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, name: `Firma ${i}` })), []);
  assert.equal(many.search("firma").length, 20);
});
