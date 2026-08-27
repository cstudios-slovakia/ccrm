import assert from "node:assert/strict";
import test from "node:test";
import { liftAccent, readableOn } from "./accentColor.ts";

test("liftAccent leaves the colour to the theme, and refuses to break the declaration", () => {
  assert.equal(
    liftAccent("#4f46e5"),
    "color-mix(in oklab, #4f46e5, var(--accent-lift-color) var(--accent-lift-amount))"
  );
  // Anything that could unbalance the function is passed through untouched
  // rather than producing CSS that the browser drops on the floor.
  assert.equal(liftAccent("rgb(1, 2, 3)"), "rgb(1, 2, 3)");
  assert.equal(liftAccent(""), "");
  assert.equal(liftAccent(undefined), "");
});

test("readableOn picks the legible foreground for a configured fill", () => {
  assert.equal(readableOn("#0ea5e9"), "#0b1220"); // sky-500 — white was 2.77:1 here
  assert.equal(readableOn("#fbbf24"), "#0b1220"); // amber-400
  assert.equal(readableOn("#059669"), "#0b1220"); // emerald-600, just past the crossover
  assert.equal(readableOn("#4f46e5"), "#ffffff"); // indigo-600
  assert.equal(readableOn("#e11d48"), "#ffffff"); // rose-600
  assert.equal(readableOn("#000000"), "#ffffff");
  assert.equal(readableOn("#fff"), "#0b1220");
  assert.equal(readableOn("rgb(14, 165, 233)"), "#0b1220");
});

test("readableOn falls back rather than guessing at an unparseable colour", () => {
  assert.equal(readableOn("var(--whatever)"), "#ffffff");
  assert.equal(readableOn(null), "#ffffff");
  assert.equal(readableOn("nonsense", "#123456"), "#123456");
});
