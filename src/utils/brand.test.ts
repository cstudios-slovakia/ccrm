import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PRODUCT_CLI,
  PRODUCT_NAME,
  getSystemTitle,
  getSystemTitleWithProduct,
  normalizeSystemTitleOverride,
  resolveSystemTitle,
  resolveTitleWithProduct,
  setSystemTitle,
  withBrand,
} from "./brand.ts";
import { getTranslation } from "./translations.ts";

test("the product is Koperniq and its command is kprnq", () => {
  assert.equal(PRODUCT_NAME, "Koperniq");
  assert.equal(PRODUCT_CLI, "kprnq");
});

test("an empty or missing title falls back to the product name", () => {
  for (const blank of ["", "   ", undefined, null]) {
    assert.equal(resolveSystemTitle(blank), PRODUCT_NAME);
    assert.equal(normalizeSystemTitleOverride(blank), "");
  }
});

test("CCRM is an ordinary custom title: existing installs keep it and it can be set", () => {
  assert.equal(normalizeSystemTitleOverride("CCRM"), "CCRM");
  assert.equal(resolveSystemTitle(" CCRM "), "CCRM");
});

test("a custom title wins, trimmed", () => {
  assert.equal(normalizeSystemTitleOverride("  Lapidea "), "Lapidea");
  assert.equal(resolveSystemTitle("Lapidea"), "Lapidea");
});

test("title and product together: 'Lapidea (Koperniq)', never 'Koperniq (Koperniq)'", () => {
  assert.equal(resolveTitleWithProduct("Lapidea"), "Lapidea (Koperniq)");
  assert.equal(resolveTitleWithProduct(""), "Koperniq");
  assert.equal(resolveTitleWithProduct("Koperniq"), "Koperniq");
});

test("{product} is always the product; {title} follows the company's title", () => {
  setSystemTitle("");
  assert.equal(getSystemTitle(), "Koperniq");
  assert.match(getTranslation("en", "license.banner.revoked"), /Koperniq licence/);
  setSystemTitle("Lapidea");
  // the product name does not change when the company sets a title of its own
  assert.match(getTranslation("sk", "license.banner.revoked"), /Koperniq/);
  assert.doesNotMatch(getTranslation("sk", "license.banner.revoked"), /Lapidea/);
  assert.equal(withBrand("by {product}, for {title}"), "by Koperniq, for Lapidea");
  assert.equal(getSystemTitleWithProduct(), "Lapidea (Koperniq)");
  setSystemTitle("");
  assert.equal(getSystemTitle(), "Koperniq");
});

// Static files cannot import PRODUCT_NAME; they carry the literal and this keeps them honest.
test("static files that cannot import the constant carry the product name", () => {
  for (const file of ["index.html", "public/manifest.json", "public/api/brand.php"]) {
    assert.ok(readFileSync(file, "utf8").includes(PRODUCT_NAME), `${file} should say ${PRODUCT_NAME}`);
  }
});

test("the old product name is not shown as a command in visible text", () => {
  assert.doesNotMatch(getTranslation("en", "license.updates_explainer"), /php ccrm/);
  assert.match(getTranslation("en", "license.updates_explainer"), /php kprnq update/);
});
