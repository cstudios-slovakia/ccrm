/**
 * Shared plumbing for the release-notes pipeline (docs/RELEASE-NOTES.md).
 *
 * Every script runs from the repository root it inspects — in the scheduled
 * run that is the detached `origin/main` worktree — and keeps its state in
 * RELEASE_NOTES_HOME (default `<repo>/.release-notes`, gitignored), which
 * outlives the worktree.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REPO = process.cwd();
export const HOME = path.resolve(process.env.RELEASE_NOTES_HOME ?? path.join(REPO, '.release-notes'));
export const STATE_FILE = path.join(HOME, 'state.json');
export const CURRENT_RUN_FILE = path.join(HOME, 'current-run.txt');

export const LANGS = ['sk', 'en', 'hu'];
/** App language → Craft site handle. Slovak is Craft's primary ("default") site. */
export const SITE_FOR_LANG = { sk: 'default', en: 'en', hu: 'hu' };

export const CRAFT_GRAPHQL_URL =
  process.env.CRAFT_GRAPHQL_URL ?? 'https://ccrm.softwaresolutions.sk/index.php?action=graphql/api';

/** Loads `RELEASE_NOTES_HOME/.env` (KEY=VALUE lines) without overriding the real environment. */
export function loadEnv() {
  const file = path.join(HOME, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export const git = (...args) =>
  execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trimEnd();

/** "1.11.143-Lemon" → { major: 1, minor: 11, patch: 143, codename: "Lemon", line: "1.11", short: "1.11.143" } */
export function parseVersion(full) {
  const m = String(full).trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([A-Za-z]+))?$/);
  if (!m) throw new Error(`Unrecognised version "${full}"`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  return { full: String(full).trim(), major, minor, patch, codename: m[4] ?? '', line: `${major}.${minor}`, short: `${major}.${minor}.${patch}` };
}

export const compareVersions = (a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch;

/** The app version (`src/utils/version.ts`) at a commit. */
export function versionAt(ref) {
  const src = git('show', `${ref}:src/utils/version.ts`);
  const m = src.match(/export const VERSION\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error(`No VERSION in src/utils/version.ts at ${ref}`);
  return parseVersion(m[1]);
}

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function writeState(state) {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

export async function craftQuery(query) {
  const res = await fetch(CRAFT_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Craft GraphQL answered HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Craft GraphQL: ${json.errors[0].message}`);
  return json.data;
}

/** Minimal `--flag value` / `--switch` parser. Positional arguments land in `_`. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

export const timestamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};
