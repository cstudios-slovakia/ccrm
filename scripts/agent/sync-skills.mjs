// Copies the tracked skills in .agents/skills/ into .claude/skills/, where Claude Code loads them.
//
// .claude/ is gitignored, so .claude/skills/ is a local copy that silently goes stale: on
// 2026-11-09 the loaded ccrm-qa-audit skill was the 2026-10-16 version, three weeks of QA
// changes behind the tracked one. Runs as a SessionStart hook (and by hand); plain copies,
// never links, so a recursive delete of .claude/ can't reach the tracked files.
//
//   node scripts/agent/sync-skills.mjs [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, '.agents', 'skills');
const dst = path.join(root, '.claude', 'skills');
const quiet = process.argv.includes('--quiet');

function files(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p, base));
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}

try {
  if (!fs.existsSync(src)) process.exit(0);
  const updated = [];
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const from = path.join(src, e.name), to = path.join(dst, e.name);
    let changed = false;
    for (const rel of files(from)) {
      const a = path.join(from, rel), b = path.join(to, rel);
      const data = fs.readFileSync(a);
      if (fs.existsSync(b) && Buffer.compare(data, fs.readFileSync(b)) === 0) continue;
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.writeFileSync(b, data);
      changed = true;
    }
    if (changed) updated.push(e.name);
  }
  if (updated.length && !quiet) console.log(`sync-skills: updated .claude/skills/{${updated.join(', ')}}`);
} catch (err) {
  // A hook must never break session start.
  if (!quiet) console.error(`sync-skills: ${err.message}`);
}
process.exit(0);
