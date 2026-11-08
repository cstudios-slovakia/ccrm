#!/usr/bin/env node
/**
 * Collect changelog fragments into ONE new release section ("make a build").
 *
 *   node scripts/release/collect-changelog.mjs [--dry-run] [--date YYYY-MM-DD] [--allow-empty]
 *
 * Reads changelog.d/<YYYY-MM-DD>-<slug>.md (sorted by filename), bumps the patch
 * number in src/utils/version.ts (codename suffix kept), appends a
 * `### v<new> (<date>)` section to the active changelog (derived from VERSION:
 * 1.13.85-Nectarine -> 1.13-nectarine-changelog.md), deletes the consumed
 * fragments and prints the new version on stdout (last line).
 *
 * Line endings: version.ts and the changelog keep whatever they use (CRLF or LF).
 * Fragments may use either.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_RE = /(VERSION\s*=\s*")(\d+)\.(\d+)\.(\d+)(-[^"]*)?(")/;
export const FRAGMENT_NAME_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/i;

export function parseVersionSource(src) {
  const m = src.match(VERSION_RE);
  if (!m) throw new Error('no parsable `export const VERSION = "major.minor.patch-Codename"` in version.ts');
  return { major: +m[2], minor: +m[3], patch: +m[4], suffix: m[5] ?? "" };
}

export const formatVersion = (v) => `${v.major}.${v.minor}.${v.patch}${v.suffix}`;

/** Bump the patch number; rewrites only the literal, every other byte survives. */
export function bumpVersionSource(src) {
  const cur = parseVersionSource(src);
  const next = { ...cur, patch: cur.patch + 1 };
  return {
    source: src.replace(VERSION_RE, (_all, a, _M, _m, _p, _s, q) => `${a}${formatVersion(next)}${q}`),
    from: formatVersion(cur),
    to: formatVersion(next),
    next,
  };
}

/** 1.13.85-Nectarine -> 1.13-nectarine-changelog.md */
export function changelogFileFor(v) {
  const codename = v.suffix.replace(/^-/, "").toLowerCase();
  if (!codename) throw new Error("version has no codename suffix, cannot derive the changelog file");
  return `${v.major}.${v.minor}-${codename}-changelog.md`;
}

export const detectEol = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

export function listFragmentNames(names) {
  return names.filter((n) => FRAGMENT_NAME_RE.test(n)).sort();
}

/** Normalise a fragment to LF, trimmed; throws if it is not a bullet list. */
export function normaliseFragment(name, text) {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!body) throw new Error(`${name}: fragment is empty`);
  if (!body.startsWith("- ")) throw new Error(`${name}: must start with a bullet ("- **Title** (...): text")`);
  if (/^#{1,6}\s/m.test(body)) throw new Error(`${name}: headings are not allowed, the collector writes the "### v..." line`);
  return body;
}

export function renderSection(version, date, bodies, eol) {
  return [`### v${version} (${date})`, ...bodies.join("\n").split("\n")].join(eol);
}

/** Append a section after the last one (sections are ascending), keeping eol and one blank line between. */
export function appendSection(changelog, section, version, eol = detectEol(changelog)) {
  const heading = new RegExp(`^### v${version.replace(/\./g, "\\.")}(\\s|$)`, "m");
  if (heading.test(changelog)) throw new Error(`changelog already has a section for v${version}`);
  return changelog.replace(/\s+$/, "") + eol + eol + section + eol;
}

export function parseArgs(argv) {
  const o = { dryRun: false, allowEmpty: false, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--allow-empty") o.allowEmpty = true;
    else if (a === "--date") o.date = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (o.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(o.date ?? "")) throw new Error("--date needs YYYY-MM-DD");
  return o;
}

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole run against a repo root. Returns { version, from, file, section, fragments }. Writes unless dryRun. */
export function collect(root, opts) {
  const versionPath = path.join(root, "src", "utils", "version.ts");
  const dir = path.join(root, "changelog.d");
  const names = fs.existsSync(dir) ? listFragmentNames(fs.readdirSync(dir)) : [];
  if (names.length === 0 && !opts.allowEmpty) {
    throw new Error("no changelog fragments in changelog.d/ - nothing to release. Add one per change (see changelog.d/README.md) or pass --allow-empty.");
  }
  const bodies = names.map((n) => normaliseFragment(n, fs.readFileSync(path.join(dir, n), "utf8")));
  const verSrc = fs.readFileSync(versionPath, "utf8");
  const bumped = bumpVersionSource(verSrc);
  const file = changelogFileFor(bumped.next);
  const clPath = path.join(root, file);
  if (!fs.existsSync(clPath)) throw new Error(`active changelog ${file} does not exist`);
  const cl = fs.readFileSync(clPath, "utf8");
  const eol = detectEol(cl);
  const section = renderSection(bumped.to, opts.date ?? today(), bodies.length ? bodies : ["- Rebuild, no source changes."], eol);
  const newCl = appendSection(cl, section, bumped.to, eol);
  if (!opts.dryRun) {
    fs.writeFileSync(versionPath, bumped.source, "utf8");
    fs.writeFileSync(clPath, newCl, "utf8");
    for (const n of names) fs.unlinkSync(path.join(dir, n));
  }
  return { version: bumped.to, from: bumped.from, file, section, fragments: names };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const opts = parseArgs(process.argv.slice(2));
    const r = collect(root, opts);
    const tag = opts.dryRun ? "[dry run] " : "";
    console.error(`${tag}${r.from} -> ${r.version}; ${r.fragments.length} fragment(s) into ${r.file}`);
    if (opts.dryRun) console.error("\n" + r.section.replace(/\r\n/g, "\n") + "\n");
    console.log(r.version);
  } catch (e) {
    console.error(`collect-changelog: ${e.message}`);
    process.exit(1);
  }
}
