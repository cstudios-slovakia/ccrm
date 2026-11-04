import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BRAND_NAME,
  getBrandName,
  normalizeBrandOverride,
  resolveBrandName,
  setBrandName,
  withBrand,
} from "./brand.ts";
import { getTranslation } from "./translations.ts";

test("an empty or missing name falls back to Koperniq", () => {
  for (const blank of ["", "   ", undefined, null]) {
    assert.equal(resolveBrandName(blank), DEFAULT_BRAND_NAME);
    assert.equal(normalizeBrandOverride(blank), "");
  }
  assert.equal(DEFAULT_BRAND_NAME, "Koperniq");
});

test("CCRM is an ordinary custom name: existing installs keep it and it can be set", () => {
  assert.equal(normalizeBrandOverride("CCRM"), "CCRM");
  assert.equal(resolveBrandName(" CCRM "), "CCRM");
});

test("a custom name wins, trimmed", () => {
  assert.equal(normalizeBrandOverride("  Acme Hub "), "Acme Hub");
  assert.equal(resolveBrandName("Acme Hub"), "Acme Hub");
});

test("{brand} in translations and copy follows the current name", () => {
  setBrandName("");
  assert.equal(getBrandName(), "Koperniq");
  assert.match(getTranslation("en", "license.banner.revoked"), /Koperniq licence/);
  setBrandName("Acme Hub");
  assert.match(getTranslation("sk", "license.banner.revoked"), /Acme Hub/);
  assert.equal(withBrand("by {brand}, for {brand}"), "by Acme Hub, for Acme Hub");
  setBrandName("");
  assert.equal(getBrandName(), "Koperniq");
});
