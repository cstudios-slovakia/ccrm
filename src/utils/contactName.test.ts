import test from "node:test";
import assert from "node:assert/strict";
import {
  composeContactName,
  contactNameFieldsOf,
  contactNameFromRegistry,
  contactNamePatch,
  contactNameShown,
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

// ---- person records (B1.7): the parts are the person's own name -----------------------------------
test("composeContactName never composes for a person: the fallback stays as it is (the PHP rule)", () => {
  assert.equal(composeContactName("Péter", "Kovács", "", true), "");
  assert.equal(composeContactName("Péter", "Kovács", " Old ", true), "Old");
});

test("a person's fields: stored parts win, else the split of name, else empty", () => {
  const person = { clientType: "person", name: "Kovács Péter" };
  assert.deepEqual(contactNameFieldsOf({ ...person, contactFirstName: "Péter", contactLastName: "Kovács" }), { firstName: "Péter", lastName: "Kovács" });
  assert.deepEqual(contactNameFieldsOf(person), { firstName: "Kovács", lastName: "Péter" });
  assert.deepEqual(contactNameFieldsOf({ clientType: "person", name: "Jana" }), { firstName: "", lastName: "" });
  assert.deepEqual(contactNameFieldsOf({ clientType: "person", name: "Jana", contactPerson: "Assistant Anna" }), { firstName: "", lastName: "" });
});

test("a person form that is only opened is not saved; typing the parts saves them and leaves contactPerson alone", () => {
  const person = { clientType: "person", name: "Kovács Péter" };
  assert.deepEqual(contactNamePatch(person, contactNameFieldsOf(person)), {});
  assert.deepEqual(contactNamePatch(person, { firstName: "Péter", lastName: "Kovács" }), { contactFirstName: "Péter", contactLastName: "Kovács" });
  assert.deepEqual(
    contactNamePatch({ ...person, contactPerson: "Assistant", contactFirstName: "Péter", contactLastName: "Kovács" }, { firstName: "Péter", lastName: "Nagy" }),
    { contactFirstName: "Péter", contactLastName: "Nagy" },
  );
});

test("a business still composes contactPerson, also when asPerson is passed explicitly as false", () => {
  assert.deepEqual(contactNamePatch({ clientType: "business", contactPerson: "Jana" }, { firstName: "Jana", lastName: "Malá" }, false), {
    contactPerson: "Jana Malá",
    contactFirstName: "Jana",
    contactLastName: "Malá",
  });
});

test("business to person: the contact person's parts are dropped, other parts kept", () => {
  const business = { clientType: "business", name: "Acme", contactPerson: "Eva Malá", contactFirstName: "Eva", contactLastName: "Malá" };
  assert.deepEqual(contactNameFieldsOf(business, true), { firstName: "", lastName: "" });
  assert.deepEqual(contactNameFieldsOf({ ...business, name: "Jana Nová" }, true), { firstName: "Jana", lastName: "Nová" });
  assert.deepEqual(contactNameFieldsOf({ ...business, contactFirstName: "Evka" }, true), { firstName: "Evka", lastName: "Malá" });
  // Untouched form, type switched: the contact's parts are cleared on the server, not carried over.
  assert.deepEqual(contactNamePatch(business, contactNameFieldsOf(business, true), true), { contactFirstName: "", contactLastName: "" });
});

test("person to business: the old contact person is shown instead of the person's own name", () => {
  const person = { clientType: "person", name: "Kovács Péter", contactPerson: "Eva Malá", contactFirstName: "Péter", contactLastName: "Kovács" };
  assert.deepEqual(contactNameFieldsOf(person, false), { firstName: "Eva", lastName: "Malá" });
  assert.deepEqual(contactNameFieldsOf({ clientType: "person", name: "Péter" }, false), { firstName: "", lastName: "" });
  // Untouched, type switched: the person's own parts are replaced, but the suggested ones are not saved.
  assert.deepEqual(contactNamePatch(person, contactNameFieldsOf(person, false), false), { contactFirstName: "", contactLastName: "" });
});

test("a new person form shows the split of name until something is typed", () => {
  const none = { firstName: "", lastName: "" };
  assert.deepEqual(contactNameShown(none, "Jana Malá", true), { firstName: "Jana", lastName: "Malá" });
  assert.deepEqual(contactNameShown(none, "Jana", true), none);
  assert.deepEqual(contactNameShown(none, "Jana Malá", false), none);
  assert.deepEqual(contactNameShown({ firstName: "Janka", lastName: "" }, "Jana Malá", true), { firstName: "Janka", lastName: "" });
});

test("a renamed person follows the new name unless the parts were typed", () => {
  const backfilled = { clientType: "person", name: "Jana Malá", contactFirstName: "Jana", contactLastName: "Malá" };
  const fields = contactNameFieldsOf(backfilled);
  assert.deepEqual(contactNamePatch(backfilled, fields, true, "Jana Nová"), { contactFirstName: "Jana", contactLastName: "Nová" });
  assert.deepEqual(contactNamePatch(backfilled, fields, true, "Jana Malá"), {});
  const typed = { clientType: "person", name: "Kovács Péter", contactFirstName: "Péter", contactLastName: "Kovács" };
  assert.deepEqual(contactNamePatch(typed, contactNameFieldsOf(typed), true, "Kovács Péter Jr"), {});
});
