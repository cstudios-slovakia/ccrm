import assert from "node:assert/strict";
import test from "node:test";
import { formatNumber, formatMoney } from "./currency.ts";

test("formatNumber: formats numbers with Central European spacing instead of American commas", () => {
  // Thousands separation uses space (non-breaking space \u00a0 or \u202f)
  const formatted3100 = formatNumber(3100, "sk");
  const normalized3100 = formatted3100.replace(/\s|\u00a0|\u202f/g, " ");
  assert.equal(normalized3100, "3 100");

  const formattedZero = formatNumber(0, "sk");
  assert.equal(formattedZero, "0");

  const formattedLarge = formatNumber(1250000, "sk");
  assert.equal(formattedLarge.replace(/\s|\u00a0|\u202f/g, " "), "1 250 000");

  // Decimals use comma in Central Europe
  const formattedDecimal = formatNumber(3100.5, "sk", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.ok(formattedDecimal.includes(",50"));
  assert.ok(!formattedDecimal.includes(".50"));
});

test("formatMoney: places symbol and Central European separators", () => {
  const eur = formatMoney(3100, "EUR", "sk");
  const normalized = eur.replace(/\s|\u00a0|\u202f/g, " ");
  assert.equal(normalized, "3 100 €");
});
