import test from "node:test";
import assert from "node:assert/strict";
import type { Employee } from "../types";
import {
  composeName,
  employeeKind,
  fieldSuggestions,
  identityComplete,
  identityFields,
  identityOf,
  needsFullName,
} from "./employeeIdentity.ts";

const emp = (over: Partial<Employee>): Employee => ({ id: "e1", name: "x", ...over });

test("a person's display name is first + last, a company's is its single name", () => {
  assert.equal(composeName({ kind: "employee", firstName: " Ing. Michal ", lastName: "Kováč ", name: "ignored" }), "Ing. Michal Kováč");
  assert.equal(composeName({ kind: "contractor", firstName: "x", lastName: "y", name: " Dodigital s.r.o. " }), "Dodigital s.r.o.");
});

test("a person needs both names, a company or ledger item needs a name", () => {
  const base = identityOf(null);
  assert.equal(identityComplete({ ...base, firstName: "Tomi" }), false);
  assert.equal(identityComplete({ ...base, firstName: "Tomi", lastName: "Novák" }), true);
  assert.equal(identityComplete({ ...base, kind: "ledger", name: "" }), false);
  assert.equal(identityComplete({ ...base, kind: "ledger", name: "Provízia" }), true);
});

test("saving a company drops the person's name parts; empty position clears it", () => {
  const f = identityFields({ kind: "contractor", firstName: "stale", lastName: "stale", name: "Dodigital s.r.o.", position: " ", department: "Marketing" });
  assert.deepEqual(f, { name: "Dodigital s.r.o.", firstName: null, lastName: null, kind: "contractor", position: null, department: "Marketing" });
});

test("a record without a kind is an employee; a nickname-only one needs a full name", () => {
  assert.equal(employeeKind({}), "employee");
  assert.equal(needsFullName(emp({ name: "Tomi" })), true);
  assert.equal(needsFullName(emp({ firstName: "Tomáš", lastName: "Gazdag" })), false);
  assert.equal(needsFullName(emp({ kind: "contractor", name: "Dodigital s.r.o." })), false);
});

test("suggestions list the roster's own values first, most used first, then unused defaults", () => {
  const roster = [
    emp({ position: "Grafik" }),
    emp({ position: "programátor" }),
    emp({ position: "Programátor" }),
    emp({ position: null }),
  ];
  assert.deepEqual(fieldSuggestions(roster, "position", ["Programátor", "Telemarketing"]), ["programátor", "Grafik", "Telemarketing"]);
});
