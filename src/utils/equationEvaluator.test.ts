import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEquation } from "./equationEvaluator.ts";

test("evaluateEquation: simple numbers and decimals", () => {
  assert.equal(evaluateEquation("100"), 100);
  assert.equal(evaluateEquation("100.5"), 100.5);
  assert.equal(evaluateEquation("100,5"), 100.5);
  assert.equal(evaluateEquation(" 1 500,50 "), 1500.5);
  assert.equal(evaluateEquation(250), 250);
});

test("evaluateEquation: basic arithmetic", () => {
  assert.equal(evaluateEquation("100 + 200"), 300);
  assert.equal(evaluateEquation("500 - 150"), 350);
  assert.equal(evaluateEquation("10 * 25"), 250);
  assert.equal(evaluateEquation("100 / 4"), 25);
});

test("evaluateEquation: operator precedence and parentheses", () => {
  assert.equal(evaluateEquation("10 + 20 * 3"), 70);
  assert.equal(evaluateEquation("(10 + 20) * 3"), 90);
  assert.equal(evaluateEquation("100 - 50 / 2"), 75);
  assert.equal(evaluateEquation("(100 - 50) / 2"), 25);
  assert.equal(evaluateEquation("((5 + 5) * (10 - 2)) / 4"), 20);
});

test("evaluateEquation: spreadsheet prefix and negative numbers", () => {
  assert.equal(evaluateEquation("= 1200 + 450"), 1650);
  assert.equal(evaluateEquation("=-50 + 150"), 100);
  assert.equal(evaluateEquation("-10 * -5"), 50);
});

test("evaluateEquation: floating point accuracy", () => {
  assert.equal(evaluateEquation("0.1 + 0.2"), 0.3);
  assert.equal(evaluateEquation("12,5 + 7,5"), 20);
});

test("evaluateEquation: safe error handling on invalid input", () => {
  assert.equal(evaluateEquation(""), null);
  assert.equal(evaluateEquation("   "), null);
  assert.equal(evaluateEquation(null), null);
  assert.equal(evaluateEquation(undefined), null);
  assert.equal(evaluateEquation("abc"), null);
  assert.equal(evaluateEquation("100 / 0"), null); // division by zero
  assert.equal(evaluateEquation("10 +"), null);
  assert.equal(evaluateEquation("10 + 20 30"), null);
  assert.equal(evaluateEquation("(10 + 20"), null); // unclosed
  assert.equal(evaluateEquation("10 + 20)"), null); // extra close
  assert.equal(evaluateEquation("10..5 + 2"), null);
});
