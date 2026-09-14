import { test } from "node:test";
import assert from "node:assert/strict";
import { COLOR_PRESETS, normalizeHex, prefersDarkInk } from "./color.ts";

test("normalizeHex accepts full, prefix-less and shorthand hex", () => {
  assert.equal(normalizeHex("#3B82F6"), "#3b82f6");
  assert.equal(normalizeHex("3b82f6"), "#3b82f6");
  assert.equal(normalizeHex(" #abc "), "#aabbcc");
  assert.equal(normalizeHex("fff"), "#ffffff");
});

test("normalizeHex rejects anything that is not a hex colour", () => {
  assert.equal(normalizeHex(""), null);
  assert.equal(normalizeHex(null), null);
  assert.equal(normalizeHex(undefined), null);
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex("#gggggg"), null);
  assert.equal(normalizeHex("indigo"), null);
  assert.equal(normalizeHex("rgb(0,0,0)"), null);
});

test("prefersDarkInk picks readable ink for light and dark swatches", () => {
  assert.equal(prefersDarkInk("#ffffff"), true);
  assert.equal(prefersDarkInk("#eab308"), true);
  assert.equal(prefersDarkInk("#000000"), false);
  assert.equal(prefersDarkInk("#334155"), false);
  assert.equal(prefersDarkInk("not a colour"), false);
});

test("every preset is a unique normalised hex colour", () => {
  for (const preset of COLOR_PRESETS) assert.equal(normalizeHex(preset), preset);
  assert.equal(new Set(COLOR_PRESETS).size, COLOR_PRESETS.length);
});
