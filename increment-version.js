import fs from "fs";
import path from "path";

/**
 * Bump the patch digit in src/utils/version.ts.
 *
 * Two things this deliberately does NOT do, because both used to bite:
 *
 *  1. It never rewrites the whole file. The old version emitted a single
 *     `export const VERSION = "…"` line, which silently deleted the
 *     `VERSION_CODENAME` export next to it — a named import RagAiView.tsx
 *     relies on, so the next `tsc -b` failed on an unrelated file.
 *  2. It never "resets" on a version it cannot parse. Releases carry a codename
 *     suffix ("1.8.34-Imbe"), which the old numeric split could not read, so it
 *     fell through to a fallback that overwrote a real version with "1.1.0".
 *     An unparseable version is now a loud failure with a non-zero exit.
 */
const versionFilePath = path.join(process.cwd(), "src", "utils", "version.ts");

/** `1.8.34-Imbe` -> major/minor/patch plus the untouched `-Imbe` suffix. */
const VERSION_RE = /(VERSION\s*=\s*")(\d+)\.(\d+)\.(\d+)(-[^"]*)?(")/;

function fail(message) {
  console.error(`Failed to auto-increment version: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(versionFilePath)) {
  fail(`${versionFilePath} does not exist — refusing to create one from scratch.`);
}

const fileContent = fs.readFileSync(versionFilePath, "utf8");
const match = fileContent.match(VERSION_RE);

if (!match) {
  const found = fileContent.match(/VERSION\s*=\s*"([^"]*)"/);
  fail(
    found
      ? `cannot parse version "${found[1]}" (expected major.minor.patch with an optional -Codename suffix).`
      : "no `export const VERSION = \"…\"` found in the file.",
  );
}

const [, prefix, major, minor, patch, suffix = "", quote] = match;
const currentVersion = `${major}.${minor}.${patch}${suffix}`;
const nextVersion = `${major}.${minor}.${Number(patch) + 1}${suffix}`;

// Replace only the version literal; every other line survives verbatim.
fs.writeFileSync(
  versionFilePath,
  fileContent.replace(VERSION_RE, `${prefix}${nextVersion}${quote}`),
  "utf8",
);
console.log(`Auto-incremented version: ${currentVersion} -> ${nextVersion}`);
