import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpdateNotesQuery,
  compareVersions,
  localizeUpdateNotes,
  splitListItems,
} from "./updateNotes.ts";

const row = (id: string, version: string, siteHandle: string, postDate: string) => ({
  id,
  version,
  siteHandle,
  postDate,
  title: `${version} ${siteHandle}`,
  contentMatrix: [],
});

test("localizeUpdateNotes keeps one row per version, in the reader's language", () => {
  const raw = [
    row("1", "1.11", "default", "2026-10-02"),
    row("1", "1.11", "en", "2026-10-02"),
    row("1", "1.11", "hu", "2026-10-02"),
    row("2", "1.10", "default", "2026-09-22"),
  ];
  assert.deepEqual(
    localizeUpdateNotes(raw, "en").map((e) => e.title),
    ["1.11 en", "1.10 default"], // 1.10 has no English row: falls back to default
  );
  assert.deepEqual(
    localizeUpdateNotes(raw, "sk").map((e) => e.title),
    ["1.11 default", "1.10 default"], // Slovak lives on the default site
  );
});

test("localizeUpdateNotes orders same-day releases by version", () => {
  const raw = [
    row("1", "1.11", "default", "2026-10-05"),
    row("2", "1.11.150", "default", "2026-10-05"),
    row("3", "1.11.143", "default", "2026-10-02"),
  ];
  assert.deepEqual(
    localizeUpdateNotes(raw, "sk").map((e) => e.version),
    ["1.11.150", "1.11", "1.11.143"],
  );
});

test("localizeUpdateNotes skips entries without a version", () => {
  assert.deepEqual(localizeUpdateNotes([row("1", "", "default", "2026-10-02")], "sk"), []);
  assert.deepEqual(localizeUpdateNotes(null as any, "sk"), []);
});

test("compareVersions is numeric per segment and ignores the codename", () => {
  assert.ok(compareVersions("1.11.150", "1.11.99") > 0);
  assert.ok(compareVersions("1.11.1", "1.11") > 0);
  assert.ok(compareVersions("1.10", "1.9.200") > 0);
  assert.equal(compareVersions("1.11.143-Lemon", "1.11.143"), 0);
});

test("splitListItems drops blanks and list markers", () => {
  assert.deepEqual(splitListItems("- First\n\n* Second\r\n3) Third\n  plain  "), [
    "First",
    "Second",
    "Third",
    "plain",
  ]);
  assert.deepEqual(splitListItems(null), []);
});

test("heading and change-list text comes from the block title", () => {
  const extended = buildUpdateNotesQuery(true);
  assert.match(extended, /heading_Entry { title headingLevel moduleTag }/);
  assert.match(extended, /changeList_Entry { title listType listItems }/);
  assert.ok(!extended.includes("headingText"), "headingText is not a field in Craft");
});

test("the legacy query never names the extended block types", () => {
  const legacy = buildUpdateNotesQuery(false);
  for (const type of ["heading_Entry", "gallery_Entry", "callout_Entry", "changeList_Entry"]) {
    assert.ok(!legacy.includes(type), type);
    assert.ok(buildUpdateNotesQuery(true).includes(type), type);
  }
});
