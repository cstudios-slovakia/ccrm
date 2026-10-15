import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHIPPING_METHODS,
  getAvailableShippingMethods
} from "./shipping.ts";

describe("shipping utils", () => {
  it("defaults to standard 5 shipping methods", () => {
    assert.deepEqual(DEFAULT_SHIPPING_METHODS, [
      "DPD Kuriér",
      "Packeta / Zásielkovňa",
      "GLS Expres",
      "Slovenská pošta",
      "Osobný odber"
    ]);
  });

  it("getAvailableShippingMethods falls back to defaults when unconfigured or empty", () => {
    assert.deepEqual(getAvailableShippingMethods(undefined), DEFAULT_SHIPPING_METHODS);
    assert.deepEqual(getAvailableShippingMethods(null), DEFAULT_SHIPPING_METHODS);
    assert.deepEqual(getAvailableShippingMethods({ shippingMethods: [] }), DEFAULT_SHIPPING_METHODS);
  });

  it("sanitizes, trims, and deduplicates shipping methods", () => {
    const configured = ["  DPD Kuriér  ", "SPS Expres", "DPD Kuriér", "", "   ", "Zásielkovňa"];
    assert.deepEqual(getAvailableShippingMethods({ shippingMethods: configured }), [
      "DPD Kuriér",
      "SPS Expres",
      "Zásielkovňa"
    ]);
  });
});
