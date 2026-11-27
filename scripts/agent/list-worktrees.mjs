#!/usr/bin/env node
// List linked worktrees with their state, to spot leftovers: name, branch, ahead/behind the
// integration branch (the branch checked out in the main checkout), dirty files, last commit age.
//   node scripts/agent/list-worktrees.mjs
import fs from 'node:fs';
import path from 'node:path';
import { git, isManaged, listWorktrees } from './lib.mjs';

const all = listWorktrees(process.cwd());
if (!all.length) { console.error('not inside a git repository.'); process.exit(1); }
const main = all[0];
const integ = git(main.path, ['branch', '--show-current']).out || '(detached)';
console.log(`main checkout: ${main.path}  (integration branch: ${integ})\n`);

const rows = all.slice(1).map((w) => {
  const missing = !fs.existsSync(w.path);
  let ahead = '?', behind = '?', dirty = '?', age = '?';
  if (w.branch && integ !== '(detached)') {
    const lr = git(main.path, ['rev-list', '--left-right', '--count', `${integ}...${w.branch}`]).out.split(/\s+/);
    [behind, ahead] = lr;
    age = git(main.path, ['log', '-1', '--format=%cr', w.branch]).out;
  }
  if (!missing) dirty = String(git(w.path, ['status', '--porcelain']).out.split(/\r?\n/).filter(Boolean).length);
  const managed = isManaged(main.path, w.path);
  return { name: path.basename(w.path) + (missing ? ' (MISSING)' : ''), managed: managed ? 'yes' : 'NO', branch: w.branch ?? '(detached)', ahead, behind, dirty, age };
});

if (!rows.length) console.log('no linked worktrees.');
else console.table(rows);
for (const r of rows) {
  if (r.managed === 'NO') console.log(`  ${r.name}: outside .claude/worktrees - another session's or made by hand. Leave it alone unless you know it is yours.`);
  else if (r.ahead === '0' && r.dirty === '0') console.log(`  ${r.name}: fully merged and clean -> node scripts/agent/finish-worktree.mjs ${r.name} --no-merge`);
  else if (Number(r.ahead) > 0) console.log(`  ${r.name}: ${r.ahead} unmerged commit(s) -> node scripts/agent/finish-worktree.mjs ${r.name}`);
}
