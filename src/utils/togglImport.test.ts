import test from "node:test";
import assert from "node:assert/strict";
import { countAlreadyImported, togglImportKey } from "./togglImport.ts";

test("the import key is source toggl plus the Toggl id, stable across calls", () => {
  const a = togglImportKey(48291);
  const b = togglImportKey("48291");
  assert.deepEqual(a, { source: "toggl", externalId: "48291" });
  assert.deepEqual(a, b);
});

test("already-imported ids are counted once, and a new id is not", () => {
  const existing = new Set(["10", "20"]);
  assert.equal(countAlreadyImported(["10", "10", "20", "30"], existing), 2);
  assert.equal(countAlreadyImported(["30", "31"], existing), 0);
  assert.equal(togglImportKey("30").source, "toggl");
});
