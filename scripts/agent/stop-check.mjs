#!/usr/bin/env node
/**
 * Claude Code Stop hook: runs `scripts/agent/check.mjs` of the session's checkout before Claude
 * is allowed to finish, when relevant source changed since the last green run.
 *
 *   exit 0  nothing relevant changed / check passed / already told Claude once for this state
 *   exit 2  check failed: stderr (a short summary) goes back to Claude, which keeps working
 *
 * State lives in `<git-dir>/ccrm-check/state.json` (per checkout, never committed):
 *   lastPass {head, fingerprint}, lastFail {fingerprint}
 * Skip entirely with CCRM_STOP_CHECK=0. Node only; no bash dependencies.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

if (process.env.CCRM_STOP_CHECK === '0') process.exit(0);

const RELEVANT = [
  'src', 'public', 'tests', 'scripts', 'api', 'sync.php', ':(glob)*.config.ts', ':(glob)tsconfig*.json', 'package.json',
];
const TIMEOUT_MS = 8 * 60 * 1000;

const git = (cwd, args, opts = {}) => execFileSync('git', ['-C', cwd, ...args], {
  encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'], ...opts,
});

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function main() {
  const input = readStdin();
  const cwd = input.cwd || process.cwd();
  let root, gitDir, head;
  try {
    root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
    gitDir = git(root, ['rev-parse', '--git-dir']).trim();
    head = git(root, ['rev-parse', 'HEAD']).trim();
  } catch { return 0; } // not a repo, or no commits
  if (!existsSync(join(root, 'scripts', 'agent', 'check.mjs'))) return 0;
  if (!isAbsolute(gitDir)) gitDir = resolve(root, gitDir);

  const stateFile = join(gitDir, 'ccrm-check', 'state.json');
  let state = {};
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* first run */ }
  const save = () => {
    try { mkdirSync(join(gitDir, 'ccrm-check'), { recursive: true }); writeFileSync(stateFile, JSON.stringify(state, null, 2)); } catch { /* ignore */ }
  };

  // Uncommitted relevant changes: tracked diff + untracked files (path + content hash).
  const diff = git(root, ['diff', 'HEAD', '--', ...RELEVANT]);
  const untracked = git(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...RELEVANT]).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256').update(head).update('\0').update(diff);
  for (const f of untracked) {
    let h = 'unreadable';
    try { h = createHash('sha256').update(readFileSync(join(root, f))).digest('hex'); } catch { /* vanished */ }
    hash.update(`\0${f}\0${h}`);
  }
  const fingerprint = hash.digest('hex');
  const dirty = diff.length > 0 || untracked.length > 0;

  let headMoved = false;
  if (state.lastPass?.head && state.lastPass.head !== head) {
    try { headMoved = git(root, ['diff', '--name-only', state.lastPass.head, head, '--', ...RELEVANT]).trim().length > 0; } catch { headMoved = true; }
  }
  if (!state.lastPass && !dirty) { state.lastPass = { head, fingerprint }; save(); return 0; }
  if (!dirty && !headMoved) { if (state.lastPass?.head !== head) { state.lastPass = { head, fingerprint }; save(); } return 0; }
  if (state.lastPass?.fingerprint === fingerprint) return 0; // already green for exactly this state

  if (state.lastFail?.fingerprint === fingerprint && input.stop_hook_active) return 0; // told once already

  const r = spawnSync(process.execPath, [join(root, 'scripts', 'agent', 'check.mjs')], {
    cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 1 << 28, windowsHide: true,
  });
  if (r.status === 0) {
    state.lastPass = { head, fingerprint };
    delete state.lastFail;
    save();
    return 0;
  }
  state.lastFail = { fingerprint };
  save();
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  const body = timedOut ? `npm run check timed out after ${TIMEOUT_MS / 60000} minutes.` : (r.stdout || r.stderr || String(r.error || '')).trim();
  const lines = body.split('\n');
  const tail = lines.length > 70 ? ['...', ...lines.slice(-70)] : lines;
  process.stderr.write(
    `npm run check failed in ${root}:\n\n${tail.join('\n')}\n\n`
    + 'Fix these before finishing. If a failure exists on the integration branch too and is unrelated to your change, '
    + 'show the evidence and tell the user instead.\n',
  );
  return 2;
}

let code = 0;
try { code = main(); } catch { code = 0; } // a broken hook must never trap a session
process.exit(code);
