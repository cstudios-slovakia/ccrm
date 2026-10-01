import assert from "node:assert/strict";
import test from "node:test";
import { isClientRecord, recordHref, recordKind } from "./clientRecord.ts";

test("an explicit client-* record is a client", () => {
  assert.equal(isClientRecord({ id: "client-123" }), true);
});

test("a positive adjustment makes a record a client, zero or none does not", () => {
  assert.equal(isClientRecord({ id: "lead-1", adjustment: 50 }), true);
  assert.equal(isClientRecord({ id: "lead-1", adjustment: 0 }), false);
  assert.equal(isClientRecord({ id: "lead-1" }), false);
});

test("kind follows the same rule", () => {
  assert.equal(recordKind({ id: "client-1" }), "client");
  assert.equal(recordKind({ id: "lead-1" }), "lead");
});

test("clients link by name and leads by id", () => {
  assert.equal(recordHref({ id: "client-1", name: "Testovacia Firma s.r.o." }), "#client-Testovacia%20Firma%20s.r.o.");
  assert.equal(recordHref({ id: "lead-silvia", name: "Silvia" }), "#lead-lead-silvia");
});
