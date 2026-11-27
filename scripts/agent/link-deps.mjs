#!/usr/bin/env node
// Inside a linked git worktree, give node_modules as an NTFS junction to the main checkout's one.
// Idempotent; no-op in the main checkout. Also a Claude Code PostToolUse hook for EnterWorktree
// (reads the hook JSON on stdin). Never fails the tool call: always exits 0.
//   node scripts/agent/link-deps.mjs [worktree-dir]
import fs from 'node:fs';
import path from 'node:path';
import { exists, isLink, mainCheckout, samePath, toplevel } from './lib.mjs';

const say = (m) => console.log(`[link-deps] ${m}`);

async function readStdin() {
  if (process.stdin.isTTY) return null;
  return new Promise((resolve) => {
    let s = '';
    const t = setTimeout(() => resolve(s || null), 1500);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (s += c));
    process.stdin.on('end', () => { clearTimeout(t); resolve(s || null); });
    process.stdin.on('error', () => { clearTimeout(t); resolve(null); });
  });
}

/** Collect every string in a JSON value that is an existing directory. */
function dirStrings(v, out = []) {
  if (typeof v === 'string') {
    if (v.length < 1024 && /[\\/]/.test(v)) { try { if (fs.statSync(v).isDirectory()) out.push(v); } catch {} }
  } else if (v && typeof v === 'object') for (const x of Object.values(v)) dirStrings(x, out);
  return out;
}

function link(dir) {
  const top = toplevel(dir);
  const main = mainCheckout(dir);
  if (!top || !main) return `${dir} is not inside a git repository; nothing to do.`;
  if (samePath(top, main)) return 'main checkout; nothing to do.';
  const nm = path.join(top, 'node_modules');
  if (exists(nm)) return `${isLink(nm) ? 'junction' : 'directory'} already present in ${top}.`;
  const target = path.join(main, 'node_modules');
  if (!fs.existsSync(target)) return `main checkout has no node_modules (${target}); run npm install there first.`;
  fs.symlinkSync(target, nm, 'junction'); // junctions need no admin rights
  return `linked ${nm} -> ${target}`;
}

try {
  const cands = [];
  if (process.argv[2]) cands.push(path.resolve(process.argv[2]));
  const raw = await readStdin();
  if (raw) {
    try {
      const j = JSON.parse(raw);
      // Prefer paths inside .claude/worktrees (the new worktree), then anything from the response/input, then cwd.
      const found = [...dirStrings(j.tool_response), ...dirStrings(j.tool_input)];
      cands.push(...found.filter((p) => /[\\/]\.claude[\\/]worktrees[\\/]/.test(p)), ...found);
      if (j.cwd) cands.push(j.cwd);
    } catch { /* not JSON: ignore */ }
  }
  cands.push(process.cwd());
  // First candidate that is a linked worktree wins; otherwise report on the first usable one.
  let msg = null;
  for (const c of [...new Set(cands)]) {
    const top = toplevel(c), main = mainCheckout(c);
    if (top && main && !samePath(top, main)) { msg = link(c); break; }
    msg ??= top ? link(c) : null;
  }
  say(msg ?? 'no git directory found; nothing to do.');
} catch (e) {
  say(`skipped: ${e.message}`);
}
process.exit(0);
