// Shared helpers for the agent-worktree scripts (link-deps, finish-worktree, list-worktrees).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Run git; returns { ok, out, err }. Never throws. */
export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

export const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
export const samePath = (a, b) => norm(a) === norm(b);

export function isLink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}
export function exists(p) {
  try { fs.lstatSync(p); return true; } catch { return false; }
}

/** Main checkout = parent of the common git dir. Returns null when dir is not in a repo. */
export function mainCheckout(dir) {
  const r = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return r.ok ? path.resolve(path.dirname(r.out)) : null;
}
export function toplevel(dir) {
  const r = git(dir, ['rev-parse', '--show-toplevel']);
  return r.ok ? path.resolve(r.out) : null;
}

/** All worktrees: [{ path, branch|null, head, main:boolean }]. The first entry is the main checkout. */
export function listWorktrees(cwd) {
  const r = git(cwd, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return [];
  return r.out.split(/\r?\n\r?\n/).filter(Boolean).map((blk, i) => {
    const o = { path: '', branch: null, head: '', main: i === 0 };
    for (const line of blk.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) o.path = path.resolve(line.slice(9));
      else if (line.startsWith('branch ')) o.branch = line.slice(7).replace(/^refs\/heads\//, '');
      else if (line.startsWith('HEAD ')) o.head = line.slice(5);
    }
    return o;
  });
}

/**
 * Remove every top-level link (junction/symlink) in a worktree WITHOUT following it.
 * `git worktree remove --force` once followed a node_modules junction and wiped the real one.
 * Returns the removed link names.
 */
export function removeLinks(wtPath) {
  const removed = [];
  for (const name of fs.readdirSync(wtPath)) {
    const p = path.join(wtPath, name);
    if (!isLink(p)) continue;
    try { fs.rmdirSync(p); } catch { fs.unlinkSync(p); } // junction -> rmdir; file symlink -> unlink
    removed.push(name);
  }
  return removed;
}
