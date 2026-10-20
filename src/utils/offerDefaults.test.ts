import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFER_DEFAULT_KEYS,
  blankBilling,
  keepStoredOfferDefaults,
  pickOfferDefaults,
  withOfferDefaults,
} from "./offerDefaults.ts";

const stored = () => ({
  ...blankBilling(),
  companyName: "Acme",
  iban: "SK01",
  defaultWarrantyText: "10 years",
  defaultUspCards: [{ title: "Fast", subtitle: "2 days" }],
});

test("pickOfferDefaults always yields four USP cards", () => {
  const picked = pickOfferDefaults(stored());
  assert.equal(picked.defaultUspCards.length, 4);
  assert.deepEqual(picked.defaultUspCards[0], { title: "Fast", subtitle: "2 days" });
  assert.deepEqual(picked.defaultUspCards[3], { title: "", subtitle: "" });
});

test("pickOfferDefaults tolerates a missing record", () => {
  assert.equal(pickOfferDefaults(null).defaultWarrantyText, "");
  assert.equal(pickOfferDefaults(undefined).defaultUspCards.length, 4);
});

test("saving offer texts leaves the identity of the latest record alone", () => {
  const next = withOfferDefaults(stored(), { ...pickOfferDefaults(null), defaultWarrantyText: "5 years" });
  assert.equal(next.defaultWarrantyText, "5 years");
  assert.equal(next.companyName, "Acme");
  assert.equal(next.iban, "SK01");
});

test("saving offer texts on a tenant with no billing record starts from a blank one", () => {
  const next = withOfferDefaults(null, { ...pickOfferDefaults(null), defaultNextSteps: "Call us" });
  assert.equal(next.defaultNextSteps, "Call us");
  assert.equal(next.companyName, "");
  assert.equal(next.defaultPaymentDueDays, 14);
});

test("saving the identity form keeps offer texts saved elsewhere in the meantime", () => {
  // The identity form was opened before the offer texts were changed.
  const staleForm = { ...stored(), companyName: "Acme s.r.o.", defaultWarrantyText: "10 years" };
  const latest = { ...stored(), defaultWarrantyText: "5 years" };
  const next = keepStoredOfferDefaults(staleForm, latest);
  assert.equal(next.companyName, "Acme s.r.o.");
  assert.equal(next.defaultWarrantyText, "5 years");
});

test("the offer keys are exactly what pickOfferDefaults returns", () => {
  assert.deepEqual(Object.keys(pickOfferDefaults(null)).sort(), [...OFFER_DEFAULT_KEYS].sort());
});
