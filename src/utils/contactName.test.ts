import test from "node:test";
import assert from "node:assert/strict";
import {
  composeContactName,
  contactNameFieldsOf,
  contactNameFromRegistry,
  contactNamePatch,
  contactPartsOfPerson,
} from "./contactName.ts";

test("composeContactName puts the given name first and trims", () => {
  assert.equal(composeContactName("Péter", "Kovács"), "Péter Kovács");
  assert.equal(composeContactName("  Jana ", ""), "Jana");
  assert.equal(composeContactName("", " Malá "), "Malá");
});

test("composeContactName keeps the fallback only when both parts are empty (the PHP rule)", () => {
  assert.equal(composeContactName("", "", "Old Name"), "Old Name");
  assert.equal(composeContactName("Eva", "", "Old Name"), "Eva");
  assert.equal(composeContactName("", ""), "");
});

test("contactNameFieldsOf prefers the stored parts", () => {
  assert.deepEqual(contactNameFieldsOf({ contactPerson: "Kovács Péter", contactFirstName: "Péter", contactLastName: "Kovács" }), {
    firstName: "Péter",
    lastName: "Kovács",
  });
});

test("contactNameFieldsOf splits an old full name like the server backfill", () => {
  assert.deepEqual(contactNameFieldsOf({ contactPerson: "Ing. Michal Kováč" }), { firstName: "Ing. Michal", lastName: "Kováč" });
});

test("contactNameFieldsOf shows a name it cannot split whole in the first field", () => {
  assert.deepEqual(contactNameFieldsOf({ contactPerson: "Jana" }), { firstName: "Jana", lastName: "" });
  assert.deepEqual(contactNameFieldsOf({ contactPerson: "Kováč, Michal" }), { firstName: "Kováč, Michal", lastName: "" });
  assert.deepEqual(contactNameFieldsOf(null), { firstName: "", lastName: "" });
});

test("contactNamePatch is empty while the form is untouched", () => {
  const record = { contactPerson: "Kováč, Michal" };
  assert.deepEqual(contactNamePatch(record, contactNameFieldsOf(record)), {});
});

test("contactNamePatch composes the full name and always sends both parts", () => {
  assert.deepEqual(contactNamePatch({ contactPerson: "Jana" }, { firstName: "Jana", lastName: "Malá" }), {
    contactPerson: "Jana Malá",
    contactFirstName: "Jana",
    contactLastName: "Malá",
  });
  assert.deepEqual(contactNamePatch({ contactPerson: "Jana Malá" }, { firstName: "", lastName: "" }), {
    contactPerson: "",
    contactFirstName: "",
    contactLastName: "",
  });
});

test("registry and guest-order names split the same way", () => {
  assert.deepEqual(contactNameFromRegistry("Ing. Michal Kováč"), { firstName: "Ing. Michal", lastName: "Kováč" });
  assert.equal(contactNameFromRegistry("Kováč, PhD."), null);
  assert.deepEqual(contactPartsOfPerson("Eva Malá"), { contactFirstName: "Eva", contactLastName: "Malá" });
  assert.deepEqual(contactPartsOfPerson("Eva"), { contactFirstName: "", contactLastName: "" });
});
