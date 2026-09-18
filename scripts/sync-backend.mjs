#!/usr/bin/env node
/**
 * Mirror the backend PHP in `public/` onto its copy in the repo root.
 *
 * WHY THIS EXISTS
 * ---------------
 * The repo root IS the docroot on the production hosts, so the served backend
 * lives at `/api/*.php`, `/sync.php`, `/upload.php`, ... But the *source* of
 * those files is `public/` (Vite's publicDir): `vite build` copies `public/*`
 * into `dist/`, and `php ccrm update` then copies `public/* -> dist/*` and
 * `dist/* -> root` on the server. So the root copy is always publish OUTPUT,
 * never an input — `public/` wins, every time.
 *
 * Both copies are committed (the server has no build step and deploys by
 * `git pull`), which means a change made to only one of them leaves the repo
 * permanently broken in a way that is invisible locally:
 *
 *   1. the server publishes `public/`'s version over the tracked root file,
 *   2. the root file is now "locally modified" for git, forever,
 *   3. the next `php ccrm update` refuses to run ("unexpected local
 *      modifications to tracked file(s)"),
 *   4. and production silently runs `public/`'s code while the repo root
 *      claims something else.
 *
 * That is exactly what happened to `api/agent_utils.php` in v1.8.28/v1.8.30:
 * both commits edited only `public/api/agent_utils.php`, so every deploy after
 * them blocked until the root file was reset by hand.
 *
 * This script removes the whole class of bug by making the copy mechanical.
 * It runs as part of `npm run build`, so the two trees cannot drift apart in a
 * commit.
 *
 * A root file that was itself deliberately edited (1.9.79's dashboard fix,
 * committed only at the root before a18e192 caught up `public/`) is the same
 * class of bug in reverse: this script would silently revert it on the very
 * next build. `rootFileIsNewer()` (`sync-backend-policy.mjs`) catches that
 * case — an uncommitted edit sitting only in the root file, or a commit that
 * touched only the root copy — and refuses to overwrite it instead.
 *
 * Usage:
 *   node scripts/sync-backend.mjs           # copy public/ -> root where they differ
 *   node scripts/sync-backend.mjs --check   # exit 1 if they differ, change nothing
 *   node scripts/sync-backend.mjs --force   # overwrite even a root file that looks newer
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { rootFileIsNewer } from './sync-backend-policy.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDir = join(repoRoot, 'public');

// Not part of the backend mirror:
//  - index.html / assets/  : the built frontend, which lives in dist/ and is
//                            explicitly gitignored under public/ (a stale copy
//                            here once rolled the deployed bundle back — 1.6.11).
//  - update-screenshots/   : release-note images, served from /update-screenshots
//                            after publish, never duplicated in the repo root.
//  - config.php            : per-instance secrets, never overwritten by publish.
const SKIP = new Set(['index.html', 'assets', 'update-screenshots', 'config.php']);

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

function git(args) {
    try {
        return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
    } catch {
        return '';
    }
}

const isDirty = (relPath) => git(['status', '--porcelain', '--', relPath]).trim().length > 0;

/** Did the most recent commit touching either copy touch only the root one? */
function rootOnlyCommitTouched(rootRel, publicRel) {
    const hash = git(['log', '-1', '--format=%H', '--', rootRel, publicRel]).trim();
    if (!hash) return false;
    const touched = git(['show', '--name-only', '--format=', hash, '--', rootRel, publicRel])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    return touched.includes(rootRel) && !touched.includes(publicRel);
}

const checkOnly = process.argv.includes('--check');
const force = process.argv.includes('--force');
const drifted = [];
const blocked = [];
const updated = [];

for (const src of walk(publicDir)) {
    const rel = relative(publicDir, src);
    const dest = join(repoRoot, rel);

    // Only mirror files that already have a root counterpart. A file that
    // exists solely in public/ (e.g. dump_schema.php) is published to the
    // server by `ccrm update` but is deliberately not duplicated in the repo.
    if (!existsSync(dest)) continue;

    const from = readFileSync(src);
    if (from.equals(readFileSync(dest))) continue;

    const rootRel = rel.split(sep).join('/');
    const publicRel = ['public', ...rel.split(sep)].join('/');
    drifted.push(rootRel);

    if (checkOnly) continue;

    if (!force && rootFileIsNewer({
        rootDirty: isDirty(rootRel),
        publicDirty: isDirty(publicRel),
        rootOnlyCommit: rootOnlyCommitTouched(rootRel, publicRel)
    })) {
        blocked.push(rootRel);
        continue;
    }

    writeFileSync(dest, from);
    updated.push(rootRel);
}

if (drifted.length === 0) {
    console.log('sync-backend: root backend copies are in sync with public/');
    process.exit(0);
}

if (checkOnly) {
    console.error('sync-backend: root copies differ from public/ (public/ is the source of truth):');
    for (const f of drifted) console.error(`  - ${f}`);
    console.error('Run `node scripts/sync-backend.mjs` to update them, then commit.');
    process.exit(1);
}

if (blocked.length > 0) {
    console.error('sync-backend: refusing to overwrite root file(s) that look newer than public/, their normal source of truth:');
    for (const f of blocked) console.error(`  - ${f}`);
    console.error('If the root edit was a mistake, port it into public/ and re-run. If it was deliberate,');
    console.error('copy it into public/ yourself, or re-run with --force to overwrite the root copy anyway.');
    process.exit(1);
}

console.log('sync-backend: updated root copies from public/:');
for (const f of updated) console.log(`  - ${f}`);
