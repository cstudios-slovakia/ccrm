import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_STANDARD_PAYMENT_METHOD,
  getAvailablePaymentMethods,
  getDefaultPaymentMethod
} from "./payment.ts";

test("payment utils", async t => {
  await t.test("defaults to standard 4 payment methods", () => {
    assert.deepEqual(DEFAULT_PAYMENT_METHODS, [
      "Prevod na účet",
      "Dobierka",
      "Platobná karta",
      "Hotovosť"
    ]);
    assert.equal(DEFAULT_STANDARD_PAYMENT_METHOD, "Prevod na účet");
  });

  await t.test("getAvailablePaymentMethods falls back to defaults when unconfigured or empty", () => {
    assert.deepEqual(getAvailablePaymentMethods(null), DEFAULT_PAYMENT_METHODS);
    assert.deepEqual(getAvailablePaymentMethods(undefined), DEFAULT_PAYMENT_METHODS);
    assert.deepEqual(getAvailablePaymentMethods({ paymentMethods: [] }), DEFAULT_PAYMENT_METHODS);
  });

  await t.test("sanitizes, trims, and deduplicates payment methods", () => {
    const configured = ["  Prevod na účet  ", "", "Dobierka", "Prevod na účet", "  PayPal  "];
    assert.deepEqual(getAvailablePaymentMethods({ paymentMethods: configured }), [
      "Prevod na účet",
      "Dobierka",
      "PayPal"
    ]);
  });

  await t.test("getDefaultPaymentMethod returns configured preferred method if valid", () => {
    const settings = {
      paymentMethods: ["Prevod na účet", "Platobná karta", "Apple Pay"],
      defaultPaymentMethod: "Platobná karta"
    };
    assert.equal(getDefaultPaymentMethod(settings), "Platobná karta");
  });

  await t.test("getDefaultPaymentMethod falls back to standard default or first available", () => {
    const settingsWithStandard = {
      paymentMethods: ["Dobierka", "Prevod na účet"],
      defaultPaymentMethod: "Invalid Method"
    };
    assert.equal(getDefaultPaymentMethod(settingsWithStandard), "Prevod na účet");

    const settingsWithoutStandard = {
      paymentMethods: ["Dobierka", "PayPal"],
      defaultPaymentMethod: "NonExistent"
    };
    assert.equal(getDefaultPaymentMethod(settingsWithoutStandard), "Dobierka");
  });
});
