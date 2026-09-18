import assert from "node:assert/strict";
import test from "node:test";
import { matchesRatingFilter, ratingFilterOptions, ratingValue } from "./rating.ts";

const t = (en: string) => en;

test("a missing rating reads as zero", () => {
  assert.equal(ratingValue(undefined), 0);
  assert.equal(ratingValue(null), 0);
  assert.equal(ratingValue(Number.NaN), 0);
  assert.equal(ratingValue(4), 4);
});

test("'all' and an empty filter keep every row", () => {
  for (const rating of [undefined, 0, 1, 5]) {
    assert.equal(matchesRatingFilter(rating, "all"), true);
    assert.equal(matchesRatingFilter(rating, ""), true);
  }
});

test("'none' is only the rows nobody rated", () => {
  assert.equal(matchesRatingFilter(undefined, "none"), true);
  assert.equal(matchesRatingFilter(0, "none"), true);
  assert.equal(matchesRatingFilter(1, "none"), false);
});

test("'min4' means four stars or more, and never an unrated row", () => {
  assert.equal(matchesRatingFilter(5, "min4"), true);
  assert.equal(matchesRatingFilter(4, "min4"), true);
  assert.equal(matchesRatingFilter(3, "min4"), false);
  assert.equal(matchesRatingFilter(undefined, "min4"), false);
});

test("an exact filter matches only that many stars", () => {
  assert.equal(matchesRatingFilter(3, "3"), true);
  assert.equal(matchesRatingFilter(4, "3"), false);
  assert.equal(matchesRatingFilter(undefined, "3"), false);
});

test("an unrecognised filter shows everything rather than emptying the list", () => {
  assert.equal(matchesRatingFilter(2, "min-nonsense"), true);
  assert.equal(matchesRatingFilter(0, "sideways"), true);
});

test("the dropdown offers all, two thresholds, five exact ratings and unrated", () => {
  const options = ratingFilterOptions((en) => t(en));
  assert.deepEqual(
    options.map((o) => o.value),
    ["all", "min4", "min3", "5", "4", "3", "2", "1", "none"],
  );
  // Every option the dropdown offers has to be one the filter understands.
  for (const { value } of options) {
    assert.doesNotThrow(() => matchesRatingFilter(3, value));
  }
  assert.equal(options[3].label, "★★★★★");
  assert.equal(options[7].label, "★☆☆☆☆");
});
