import test from "node:test";
import assert from "node:assert/strict";
import { countAlreadyImported, splitImportRange, togglImportKey } from "./togglImport.ts";

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

test("a multi-year period splits into consecutive windows that cover every day exactly once", () => {
  const windows = splitImportRange("2024-01-13", "2026-11-13", 92);
  assert.equal(windows[0].from, "2024-01-13");
  assert.equal(windows[windows.length - 1].to, "2026-11-13");
  for (let i = 0; i < windows.length; i++) {
    const days = (Date.parse(windows[i].to) - Date.parse(windows[i].from)) / 86_400_000 + 1;
    assert.ok(days >= 1 && days <= 92, `window ${i} is ${days} days`);
    if (i > 0) assert.equal(Date.parse(windows[i].from) - Date.parse(windows[i - 1].to), 86_400_000);
  }
});

test("a short period is one window, and a leap day is not lost", () => {
  assert.deepEqual(splitImportRange("2024-02-28", "2024-03-01"), [{ from: "2024-02-28", to: "2024-03-01" }]);
  assert.deepEqual(splitImportRange("2024-02-28", "2024-03-01", 2), [
    { from: "2024-02-28", to: "2024-02-29" },
    { from: "2024-03-01", to: "2024-03-01" },
  ]);
});

test("a reversed or invalid period gives no windows", () => {
  assert.deepEqual(splitImportRange("2026-02-01", "2026-01-01"), []);
  assert.deepEqual(splitImportRange("", "2026-01-01"), []);
});
