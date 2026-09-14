import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_CATEGORY_COLORS, COLOR_PRESETS, inheritedColor, nextCategoryColor, normalizeHex, prefersDarkInk } from "./color.ts";

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

test("every auto category colour is a unique picker preset", () => {
  for (const hex of AUTO_CATEGORY_COLORS) assert.ok((COLOR_PRESETS as readonly string[]).includes(hex), hex);
  assert.equal(new Set(AUTO_CATEGORY_COLORS).size, AUTO_CATEGORY_COLORS.length);
});

test("nextCategoryColor picks the first colour no category has yet", () => {
  assert.equal(nextCategoryColor([]), AUTO_CATEGORY_COLORS[0]);
  assert.equal(nextCategoryColor([AUTO_CATEGORY_COLORS[0].toUpperCase(), null]), AUTO_CATEGORY_COLORS[1]);
  assert.equal(nextCategoryColor([AUTO_CATEGORY_COLORS[1], "#123456"]), AUTO_CATEGORY_COLORS[0]);
});

test("nextCategoryColor reuses the least used colour once all are taken", () => {
  const all = [...AUTO_CATEGORY_COLORS, AUTO_CATEGORY_COLORS[0], AUTO_CATEGORY_COLORS[1]];
  assert.equal(nextCategoryColor(all), AUTO_CATEGORY_COLORS[2]);
});

test("inheritedColor walks up to the nearest coloured ancestor", () => {
  const nodes = [
    { id: "a", parentId: null, color: "#ef4444" },
    { id: "b", parentId: "a", color: null },
    { id: "c", parentId: "b" },
    { id: "d", parentId: "c", color: "#3b82f6" },
    { id: "x", parentId: "y" },
    { id: "y", parentId: "x" },
  ];
  assert.equal(inheritedColor(nodes, "c"), "#ef4444");
  assert.equal(inheritedColor(nodes, "d"), "#3b82f6");
  assert.equal(inheritedColor(nodes, "x"), null);
  assert.equal(inheritedColor(nodes, "missing"), null);
  assert.equal(inheritedColor(nodes, null), null);
});
