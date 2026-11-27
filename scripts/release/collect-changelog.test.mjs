import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  bumpVersionSource, changelogFileFor, parseVersionSource, normaliseFragment,
  listFragmentNames, appendSection, renderSection, parseArgs, collect,
} from "./collect-changelog.mjs";

const VER = 'export const VERSION = "1.13.85-Nectarine";\r\nexport const VERSION_CODENAME = VERSION.split("-")[1];\r\n';

test("bump keeps codename and every other byte", () => {
  const b = bumpVersionSource(VER);
  assert.equal(b.to, "1.13.86-Nectarine");
  assert.equal(b.source, VER.replace("85", "86"));
});

test("unparsable version throws", () => {
  assert.throws(() => bumpVersionSource('export const VERSION = "dev";'));
});

test("changelog file derived from version", () => {
  assert.equal(changelogFileFor(parseVersionSource(VER)), "1.13-nectarine-changelog.md");
});

test("fragment names: sorted, README and junk ignored", () => {
  assert.deepEqual(
    listFragmentNames(["README.md", "2026-11-08-b.md", "2026-11-07-z.md", "notes.txt", "x.md"]),
    ["2026-11-07-z.md", "2026-11-08-b.md"],
  );
});

test("fragment validation", () => {
  assert.equal(normaliseFragment("a", "﻿- **A**: x\r\n- **B**: y\r\n"), "- **A**: x\n- **B**: y");
  assert.throws(() => normaliseFragment("a", "  "));
  assert.throws(() => normaliseFragment("a", "text"));
  assert.throws(() => normaliseFragment("a", "- ok\n### v1.0.0"));
});

test("append keeps CRLF, one blank line, final newline", () => {
  const cl = "# T\r\n\r\n### v1.13.85-Nectarine (2026-11-07)\r\n- a\r\n";
  const sec = renderSection("1.13.86-Nectarine", "2026-11-08", ["- b\n- c"], "\r\n");
  const out = appendSection(cl, sec, "1.13.86-Nectarine");
  assert.equal(out, cl + "\r\n### v1.13.86-Nectarine (2026-11-08)\r\n- b\r\n- c\r\n");
  assert.ok(!/[^\r]\n/.test(out));
});

test("append keeps LF and rejects duplicate version", () => {
  const cl = "### v1.0.1-X (d)\n- a\n\n\n";
  const out = appendSection(cl, "### v1.0.2-X (e)\n- b", "1.0.2-X");
  assert.equal(out, "### v1.0.1-X (d)\n- a\n\n### v1.0.2-X (e)\n- b\n");
  assert.throws(() => appendSection(out, "x", "1.0.2-X"));
});

test("args", () => {
  assert.deepEqual(parseArgs(["--dry-run", "--date", "2026-01-02"]), { dryRun: true, allowEmpty: false, date: "2026-01-02" });
  assert.throws(() => parseArgs(["--date", "tomorrow"]));
  assert.throws(() => parseArgs(["--nope"]));
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-"));
  fs.mkdirSync(path.join(root, "src", "utils"), { recursive: true });
  fs.mkdirSync(path.join(root, "changelog.d"));
  fs.writeFileSync(path.join(root, "src/utils/version.ts"), VER);
  fs.writeFileSync(path.join(root, "1.13-nectarine-changelog.md"), "# C\r\n\r\n### v1.13.85-Nectarine (2026-11-07)\r\n- a\r\n");
  return root;
}

test("collect: dry run writes nothing; real run bumps, appends, deletes", () => {
  const root = fixture();
  const d = path.join(root, "changelog.d");
  fs.writeFileSync(path.join(d, "README.md"), "docs");
  fs.writeFileSync(path.join(d, "2026-11-08-b.md"), "- **B** (`b.ts`): second\n");
  fs.writeFileSync(path.join(d, "2026-11-08-a.md"), "- **A** (`a.ts`): first\r\n");
  const dry = collect(root, { dryRun: true, date: "2026-11-08" });
  assert.equal(dry.version, "1.13.86-Nectarine");
  assert.equal(fs.readFileSync(path.join(root, "src/utils/version.ts"), "utf8"), VER);
  assert.equal(fs.readdirSync(d).length, 3);
  const r = collect(root, { date: "2026-11-08" });
  assert.deepEqual(r.fragments, ["2026-11-08-a.md", "2026-11-08-b.md"]);
  assert.equal(fs.readFileSync(path.join(root, "src/utils/version.ts"), "utf8"), VER.replace("85", "86"));
  assert.equal(
    fs.readFileSync(path.join(root, "1.13-nectarine-changelog.md"), "utf8"),
    "# C\r\n\r\n### v1.13.85-Nectarine (2026-11-07)\r\n- a\r\n\r\n### v1.13.86-Nectarine (2026-11-08)\r\n- **A** (`a.ts`): first\r\n- **B** (`b.ts`): second\r\n",
  );
  assert.deepEqual(fs.readdirSync(d), ["README.md"]);
  fs.rmSync(root, { recursive: true });
});

test("collect: no fragments fails unless --allow-empty", () => {
  const root = fixture();
  assert.throws(() => collect(root, {}), /no changelog fragments/);
  assert.equal(collect(root, { allowEmpty: true, date: "2026-11-08" }).version, "1.13.86-Nectarine");
  fs.rmSync(root, { recursive: true });
});
