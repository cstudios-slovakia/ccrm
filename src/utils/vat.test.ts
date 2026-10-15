import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VAT_RATES,
  DEFAULT_STANDARD_VAT_RATE,
  sanitizeVatRates,
  getAvailableVatRates,
  getDefaultVatRate
} from "./vat.ts";

describe("vat utils", () => {
  it("defaults to 23, 19, 10, 5, 0 in descending order", () => {
    assert.deepEqual(DEFAULT_VAT_RATES, [23, 19, 10, 5, 0]);
    assert.equal(DEFAULT_STANDARD_VAT_RATE, 23);
  });

  it("getAvailableVatRates returns defaults when input is empty, null, or undefined", () => {
    assert.deepEqual(getAvailableVatRates(undefined), [23, 19, 10, 5, 0]);
    assert.deepEqual(getAvailableVatRates(null), [23, 19, 10, 5, 0]);
    assert.deepEqual(getAvailableVatRates({ vatRates: [] }), [23, 19, 10, 5, 0]);
  });

  it("sanitizeVatRates filters invalid rates, deduplicates, and sorts descending", () => {
    const raw = [5, 23, 23, -1, 105, "19", 0, "abc", 10];
    const cleaned = sanitizeVatRates(raw as any);
    assert.deepEqual(cleaned, [23, 19, 10, 5, 0]);
  });

  it("supports custom VAT rates like 21%, 27%, 7.7%", () => {
    const raw = [27, 21, 5, 0];
    assert.deepEqual(sanitizeVatRates(raw), [27, 21, 5, 0]);
  });

  it("getDefaultVatRate returns 23 by default", () => {
    assert.equal(getDefaultVatRate(undefined), 23);
    assert.equal(getDefaultVatRate(null), 23);
    assert.equal(getDefaultVatRate({ defaultVatRate: 23 }), 23);
  });

  it("getDefaultVatRate respects user-configured defaultVatRate", () => {
    assert.equal(getDefaultVatRate({ defaultVatRate: 19 }), 19);
    assert.equal(getDefaultVatRate({ defaultVatRate: 0 }), 0);
    assert.equal(getDefaultVatRate({ defaultVatRate: 5 }), 5);
  });

  it("getDefaultVatRate falls back gracefully if defaultVatRate is invalid", () => {
    assert.equal(getDefaultVatRate({ defaultVatRate: -5, vatRates: [19, 10] }), 19);
    assert.equal(getDefaultVatRate({ defaultVatRate: null as any, vatRates: [23, 19] }), 23);
  });
});
