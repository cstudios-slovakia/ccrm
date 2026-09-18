#!/usr/bin/env node
/**
 * Scoped, CPU-limited entry point for the QA audit.
 *
 * Two problems this solves, both measured on this machine (12 logical cores):
 *
 *   1. A full audit is ~27 tests across 3 parallel Chromium instances. Sampled
 *      live, it ran 12 `chrome-headless-shell` processes at 63% of the whole
 *      machine, plus one `ffmpeg` per worker recording video that passing tests
 *      then threw away — 87% of the machine in total. The desktop is unusable
 *      while that runs.
 *   2. Nothing about editing one module needs the other eleven re-crawled, yet
 *      `npm run test:qa` re-crawled all of them every time.
 *
 * So: by default this runs only the tests covering what git says changed, at
 * below-normal OS priority, with fewer workers. A full scan stays available and
 * is now something you ask for on purpose (`npm run test:qa:full`).
 *
 *   node scripts/qa/run-qa.mjs                      # only what changed
 *   node scripts/qa/run-qa.mjs --full               # everything
 *   node scripts/qa/run-qa.mjs --module Warehouse   # one module
 *   node scripts/qa/run-qa.mjs --since main         # diff against another ref
 *   node scripts/qa/run-qa.mjs --files src/components/EmailView.tsx
 *
 * Only one run per machine. Several editor sessions share this machine and
 * each of them follows the same "test when finished" rule, so runs used to
 * pile up: two or three at once, each a Chromium per worker plus a dev
 * server, on a 16 GB machine already carrying the editors, Docker and WSL.
 * The result was 0.2 GB free, runs that hung for half an hour and reported
 * nothing, and "defects" that vanished on a quiet machine. So before a
 * browser starts, a run takes a machine-wide lock, waits for enough free
 * memory and for its port, and sizes its worker count to what is free
 * (`admission.mjs`; the playwright global setup takes the same lock, so
 * `npx playwright test` cannot slip past it either).
 *
 * `--files` answers "what would editing these run?" without consulting git, so
 * the mapping below can be checked directly. Anything after `--` is forwarded
 * to playwright untouched — `-- --list` prints the selection without opening a
 * browser.
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCK_FILE, admitRun, freeMb, killTree, releaseRunLock, sweepOrphans } from './admission.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------------------------------------------ scope */

/**
 * "The frame every view is drawn in": navigation and header. A change there
 * cannot be attributed to one module, but it still does not justify
 * re-crawling all twelve — these are a handful of cheap tests that catch a
 * broken frame. Ask for `--full` when you want more than that.
 */
const SHELL = ['Shell navigation', 'recorded flow:'];

/**
 * Source file -> the test titles that cover it.
 *
 * Titles are matched as a regex against playwright's full title (describe +
 * test), so a module name reaches both `Clients Register (#clients)` in the
 * crawler and `Clients Register stays legible in dark mode`. Titles naming a
 * suite this checkout does not have simply match nothing.
 *
 * First matching rule wins, so the specific entries come before the general
 * ones.
 */
const RULES = [
  // --- one module each ---------------------------------------------------
  [/^src\/components\/DynamicDashboardView\./, ['Dashboard', 'Overview']],
  [/^src\/components\/TaskDashboardView\./, ['Dashboard', 'Tasks']],
  [/^src\/components\/Dashboard\./, ['Dashboard']],
  [/^src\/components\/LeadsDatagrid\./, ['Leads / Pipeline']],
  [/^src\/components\/ClientsView\./, ['Clients Register']],
  [/^src\/components\/ProjectSettings\./, ['Projects', 'Project type attributes']],
  /* The pinned project journeys are named after what they walk ("Project
     files", "Project rating"), none of which the bare word "Projects" matches
     as a regex — so they have to be listed, or editing the views they cover
     would quietly run only the crawler. */
  [/^src\/components\/(ProjectsView|ProjectDetailsView)\./, ['Projects', 'Project rating', 'Project files', 'Project tasks']],
  [/^src\/components\/WarehouseView\./, ['Warehouse']],
  [/^src\/components\/InvoicingView\./, ['Invoices & Price Offers', 'Financial Management']],
  [/^src\/components\/FinancialManagementView\./, ['Financial Management']],
  [/^src\/components\/MeetingRoomView\./, ['Meeting Room']],
  [/^src\/components\/(FilesView|FilePreviewPane)\./, ['Files Manager', 'Documents Registry']],
  [/^src\/utils\/projectDocuments\./, ['Files Manager', 'Documents Registry']],
  /* The star rating's rules are shared by both lists that offer it. */
  [/^src\/utils\/rating\./, ['Leads / Pipeline', 'Projects', 'Project rating']],
  [/^src\/components\/EmailView\./, ['Email Hub']],
  [/^src\/components\/(AutomationView|BlockEditor)\./, ['Automation']],
  [/^src\/components\/UpdateNotes(View|Modal)\./, ['Update Notes']],
  [/^src\/components\/PersonalSettingsView\./, ['Personal Settings']],
  [/^src\/components\/(ThemeSettings|LightRays)\./, ['Personal Settings', 'Dark mode']],
  [/^src\/components\/License(Banner|Settings)\./, ['Licensing', 'System Settings']],
  [/^src\/components\/SettingsView\./, ['System Settings']],
  [/^src\/components\/(SocialMediaView|RagAiView|UnifiedEntryView)\./, ['Shell navigation']],

  // --- the frame ---------------------------------------------------------
  [/^src\/(App|main)\.tsx$/, SHELL],
  [/^src\/(App|index)\.css$/, [...SHELL, 'Dark mode']],
  [/^src\/components\/(Sidebar|Header|StartMenu|LoginView|InstallerWizard|ErrorBoundary)\./, SHELL],
  [/^src\/components\/ui\//, SHELL],
  [/^src\/(utils|types)\//, SHELL],

  // --- pinned journeys ---------------------------------------------------
  [/^tests\/recordings\//, ['recorded flow:']],
];

/**
 * Editing the shared harness invalidates the reasoning behind any scoped run,
 * so a change here forces the full suite rather than a subset chosen by the
 * very code that just changed. This is deliberately narrower than "anything
 * under tests/e2e/": the standalone journey specs (`projectRating.spec.ts`,
 * `financialTrendShared.spec.ts`, ...) are ordinary feature tests, not
 * harness - adding one when a feature ships must not cost a 30-minute full
 * run. Only the shared plumbing and the suite-wide crawlers do that.
 */
const FORCES_FULL =
  /^(playwright\.config\.ts$|scripts\/qa\/|tests\/e2e\/(helpers\/|globalSetup\.ts$|globalTeardown\.ts$|crawler\.spec\.ts$|darkmode\.spec\.ts$|navigation\.spec\.ts$))/;

/**
 * A standalone journey spec (added or edited) isn't in RULES - that table
 * maps *source* files to titles, and a spec file is the test, not the thing
 * under test. So pull its own titles straight out of its `test(...)` /
 * `test.describe(...)` calls and scope to just those, instead of falling
 * through to a full run.
 */
function titlesFromSpecFile(relPath) {
  let text;
  try {
    text = readFileSync(path.join(ROOT, relPath), 'utf8');
  } catch {
    return [];
  }
  const titles = new Set();
  const re = /\b(?:test|test\.describe|test\.step)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(text))) {
    const title = m[2].replace(/\\(.)/g, '$1').trim();
    if (title.length > 2) titles.add(title);
  }
  return [...titles];
}

/* ------------------------------------------------------------------- args */

const argv = process.argv.slice(2);
const passThroughAt = argv.indexOf('--');
const passThrough = passThroughAt === -1 ? [] : argv.slice(passThroughAt + 1);
const own = passThroughAt === -1 ? argv : argv.slice(0, passThroughAt);

const full = own.includes('--full');
const sinceAt = own.indexOf('--since');
const since = sinceAt === -1 ? null : own[sinceAt + 1];
/**
 * Values for `--module` and `--files` run until the next flag, because module
 * names contain spaces (`Clients Register`, `Leads / Pipeline`) and quoting
 * them through npm is a trap: `npm run test:qa:module Leads / Pipeline` arrives
 * as three separate arguments.
 */
function valuesAfter(flag) {
  const at = own.indexOf(flag);
  if (at === -1) return null;
  const end = own.findIndex((a, i) => i > at && a.startsWith('--'));
  return own.slice(at + 1, end === -1 ? undefined : end);
}

const explicitModule = valuesAfter('--module')?.join(' ').trim() || null;
const explicitFiles =
  valuesAfter('--files')
    ?.flatMap((a) => a.split(','))
    .map((f) => f.trim().replace(/\\/g, '/'))
    .filter(Boolean) ?? null;

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/**
 * The base to diff against. Work on this repo lands as direct commits on the
 * active branch, so "what changed" means everything not yet pushed plus the
 * working tree — not just uncommitted edits.
 */
function resolveBase() {
  if (since) return since;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])?.trim();
  const candidates = [branch && `origin/${branch}`, 'origin/dev', 'origin/main'].filter(Boolean);
  for (const ref of candidates) {
    if (git(['rev-parse', '--verify', '--quiet', ref])) return ref;
  }
  return null;
}

function changedFiles() {
  const files = new Set();
  const add = (out) =>
    out
      ?.split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((f) => files.add(f));

  add(git(['diff', '--name-only', 'HEAD']));
  add(git(['ls-files', '--others', '--exclude-standard']));

  const base = resolveBase();
  if (base) add(git(['diff', '--name-only', `${base}...HEAD`]));

  return { files: [...files], base };
}

/* ------------------------------------------------------------------ select */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function selectTitles() {
  if (full) return { titles: null, why: 'full scan requested' };
  if (explicitModule) return { titles: [explicitModule], why: `module: ${explicitModule}` };

  const { files, base } = explicitFiles
    ? { files: explicitFiles, base: null }
    : changedFiles();
  const source = explicitFiles ? 'given files' : `vs ${base ?? 'HEAD'}`;
  if (files.length === 0) return { titles: [], why: `no changes ${source}` };

  const forced = files.filter((f) => FORCES_FULL.test(f));
  if (forced.length > 0) {
    const extra = forced.length > 1 ? ` +${forced.length - 1}` : '';
    return { titles: null, why: `the QA harness itself changed (${forced[0]}${extra})` };
  }

  const titles = new Set();
  const matched = [];
  for (const file of files) {
    const rule = RULES.find(([pattern]) => pattern.test(file));
    if (rule) {
      matched.push(file);
      rule[1].forEach((t) => titles.add(t));
      continue;
    }
    if (/^tests\/e2e\/.*\.spec\.ts$/.test(file)) {
      const own = titlesFromSpecFile(file);
      if (own.length > 0) {
        matched.push(file);
        own.forEach((t) => titles.add(t));
      }
    }
  }

  return {
    titles: [...titles],
    why: `${matched.length} of ${files.length} changed file(s) map to tests (${source})`,
    files: matched,
  };
}

/* ---------------------------------------------------------------- priority */

/**
 * Two different limits, because the complaint had two halves.
 *
 * Below-normal priority fixes *responsiveness*: a run may still be using every
 * spare cycle, but it yields instantly to whatever is being typed into. It does
 * not lower the total, and measured on this machine two workers still reached
 * ~50% of twelve cores.
 *
 * Affinity fixes the *ceiling*: restricted to N cores, the browsers cannot
 * exceed N/total of the machine no matter what they do. That is the hard cap —
 * a run takes longer in exchange for leaving the rest of the machine alone.
 *
 * QA_MAX_CORES=0 removes the cap; the default is half the machine.
 */
const BELOW_NORMAL = 10;
const TOTAL_CORES = os.cpus().length;
const maxCores = Number(process.env.QA_MAX_CORES ?? Math.max(2, Math.ceil(TOTAL_CORES / 2)));
const capped = maxCores > 0 && maxCores < TOTAL_CORES;
/* Low-order bits: the browsers share the first N cores and leave the rest free. */
const affinityMask = capped ? (1n << BigInt(maxCores)) - 1n : 0n;

function demote(pid) {
  try {
    os.setPriority(pid, BELOW_NORMAL);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-applies both limits to the browsers playwright spawns. Priority is
 * inherited at creation, but affinity is not, and renderers come and go
 * throughout a run — so this sweeps rather than setting it once.
 */
function enforceLimits() {
  if (process.platform !== 'win32') return () => {};

  const names = "'chrome-headless-shell','ffmpeg-win64','chrome'";
  const setAffinity = capped ? `$p.ProcessorAffinity = [IntPtr]${affinityMask}; ` : '';
  const script =
    `Get-Process -Name ${names} -ErrorAction SilentlyContinue | ForEach-Object { ` +
    `$p = $_; try { ${setAffinity}$p.PriorityClass = 'BelowNormal' } catch {} }`;

  const sweep = () => {
    /* Detached and unwatched: enforcing a limit must never stall the run or
       leak a handle if PowerShell is slow to start. */
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true,
    });
    ps.on('error', () => {});
    ps.unref();
  };

  const timer = setInterval(sweep, 5000);
  timer.unref();
  sweep();
  return () => clearInterval(timer);
}

const QA_PORT = process.env.QA_PORT ?? '5273';

/* -------------------------------------------------------------------- run */

const { titles, why, files } = selectTitles();

const rule = '─'.repeat(72);
const scope = titles === null ? 'FULL SUITE' : titles.length === 0 ? 'nothing to test' : titles.join(', ');

console.log(`\n${rule}`);
console.log('CCRM QA — scoped run');
console.log(rule);
console.log(`Scope:    ${scope}`);
console.log(`Reason:   ${why}`);
if (files?.length) {
  const shown = files.slice(0, 8).join(', ');
  console.log(`Changed:  ${shown}${files.length > 8 ? ` +${files.length - 8} more` : ''}`);
}

if (titles !== null && titles.length === 0) {
  console.log(`${rule}\n`);
  console.log('Nothing changed that this suite covers, so no browser was started.');
  console.log('Run a full audit on purpose with:  npm run test:qa:full\n');
  process.exit(0);
}

/* `-- --list` opens no browser, so it needs no lock and no memory. */
const listOnly = passThrough.includes('--list');
if (!listOnly) {
  try {
    await admitRun({
      scope: titles === null ? 'full suite' : `${titles.length} test title(s)`,
      port: QA_PORT,
      checkPort: process.env.QA_REUSE_SERVER !== '1',
    });
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(2);
  }
}

/* One worker is one Chromium instance, ~0.8 GB with its renderers. Two only
   when the machine can afford it: below 4 GB free the second worker buys a
   little wall-clock and costs the memory the first one needed. Three
   saturated a 12-core machine, which is why the ceiling is two. */
const free = freeMb();
const workers = Number(
  process.env.QA_WORKERS ?? (free >= 4 * 1024 ? Math.max(1, Math.min(2, Math.floor(TOTAL_CORES / 4))) : 1),
);
/* A scoped run is a few tests; a full one is the whole ladder. Either way a
   run still going past this is starved, not thorough. */
const globalTimeoutMs = Number(process.env.QA_GLOBAL_TIMEOUT_MS ?? (titles === null ? 45 : 15) * 60 * 1000);

const cpuCap = capped ? `${maxCores}/${TOTAL_CORES} cores` : 'uncapped';
console.log(`Workers:  ${workers}   CPU: ${cpuCap}, below-normal priority   Video: ${process.env.QA_VIDEO === '1' ? 'on' : 'off'}`);
console.log(`Machine:  ${(free / 1024).toFixed(1)} GB RAM free   Run limit: ${Math.round(globalTimeoutMs / 60000)} min   Lock: ${LOCK_FILE}`);
console.log(`${rule}\n`);

/* Invoking playwright's CLI directly rather than through `npx`: it skips an npm
   process and a shell, and — the part that matters here — makes the browsers
   direct descendants of a process whose priority we have already lowered. */
const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const args = [cli, 'test', `--workers=${workers}`];
if (titles !== null) {
  args.push(`--grep=${titles.map(escapeRe).join('|')}`);
  /* A scoped selection can legitimately match nothing — a title that only
     exists in another checkout's suite, or a module this branch has not grown
     yet. "No tests ran" is the correct outcome there, not a failed run. A full
     scan keeps the default, where an empty suite really is a problem. */
  args.push('--pass-with-no-tests');
}
args.push(...passThrough);

const child = spawn(process.execPath, args, {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    QA_WORKERS: String(workers),
    QA_SUITE: titles === null ? 'full' : 'partial',
    QA_GLOBAL_TIMEOUT_MS: String(globalTimeoutMs),
    /* Tells the playwright global setup that its parent already holds the
       machine lock, so it does not queue behind this very process. */
    QA_LOCK_OWNER: listOnly ? '' : String(process.pid),
  },
});

demote(child.pid);
const stopSweep = enforceLimits();

/* Whatever ends this process, the lock goes with it — and so does the whole
   playwright tree, so a Ctrl+C, a harness timeout or a crashed stdout pipe no
   longer leaves sixteen browser processes and a dev server behind. */
process.on('exit', () => {
  if (child.exitCode === null && child.signalCode === null) killTree(child.pid);
  releaseRunLock();
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    stopSweep();
    killTree(child.pid);
    sweepOrphans(QA_PORT);
    process.exit(130);
  });
}

child.on('exit', (code, signal) => {
  stopSweep();
  sweepOrphans(QA_PORT);
  if (titles !== null && code === 0) {
    console.log('\nThis was a scoped run — only the tests listed above were executed.');
    console.log('For everything:  npm run test:qa:full\n');
  }
  process.exit(signal ? 1 : (code ?? 1));
});
