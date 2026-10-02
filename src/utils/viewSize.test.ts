import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_VIEW_SIZE_MODE, isViewSizeMode, resolveViewSize, viewSizeScale } from "./viewSize.ts";

test("auto resolves by window width boundaries", () => {
  assert.equal(resolveViewSize("auto", 390), "compact");
  assert.equal(resolveViewSize("auto", 1799), "compact");
  assert.equal(resolveViewSize("auto", 1800), "normal");
  assert.equal(resolveViewSize("auto", 2199), "normal");
  assert.equal(resolveViewSize("auto", 2200), "big");
  assert.equal(resolveViewSize("auto", 2560), "big");
});

test("manual modes ignore the width", () => {
  for (const w of [390, 1800, 2560]) {
    assert.equal(resolveViewSize("compact", w), "compact");
    assert.equal(resolveViewSize("normal", w), "normal");
    assert.equal(resolveViewSize("big", w), "big");
  }
});

test("isViewSizeMode accepts only the four modes", () => {
  for (const m of ["auto", "compact", "normal", "big"]) assert.ok(isViewSizeMode(m));
  for (const m of ["", "Auto", "huge", null, undefined, 1]) assert.ok(!isViewSizeMode(m));
});

test("scales", () => {
  assert.equal(viewSizeScale("compact"), 1);
  assert.equal(viewSizeScale("normal"), 1.125);
  assert.equal(viewSizeScale("big"), 1.25);
});

test("index.html pre-paint default matches viewSize.ts", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const m = html.match(/var VS_DEFAULT = "(\w+)"/);
  assert.ok(m, "VS_DEFAULT not found in index.html");
  assert.equal(m[1], DEFAULT_VIEW_SIZE_MODE);
});
