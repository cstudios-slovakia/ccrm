import test from "node:test";
import assert from "node:assert/strict";
import type { Employee } from "../types";
import {
  composeName,
  employeeKind,
  fieldSuggestions,
  identityComplete,
  identityFields,
  identityFromCompany,
  identityOf,
  needsFullName,
  splitPersonName,
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

test("an external supplier keeps its contact person and register numbers; a ledger item keeps neither", () => {
  const base = { ...identityOf(null), name: "Dodigital s.r.o.", position: " ", department: "Marketing" };
  const supplier = identityFields({ ...base, kind: "contractor", firstName: " Ján ", lastName: "Novák", companyId: " 48123456 ", taxId: "2120123456", vatId: "" });
  assert.deepEqual(supplier, {
    name: "Dodigital s.r.o.", firstName: "Ján", lastName: "Novák", kind: "contractor",
    companyId: "48123456", taxId: "2120123456", vatId: null, position: null, department: "Marketing",
  });
  const ledger = identityFields({ ...base, kind: "ledger", firstName: "stale", lastName: "stale", companyId: "1", taxId: "2", vatId: "3" });
  assert.deepEqual(ledger, {
    name: "Dodigital s.r.o.", firstName: null, lastName: null, kind: "ledger",
    companyId: null, taxId: null, vatId: null, position: null, department: "Marketing",
  });
});

test("the register numbers are only read back from a contractor", () => {
  const stored = emp({ kind: "employee", companyId: "48123456", taxId: "x", vatId: "y" });
  assert.deepEqual([identityOf(stored).companyId, identityOf(stored).taxId, identityOf(stored).vatId], ["", "", ""]);
  assert.equal(identityOf(emp({ kind: "contractor", companyId: "48123456" })).companyId, "48123456");
});

test("a register contact person is split into first and last name, titles stay with the first name", () => {
  assert.deepEqual(splitPersonName("Ing. Michal Kováč"), { firstName: "Ing. Michal", lastName: "Kováč" });
  assert.deepEqual(splitPersonName("  Ján   Novák "), { firstName: "Ján", lastName: "Novák" });
  assert.equal(splitPersonName("Dodigital"), null);
  assert.equal(splitPersonName("Novák, Ján"), null);
  assert.equal(splitPersonName("Ján Novák CSc."), null);
  assert.equal(splitPersonName(""), null);
});

test("a register lookup fills the supplier but never overwrites a contact person already typed", () => {
  const details = { name: "Dodigital s.r.o.", companyId: "48123456", taxId: "2120123456", vatId: "SK2120123456", contactPerson: "Ján Novák" };
  const empty = { ...identityOf(null), kind: "contractor" as const };
  assert.deepEqual(identityFromCompany(empty, details), {
    name: "Dodigital s.r.o.", companyId: "48123456", taxId: "2120123456", vatId: "SK2120123456", firstName: "Ján", lastName: "Novák",
  });
  const typed = { ...empty, firstName: "Eva", name: "Old name", vatId: "SK1" };
  const patch = identityFromCompany(typed, { ...details, vatId: "" });
  assert.equal(patch.firstName, undefined);
  assert.equal(patch.lastName, undefined);
  assert.equal(patch.vatId, "SK1");
  assert.equal(patch.name, "Dodigital s.r.o.");
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

test("the edit form seeds a legacy name-only person from the display name", () => {
  const nick = identityOf(emp({ name: "András" }));
  assert.deepEqual([nick.firstName, nick.lastName], ["András", ""]);
  const full = identityOf(emp({ name: "Ján Novák" }));
  assert.deepEqual([full.firstName, full.lastName], ["Ján", "Novák"]);
  const split = identityOf(emp({ name: "Peter Varga", firstName: "Peter", lastName: "Varga" }));
  assert.deepEqual([split.firstName, split.lastName], ["Peter", "Varga"]);
});
