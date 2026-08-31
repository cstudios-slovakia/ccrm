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
 * Usage:
 *   node scripts/sync-backend.mjs           # copy public/ -> root where they differ
 *   node scripts/sync-backend.mjs --check   # exit 1 if they differ, change nothing
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const checkOnly = process.argv.includes('--check');
const drifted = [];

for (const src of walk(publicDir)) {
    const rel = relative(publicDir, src);
    const dest = join(repoRoot, rel);

    // Only mirror files that already have a root counterpart. A file that
    // exists solely in public/ (e.g. dump_schema.php) is published to the
    // server by `ccrm update` but is deliberately not duplicated in the repo.
    if (!existsSync(dest)) continue;

    const from = readFileSync(src);
    if (from.equals(readFileSync(dest))) continue;

    drifted.push(rel.split(sep).join('/'));
    if (!checkOnly) writeFileSync(dest, from);
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

console.log('sync-backend: updated root copies from public/:');
for (const f of drifted) console.log(`  - ${f}`);
