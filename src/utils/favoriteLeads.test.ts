import { test } from "node:test";
import assert from "node:assert/strict";
import { FAVORITES_GROUP, pinFavoriteLeads } from "./favoriteLeads.ts";

const groups = () => [
  { state: "New", leads: [{ id: "a" }, { id: "b" }] },
  { state: "Won", leads: [{ id: "c" }] },
];

test("favorites move into a first group and leave their own", () => {
  const out = pinFavoriteLeads(groups(), (id) => id === "b" || id === "c", false);
  assert.equal(out[0].state, FAVORITES_GROUP);
  assert.deepEqual(out[0].leads.map((l) => l.id), ["b", "c"]);
  assert.deepEqual(out[1].leads.map((l) => l.id), ["a"]);
  assert.deepEqual(out[2].leads, []);
});

test("a lead is never in two groups", () => {
  const out = pinFavoriteLeads(groups(), () => true, false);
  const all = out.flatMap((g) => g.leads.map((l) => l.id));
  assert.equal(all.length, new Set(all).size);
});

test("dropEmpty removes groups the move emptied, but keeps untouched ones", () => {
  const out = pinFavoriteLeads(groups(), (id) => id === "c", true);
  assert.deepEqual(out.map((g) => g.state), [FAVORITES_GROUP, "New"]);
});

test("without favorites the groups come back untouched", () => {
  const input = groups();
  assert.equal(pinFavoriteLeads(input, () => false, true), input);
});
