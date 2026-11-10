import { test } from "node:test";
import assert from "node:assert/strict";
import { cn, TYPE_ROLE_SIZES } from "./cn.ts";

test("a type-role size survives next to a text colour", () => {
  for (const size of TYPE_ROLE_SIZES) {
    assert.equal(cn(`text-${size}`, "text-slate-800"), `text-${size} text-slate-800`);
  }
});

test("two type-role sizes still merge to the last one", () => {
  assert.equal(cn("text-ui", "text-body"), "text-body");
  assert.equal(cn("text-sm", "text-caption"), "text-caption");
});

test("two colours still merge to the last one", () => {
  assert.equal(cn("text-ui text-slate-500", "text-rose-700"), "text-ui text-rose-700");
});
