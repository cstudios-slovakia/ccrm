#!/usr/bin/env node
/**
 * Step 1 of the release-notes pipeline: has `main` moved to a new version since
 * the last release we handled? Deterministic and cheap — the scheduled run only
 * starts an AI agent when this says so.
 *
 *   node scripts/release-notes/detect.mjs                  check HEAD (the origin/main worktree)
 *   node scripts/release-notes/detect.mjs --init           set the baseline to HEAD, write nothing else
 *   node scripts/release-notes/detect.mjs --init --baseline <sha>
 *   node scripts/release-notes/detect.mjs --force          ignore the give-up counter and Craft's existing entry
 *
 * Exit codes: 0 nothing to do · 10 release candidate, run dir prepared ·
 *             3 not initialised · 4 history problem · 5 gave up on this commit · 1 error
 *
 * Classification of the bump (the agent decides what is *significant*):
 *   major  the release line changed — 1.10.x → 1.11.x (new fruit codename).
 *          Craft entry version "1.11", a full feature article.
 *   patch  same line, higher build — 1.11.140 → 1.11.143.
 *          Craft entry version "1.11.143", published only if something user-visible changed.
 * New commits without a version bump are not a release: the baseline stays put
 * and they are picked up with the next bump.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CURRENT_RUN_FILE,
  HOME,
  REPO,
  compareVersions,
  craftQuery,
  git,
  parseArgs,
  readState,
  timestamp,
  versionAt,
  writeJson,
  writeState,
} from './lib.mjs';

const MAX_FAILURES = 3;
const args = parseArgs();
const say = (msg) => console.log(`[release-notes] ${msg}`);

const head = git('rev-parse', args.ref ?? 'HEAD');
const headVersion = versionAt(head);

if (args.init) {
  const baseline = git('rev-parse', typeof args.baseline === 'string' ? args.baseline : head);
  const v = versionAt(baseline);
  writeState({ lastSha: baseline, lastVersion: v.full, initialisedAt: new Date().toISOString(), failures: {}, history: [] });
  say(`Baseline set to ${baseline.slice(0, 9)} (${v.full}). Releases after it will be announced.`);
  process.exit(0);
}

const state = readState();
if (!state?.lastSha) {
  say(`Not initialised. Run: node scripts/release-notes/detect.mjs --init [--baseline <sha>]  (state: ${HOME})`);
  process.exit(3);
}

if (state.lastSha === head) {
  say(`Nothing new: main is still at ${head.slice(0, 9)} (${headVersion.full}).`);
  process.exit(0);
}

try {
  git('merge-base', '--is-ancestor', state.lastSha, head);
} catch {
  say(`The last handled commit ${state.lastSha.slice(0, 9)} is not an ancestor of ${head.slice(0, 9)} — was main rewritten? Re-baseline with --init --baseline <sha>.`);
  process.exit(4);
}

const lastVersion = versionAt(state.lastSha);
const order = compareVersions(headVersion, lastVersion);
if (order === 0) {
  const n = git('rev-list', '--count', `${state.lastSha}..${head}`);
  say(`${n} new commit(s) on main but no version bump (${headVersion.full}) — not a release yet, waiting.`);
  process.exit(0);
}
if (order < 0) {
  say(`main went backwards: ${lastVersion.full} → ${headVersion.full}. Re-baseline with --init.`);
  process.exit(4);
}

if (!args.force && (state.failures?.[head] ?? 0) >= MAX_FAILURES) {
  say(`Gave up on ${head.slice(0, 9)} after ${MAX_FAILURES} failed runs. Fix the cause, then run with --force (see .release-notes/runs/).`);
  process.exit(5);
}

const kind = headVersion.line !== lastVersion.line ? 'major' : 'patch';
const craftVersion = kind === 'major' ? headVersion.line : headVersion.short;

/* ---------------------------------------------------------------- Craft -- */

// The public schema only sees live entries, which is exactly what "already published" means.
let published = [];
try {
  const data = await craftQuery('{ entries(section: "updateNotes", site: "default") { id title enabled ... on news_Entry { version } } }');
  published = (data.entries ?? []).filter((e) => e.version);
} catch (err) {
  say(`Warning: could not read existing Craft entries (${err.message}). Continuing; the publisher updates an existing entry anyway.`);
}
const existing = published.find((e) => e.version === craftVersion);
if (existing?.enabled && !args.force) {
  say(`Craft already has a live "${craftVersion}" entry (#${existing.id} "${existing.title}"). Recording it as handled.`);
  writeState({
    ...state,
    lastSha: head,
    lastVersion: headVersion.full,
    history: [...(state.history ?? []), { at: new Date().toISOString(), sha: head, version: headVersion.full, outcome: 'already-published', craftVersion }],
  });
  process.exit(0);
}

/* -------------------------------------------------------------- Commits -- */

const range = `${state.lastSha}..${head}`;
const SEP = '\u001e';
const FS = '\u001f';
const raw = git('log', '--no-merges', '--date=short', `--format=${SEP}%H${FS}%ad${FS}%s${FS}%b${FS}`, '--name-only', range);
const commits = raw
  .split(SEP)
  .filter((chunk) => chunk.trim())
  .map((chunk) => {
    const [sha, date, subject, body, filesBlock] = chunk.split(FS);
    const files = (filesBlock ?? '').split('\n').map((f) => f.trim()).filter(Boolean);
    const conv = subject.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.*)$/);
    const type = conv?.[1]?.toLowerCase() ?? '';
    const onlyInvisible =
      files.length > 0 &&
      files.every((f) =>
        /^(api|public\/api|src-php|scripts|docs|tests|\.agents|\.github|mcp-server|dist|vendor)\//.test(f) ||
        /\.(md|php|sql|yml|yaml|json|lock)$/.test(f) ||
        /(^|\/)[^/]*\.test\.ts$/.test(f),
      );
    return {
      sha,
      short: sha.slice(0, 9),
      date,
      subject,
      body: body.trim(),
      type,
      scope: conv?.[2] ?? '',
      versionTag: subject.match(/\(v?(\d+\.\d+\.\d+)(?:-\w+)?\)\s*$/)?.[1] ?? null,
      files,
      hint:
        ['feat', 'fix', 'perf'].includes(type)
          ? onlyInvisible ? 'check: no frontend file touched' : 'likely user-visible'
          : ['chore', 'build', 'docs', 'test', 'tests', 'ci', 'refactor', 'style', 'merge'].includes(type)
            ? 'likely invisible'
            : 'unknown — read the diff',
    };
  });

const merges = git('log', '--merges', '--format=%h %s', range).split('\n').filter(Boolean);

/* ------------------------------------------------------------ Changelog -- */

/** Sections "### v1.11.143-Lemon (2026-10-02)" with lastVersion < v <= headVersion, from every *-changelog.md. */
const vkey = (s) => {
  const [major, minor, patch] = s.split('.').map(Number);
  return { major, minor, patch };
};
const changelog = [];
for (const file of fs.readdirSync(REPO).filter((f) => /^\d+\.\d+-[a-z]+-changelog\.md$/i.test(f))) {
  const lines = fs.readFileSync(path.join(REPO, file), 'utf8').split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = line.match(/^#{2,4}\s+v?(\d+\.\d+\.\d+)/);
    if (m) {
      const v = vkey(m[1]);
      const inRange = compareVersions(v, lastVersion) > 0 && compareVersions(v, headVersion) <= 0;
      current = inRange ? { file, version: m[1], heading: line.replace(/^#+\s*/, ''), text: [] } : null;
      if (current) changelog.push(current);
      continue;
    }
    if (/^#{1,2}\s/.test(line)) current = null;
    else if (current) current.text.push(line);
  }
}
for (const c of changelog) c.text = c.text.join('\n').trim();
changelog.sort((a, b) => compareVersions(vkey(a.version), vkey(b.version)));

/* -------------------------------------------------------------- Run dir -- */

const runDir = path.join(HOME, 'runs', `${timestamp()}-${craftVersion}`);
fs.mkdirSync(path.join(runDir, 'shots'), { recursive: true });

const context = {
  kind,
  craftVersion,
  fromVersion: lastVersion.full,
  toVersion: headVersion.full,
  codename: headVersion.codename,
  baseSha: state.lastSha,
  headSha: head,
  range,
  runDir,
  existingCraftEntry: existing ? { id: existing.id, title: existing.title, enabled: existing.enabled } : null,
  publishedVersions: published.map((e) => e.version),
  merges,
  changelog,
  commits,
};
writeJson(path.join(runDir, 'context.json'), context);

const md = [
  `# Release candidate ${craftVersion} (${kind})`,
  '',
  `- From **${lastVersion.full}** (\`${state.lastSha.slice(0, 9)}\`) to **${headVersion.full}** (\`${head.slice(0, 9)}\`), range \`${range}\``,
  `- ${commits.length} commits, ${merges.length} merges, ${changelog.length} changelog sections`,
  `- Craft entry version to publish: \`${craftVersion}\`${existing ? ` (an entry #${existing.id} already exists, disabled — it will be overwritten)` : ''}`,
  `- Run directory: \`${runDir}\``,
  '',
  '## Changelog sections in range (the authors\' own summary — start here)',
  '',
  ...changelog.flatMap((c) => [`### ${c.heading}  _(${c.file})_`, '', c.text, '']),
  '## Merges',
  '',
  ...merges.map((m) => `- ${m}`),
  '',
  '## Commits (oldest last)',
  '',
  ...commits.map((c) => `- \`${c.short}\` ${c.date} **${c.subject}** — _${c.hint}_\n  files: ${c.files.slice(0, 12).join(', ')}${c.files.length > 12 ? ` … +${c.files.length - 12}` : ''}`),
  '',
].join('\n');
fs.writeFileSync(path.join(runDir, 'context.md'), md);
fs.writeFileSync(CURRENT_RUN_FILE, runDir);

say(`Release candidate: ${lastVersion.full} → ${headVersion.full} (${kind}, Craft "${craftVersion}"), ${commits.length} commits.`);
console.log(`RUN_DIR=${runDir}`);
process.exit(10);
