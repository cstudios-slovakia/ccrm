#!/usr/bin/env node
/**
 * Runs a release-notes screenshot spec in every language.
 *
 *   node scripts/release-notes/shoot.mjs --spec generated/1-11-150.spec.ts --out <runDir>/shots
 *   node scripts/release-notes/shoot.mjs --spec example.spec.ts --out test-results/release-shots --langs sk
 *   node scripts/release-notes/shoot.mjs ... --grep "finance"     only the tests whose title matches
 *
 * `--spec` is relative to tests/release-notes/. Shots land in <out>/<lang>/<name>.png,
 * each language with a shots.json manifest. The spec is copied next to them for the record.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LANGS, REPO, parseArgs } from './lib.mjs';

const args = parseArgs();
if (typeof args.spec !== 'string' || typeof args.out !== 'string') {
  console.error('Usage: node scripts/release-notes/shoot.mjs --spec <file in tests/release-notes> --out <dir> [--langs sk,en,hu] [--grep <title>]');
  process.exit(1);
}
const spec = args.spec.replace(/\\/g, '/').replace(/^tests\/release-notes\//, '');
const specPath = path.join(REPO, 'tests', 'release-notes', spec);
if (!fs.existsSync(specPath)) {
  console.error(`Spec not found: ${specPath}`);
  process.exit(1);
}
const out = path.resolve(args.out);
const langs = typeof args.langs === 'string' ? args.langs : LANGS.join(',');

fs.mkdirSync(out, { recursive: true });
const pwArgs = ['playwright', 'test', '--config', 'playwright.release-notes.config.ts'];
if (typeof args.grep === 'string') pwArgs.push('--grep', args.grep);

const result = spawnSync('npx', pwArgs, {
  cwd: REPO,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, RELEASE_SPEC: spec, RELEASE_SHOTS_OUT: out, RELEASE_LANGS: langs },
});

fs.copyFileSync(specPath, path.join(out, path.basename(spec)));

for (const lang of langs.split(',')) {
  const manifest = path.join(out, lang, 'shots.json');
  const shots = fs.existsSync(manifest) ? Object.keys(JSON.parse(fs.readFileSync(manifest, 'utf8'))) : [];
  console.log(`[release-notes] ${lang}: ${shots.length} shot(s)${shots.length ? ` — ${shots.join(', ')}` : ''}`);
}
process.exit(result.status ?? 1);
