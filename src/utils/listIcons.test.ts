import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isKnownListIcon,
  listIconFor,
  listIconKey,
  normalizeListIconMap,
  renameListIcon,
  setListIcon,
} from "./listIcons.ts";
import { LIST_ICON_GROUPS } from "./listIconCatalog.generated.ts";

test("names are matched without case or surrounding spaces; category ids are kept as they are", () => {
  assert.equal(listIconKey("leadSources", "  Web .SK - CP "), "web .sk - cp");
  assert.equal(listIconKey("divisions", "Stavba"), "stavba");
  assert.equal(listIconKey("offerCategories", "oc-AB12"), "oc-AB12");
  assert.equal(listIconKey("financialCategories", " fc-1 "), "fc-1");
});

test("setListIcon sets, replaces and removes without touching other lists", () => {
  let map = setListIcon({}, "leadSources", "web .sk - CP", "flag-slovakia");
  map = setListIcon(map, "divisions", "Stavba", "hammer");
  assert.equal(listIconFor(map, "leadSources", "WEB .SK - CP"), "flag-slovakia");
  map = setListIcon(map, "leadSources", "web .sk - cp", "flag-hungary");
  assert.equal(listIconFor(map, "leadSources", "web .sk - cp"), "flag-hungary");
  map = setListIcon(map, "leadSources", "web .sk - cp", null);
  assert.equal(listIconFor(map, "leadSources", "web .sk - cp"), null);
  assert.equal(listIconFor(map, "divisions", "stavba"), "hammer");
});

test("setListIcon returns the same object when nothing changes", () => {
  const map = setListIcon({}, "leadSources", "a", "star");
  assert.equal(setListIcon(map, "leadSources", "A", "star"), map);
  assert.equal(setListIcon(map, "leadSources", "b", null), map);
  assert.equal(setListIcon(map, "leadSources", "  ", "star"), map);
});

test("a rename carries the icon to the new name", () => {
  const map = setListIcon({}, "leadCategories", "Okná", "window");
  const renamed = renameListIcon(map, "leadCategories", "Okná", "Okná a dvere");
  assert.equal(listIconFor(renamed, "leadCategories", "okná a dvere"), "window");
  assert.equal(listIconFor(renamed, "leadCategories", "okná"), null);
  assert.equal(renameListIcon(map, "leadCategories", "Iné", "Ostatné"), map);
});

test("an icon id the sprite does not know reads as no icon", () => {
  const map = normalizeListIconMap({ leadSources: { x: "no-such-icon", y: "star" } });
  assert.equal(listIconFor(map, "leadSources", "x"), null);
  assert.equal(listIconFor(map, "leadSources", "y"), "star");
});

test("normalizeListIconMap drops unknown kinds and junk", () => {
  assert.deepEqual(normalizeListIconMap(null), {});
  assert.deepEqual(normalizeListIconMap([]), {});
  assert.deepEqual(
    normalizeListIconMap({ leadSources: { a: "star", b: 3, c: "" }, bogus: { a: "star" }, divisions: "x" }),
    { leadSources: { a: "star" } },
  );
});

test("the catalogue offers both web flags and no faces", () => {
  assert.ok(isKnownListIcon("flag-slovakia"));
  assert.ok(isKnownListIcon("flag-hungary"));
  const all = LIST_ICON_GROUPS.flatMap((g) => [...g.icons]);
  assert.equal(new Set(all).size, all.length, "ids are unique");
  assert.ok(!all.some((id) => /face/.test(id)), "no faces");
});
