import test from "node:test";
import assert from "node:assert/strict";
import { composeKeyedPersonName, isSurnameFirstLanguage, joinNameParts, setNameOrderLanguage, splitNameOrdered } from "./nameOrder.ts";
import { composeContactName, contactNameFieldsOf, contactNamePatch } from "./contactName.ts";

test("only Hungarian writes the surname first", () => {
  assert.equal(isSurnameFirstLanguage("hu"), true);
  assert.equal(isSurnameFirstLanguage(" HU "), true);
  assert.equal(isSurnameFirstLanguage("sk"), false);
  assert.equal(isSurnameFirstLanguage("en"), false);
  assert.equal(isSurnameFirstLanguage(null), false);
});

test("joinNameParts orders by the flag", () => {
  assert.equal(joinNameParts(" János ", "Kovács", true), "Kovács János");
  assert.equal(joinNameParts("Michal", " Kováč ", false), "Michal Kováč");
  assert.equal(joinNameParts("", "Kovács", true), "Kovács");
});

test("splitNameOrdered surname first: first word (with leading titles) is the surname", () => {
  assert.deepEqual(splitNameOrdered("Kovács János", true), { firstName: "János", lastName: "Kovács" });
  assert.deepEqual(splitNameOrdered("Császár  Ákos", true), { firstName: "Ákos", lastName: "Császár" });
  assert.deepEqual(splitNameOrdered("Kovács Anna Mária", true), { firstName: "Anna Mária", lastName: "Kovács" });
  assert.deepEqual(splitNameOrdered("Dr. Kovács János", true), { firstName: "János", lastName: "Dr. Kovács" });
  assert.equal(splitNameOrdered("Kovács", true), null);
  assert.equal(splitNameOrdered("Kovács, János", true), null);
  assert.equal(splitNameOrdered("Dr. Kovács", true), null);
  assert.equal(splitNameOrdered("Kovács János PhD.", true), null);
});

test("splitNameOrdered given name first is the old split", () => {
  assert.deepEqual(splitNameOrdered("Ing. Michal Kováč", false), { firstName: "Ing. Michal", lastName: "Kováč" });
});

test("contact names follow the system language", () => {
  try {
    setNameOrderLanguage("hu");
    assert.equal(composeContactName("János", "Kovács"), "Kovács János");
    assert.deepEqual(contactNameFieldsOf({ clientType: "company", contactPerson: "Kovács János" }), { firstName: "János", lastName: "Kovács" });
    assert.deepEqual(
      contactNamePatch({ clientType: "company", contactPerson: "" }, { firstName: "János", lastName: "Kovács" }),
      { contactPerson: "Kovács János", contactFirstName: "János", contactLastName: "Kovács" },
    );
    setNameOrderLanguage("sk");
    assert.equal(composeContactName("Michal", "Kováč"), "Michal Kováč");
  } finally {
    setNameOrderLanguage(null);
  }
});

test("composeKeyedPersonName: a new record takes the system order", () => {
  assert.equal(composeKeyedPersonName("János", "Kovács", null, true), "Kovács János");
  assert.equal(composeKeyedPersonName("János", "Kovács", undefined, false), "János Kovács");
  assert.equal(composeKeyedPersonName("János", "Kovács", { name: "", firstName: null, lastName: null }, true), "Kovács János");
});

test("composeKeyedPersonName: a stored name keeps its text while the parts are unchanged, in either order", () => {
  const stored = { name: "János Kovács", firstName: "János", lastName: "Kovács" };
  assert.equal(composeKeyedPersonName("János", "Kovács", stored, true), "János Kovács");
  assert.equal(composeKeyedPersonName(" János", "Kovács ", stored, false), "János Kovács");
  const hu = { name: "Kovács János", firstName: "János", lastName: "Kovács" };
  assert.equal(composeKeyedPersonName("János", "Kovács", hu, false), "Kovács János");
});

test("composeKeyedPersonName: an edited part is rewritten in the order the name was written in", () => {
  const given = { name: "János Kovács", firstName: "János", lastName: "Kovács" };
  assert.equal(composeKeyedPersonName("János", "Kovácsy", given, true), "János Kovácsy");
  const surname = { name: "Kovács János", firstName: "János", lastName: "Kovács" };
  assert.equal(composeKeyedPersonName("Jenő", "Kovács", surname, false), "Kovács Jenő");
});

test("composeKeyedPersonName: a stored name that matches no order falls back to the system order", () => {
  const nick = { name: "András", firstName: null, lastName: null };
  assert.equal(composeKeyedPersonName("András", "Kiss", nick, true), "Kiss András");
  assert.equal(composeKeyedPersonName("András", "Kiss", nick, false), "András Kiss");
});
