#!/usr/bin/env node
// End-to-end test of link-deps / finish-worktree / list-worktrees in a throwaway repo.
// Never touches the real checkout. Run: node scripts/agent/test-worktree-scripts.mjs
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
const repo = path.join(tmp, 'repo');
const run = (cwd, cmd, args, input) => spawnSync(cmd, args, { cwd, encoding: 'utf8', input });
const git = (cwd, ...a) => { const r = run(cwd, 'git', a); assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
const script = (cwd, name, ...a) => run(cwd, process.execPath, [path.join(here, name), ...a]);
const commit = (cwd, file, text, msg) => { fs.writeFileSync(path.join(cwd, file), text); git(cwd, 'add', '-A'); git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', msg); };
let n = 0;
const ok = (m) => console.log(`  ok ${++n} ${m}`);

try {
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'integ');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n.cache\n');
  commit(repo, 'a.txt', 'a', 'init');
  const nm = path.join(repo, 'node_modules');
  fs.mkdirSync(path.join(nm, 'typescript', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(nm, 'typescript', 'bin', 'tsc'), 'x');
  fs.writeFileSync(path.join(nm, 'MARKER'), 'keep me');
  const mkWt = (name) => {
    const p = path.join(repo, '.claude', 'worktrees', name);
    git(repo, 'worktree', 'add', '-b', `worktree-${name}`, p, 'integ');
    return p;
  };

  console.log('A: happy path (ff, junction, ignored leftovers)');
  const wa = mkWt('alpha');
  let r = script(wa, 'link-deps.mjs');
  assert.match(r.stdout, /linked/); assert.equal(r.status, 0);
  assert.ok(fs.lstatSync(path.join(wa, 'node_modules')).isSymbolicLink()); ok('link-deps created junction');
  r = script(wa, 'link-deps.mjs'); assert.match(r.stdout, /already present/); ok('link-deps idempotent');
  r = script(repo, 'link-deps.mjs'); assert.match(r.stdout, /main checkout/); ok('link-deps no-op in main');
  r = run(repo, process.execPath, [path.join(here, 'link-deps.mjs')], JSON.stringify({ cwd: repo, tool_response: { worktreePath: wa } }));
  assert.equal(r.status, 0); assert.match(r.stdout, /already present/); ok('hook mode finds the worktree from stdin JSON');
  commit(wa, 'alpha.txt', 'alpha', 'feat: alpha');
  fs.mkdirSync(path.join(wa, '.cache')); fs.writeFileSync(path.join(wa, '.cache', 'junk'), '1');
  r = script(repo, 'list-worktrees.mjs'); assert.match(r.stdout, /worktree-alpha/); ok('list-worktrees shows it');
  r = script(repo, 'finish-worktree.mjs', 'alpha', '--dry-run');
  assert.equal(r.status, 0, r.stderr); assert.ok(fs.existsSync(wa)); ok('dry-run changes nothing');
  r = script(repo, 'finish-worktree.mjs', 'alpha');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(repo, 'alpha.txt'))); ok('ff-merged into integ');
  assert.ok(!fs.existsSync(wa)); ok('worktree dir gone');
  assert.equal(run(repo, 'git', ['branch', '--list', 'worktree-alpha']).stdout.trim(), ''); ok('branch gone');
  assert.equal(fs.readFileSync(path.join(nm, 'MARKER'), 'utf8'), 'keep me'); ok('main node_modules marker intact');

  console.log('B: dirty worktree aborts');
  const wb = mkWt('bravo');
  commit(wb, 'b.txt', 'b', 'feat: bravo');
  fs.writeFileSync(path.join(wb, 'a.txt'), 'changed'); fs.writeFileSync(path.join(wb, 'new.txt'), 'n');
  r = script(repo, 'finish-worktree.mjs', 'bravo');
  assert.notEqual(r.status, 0); assert.match(r.stderr, /uncommitted/); assert.match(r.stderr, /a\.txt/); assert.match(r.stderr, /new\.txt/);
  assert.ok(fs.existsSync(wb)); assert.ok(!fs.existsSync(path.join(repo, 'b.txt'))); ok('aborted with file list, nothing merged');

  console.log('C: non-ff needs a rebase');
  git(wb, 'checkout', '--', 'a.txt'); fs.rmSync(path.join(wb, 'new.txt'));
  commit(repo, 'main-only.txt', 'm', 'chore: main moved on');
  r = script(repo, 'finish-worktree.mjs', 'worktree-bravo');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(repo, 'b.txt')) && fs.existsSync(path.join(repo, 'main-only.txt'))); ok('rebased and merged, both changes present');
  assert.equal(git(repo, 'rev-list', '--merges', '--count', 'integ'), '0'); ok('history stays linear');
  assert.ok(!fs.existsSync(wb)); ok('worktree gone');

  console.log('D: rebase conflict aborts safely');
  const wd = mkWt('delta');
  commit(wd, 'a.txt', 'delta version', 'feat: delta edits a');
  commit(repo, 'a.txt', 'main version', 'chore: main edits a');
  const headBefore = git(repo, 'rev-parse', 'HEAD');
  r = script(repo, 'finish-worktree.mjs', 'delta');
  assert.notEqual(r.status, 0); assert.match(r.stderr, /conflict/i);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), headBefore);
  assert.equal(git(wd, 'status', '--porcelain'), ''); assert.ok(!fs.existsSync(path.join(wd, '.git', 'rebase-merge'))); ok('conflict reported, rebase aborted, main untouched');

  console.log('E: --no-merge');
  r = script(repo, 'finish-worktree.mjs', 'delta', '--no-merge');
  assert.notEqual(r.status, 0); assert.match(r.stderr, /not in integ/); assert.ok(fs.existsSync(wd)); ok('refuses with unmerged commits');
  script(wd, 'link-deps.mjs');
  r = script(repo, 'finish-worktree.mjs', 'delta', '--no-merge', '--discard');
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(!fs.existsSync(wd)); ok('--discard removes it');
  const we = mkWt('echo'); script(we, 'link-deps.mjs');
  r = script(repo, 'finish-worktree.mjs', 'echo', '--no-merge');
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(!fs.existsSync(we)); ok('--no-merge cleans a merged/empty worktree');
  assert.equal(fs.readFileSync(path.join(nm, 'MARKER'), 'utf8'), 'keep me'); ok('marker still intact at the end');

  console.log(`\nAll ${n} checks passed.`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
} finally {
  // Remove any junction first so rmSync can never follow it into the fake node_modules.
  try { for (const w of fs.readdirSync(path.join(repo, '.claude', 'worktrees'))) { const l = path.join(repo, '.claude', 'worktrees', w, 'node_modules'); try { if (fs.lstatSync(l).isSymbolicLink()) fs.rmdirSync(l); } catch {} } } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}
