#!/usr/bin/env node
/**
 * CI planner: decides what the QA workflow runs and how it is split. Called by the
 * `plan` job of .github/workflows/qa.yml; writes job outputs to $GITHUB_OUTPUT.
 *
 * Inputs (env): EVENT, BASE_REF, BEFORE, FILES (workflow_dispatch input).
 *
 * Scope, as the workflow always had it: --files for a manual list, --since the base for
 * a PR, --since the previous commit for a push, the full suite when history is unknown
 * or for a manual run with no files. The nightly schedule is always the full suite
 * (crawler included) on each branch in NIGHTLY_REFS, sharded.
 *
 * Outputs:
 *   matrix  {"include":[{label, ref, shard, shards, args}, ...]}  one entry per shard
 *   count   tests selected (0 = nothing to run; the qa job is skipped)
 *   refs    JSON list of refs the workflow checks (for the per-ref checks/report jobs)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { EVENT = '', BASE_REF = '', BEFORE = '', FILES = '' } = process.env;

/** Branches the nightly run covers. A schedule only fires from the default branch, so it
 *  checks these out explicitly. */
export const NIGHTLY_REFS = ['main', '1.13-nectarine'];
const SHARDS = Number(process.env.QA_SHARDS ?? 4);

function commitExists(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function scopeArgs() {
  if (EVENT === 'schedule') return ['--full'];
  const files = FILES.split(/\s+/).filter(Boolean);
  if (files.length) return ['--files', ...files];
  if (EVENT === 'pull_request') return ['--since', `origin/${BASE_REF}`];
  if (EVENT === 'push') {
    const unknown = !BEFORE || /^0+$/.test(BEFORE) || !commitExists(BEFORE);
    return unknown ? ['--full'] : ['--since', BEFORE];
  }
  return ['--full'];
}

const args = scopeArgs();
const refs = EVENT === 'schedule' ? NIGHTLY_REFS : [''];
let count;
let shards;

if (EVENT === 'schedule') {
  count = -1; // known to be large; the nightly does not need a listing
  shards = SHARDS;
} else {
  const out = execFileSync(process.execPath, ['scripts/qa/run-qa.mjs', ...args, '--plan-json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, CI: '1', QA_MAX_CORES: '0' },
  });
  const plan = JSON.parse(out.trim().split('\n').pop());
  /* null = playwright could not list: run everything in four, never nothing. */
  count = plan.count ?? -1;
  shards = plan.count === null ? SHARDS : plan.shards;
  console.error(`plan: ${JSON.stringify(plan)}`);
}

const include = [];
for (const ref of refs) {
  const label = ref ? ref.replace(/[^A-Za-z0-9._-]/g, '-') : 'run';
  for (let shard = 1; shard <= shards; shard++) {
    include.push({ label, ref, shard, shards, args: args.join(' ') });
  }
}

const outputs = {
  matrix: JSON.stringify({ include }),
  count: String(count),
  refs: JSON.stringify(refs),
  args: args.join(' '),
  shards: String(shards),
};
for (const [k, v] of Object.entries(outputs)) console.log(`${k}=${v}`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(''));
}
