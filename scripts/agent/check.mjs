#!/usr/bin/env node
/**
 * The one local verification command (`npm run check`). Runs what CI runs, in one go:
 *   app      tsc --noEmit on tsconfig.app.json   (incremental, cache in .cache/tsc)
 *   qa       tsc --noEmit on tsconfig.qa.json    (CI checks this too; `npm run typecheck` does not)
 *   unit     node --test over src/ tests         (same command as `npm run test:unit`)
 *   backend  sync-backend.mjs --check            (repo-root copies mirror public/)
 *   audit    audit-undefined-symbols.mjs --sql --requires, minus scripts/agent/undefined-symbols-baseline.json
 *
 *   node scripts/agent/check.mjs [--fast] [--only app,qa,unit,backend,audit] [--update-baseline]
 *
 * --fast skips the unit tests. All selected steps always run; exit 1 if any failed.
 * Never launches a browser: the QA suite stays a separate, scoped command (docs/TESTING.md).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts', 'agent', 'undefined-symbols-baseline.json');
const args = process.argv.slice(2);
const fast = args.includes('--fast');
const updateBaseline = args.includes('--update-baseline');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : (args[onlyIdx + 1] || '').split(',').filter(Boolean);

if (!existsSync(join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'))) {
  console.error('node_modules is missing: run node scripts/agent/link-deps.mjs');
  process.exit(1);
}
mkdirSync(join(ROOT, '.cache', 'tsc'), { recursive: true });

const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}${r.error ? String(r.error) : ''}` };
};
const node = (...argv) => run(process.execPath, argv);
const tsc = (project, info) => node(
  'node_modules/typescript/bin/tsc', '--noEmit', '-p', project, '--incremental', '--tsBuildInfoFile', `.cache/tsc/${info}.tsbuildinfo`,
);

// ---- undefined-symbol audit: gate on a stable key per finding, ignoring line numbers ----------
// Gated: "broken", "broken-via-entry" and every SQL class. "conditional" and "latent" symbol
// findings and the require lists are informational (hundreds of rule violations that work today).
const GATED = /^(broken|broken-via-entry) \(|^### (Tables or columns that exist nowhere|DDL between|Migration order|Base CREATE TABLE|Columns sync\.php writes)/;
export function auditKeys(text) {
  const keys = new Set();
  let gate = false;
  for (const raw of text.split('\n')) {
    if (/^##+ /.test(raw)) { gate = GATED.test(raw.replace(/^## /, '')); continue; }
    if (!gate || !/^ {2}\S/.test(raw) || /^\s+via:/.test(raw)) continue;
    keys.add(raw.trim().replace(/:\d+(,\d+)*/g, '').replace(/\s+/g, ' '));
  }
  return keys;
}
function auditStep() {
  const r = node('scripts/audit-undefined-symbols.mjs', '--sql', '--requires');
  if (r.code !== 0) return { code: 1, out: r.out };
  const keys = auditKeys(r.out);
  if (updateBaseline) {
    writeFileSync(BASELINE, JSON.stringify({
      _note: 'Findings of scripts/audit-undefined-symbols.mjs (--sql --requires) that already existed when this register was made. '
        + 'npm run check fails only on findings NOT listed here. Fix one, then delete its line. Never add a line for a new finding without evidence it is a false positive.',
      known: [...keys].sort(),
    }, null, 2) + '\n');
    return { code: 0, out: `baseline written: ${keys.size} entries` };
  }
  const known = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).known : []);
  const fresh = [...keys].filter((k) => !known.has(k));
  const gone = [...known].filter((k) => !keys.has(k));
  const lines = [];
  if (fresh.length) lines.push(`${fresh.length} NEW finding(s) not in scripts/agent/undefined-symbols-baseline.json:`, ...fresh.map((k) => `  ${k}`));
  if (gone.length) lines.push(`${gone.length} baseline entr${gone.length === 1 ? 'y' : 'ies'} no longer occur, remove from the baseline:`, ...gone.map((k) => `  ${k}`));
  return { code: fresh.length ? 1 : 0, out: lines.join('\n') || `${keys.size} known finding(s), none new`, note: `${keys.size} baselined` };
}

const STEPS = [
  { id: 'app', title: 'app type-check', fn: () => tsc('tsconfig.app.json', 'app') },
  { id: 'qa', title: 'QA-suite type-check', fn: () => tsc('tsconfig.qa.json', 'qa') },
  { id: 'unit', title: 'unit tests', skipFast: true, fn: () => node('--test', '--experimental-strip-types', 'src/**/*.test.ts') },
  { id: 'backend', title: 'backend mirror', fn: () => node('scripts/sync-backend.mjs', '--check') },
  { id: 'audit', title: 'undefined-symbol audit', fn: auditStep },
];

const results = [];
for (const s of STEPS) {
  if (only ? !only.includes(s.id) : (fast && s.skipFast)) continue;
  const t0 = Date.now();
  let r;
  try { r = s.fn(); } catch (e) { r = { code: 1, out: String(e?.stack || e) }; }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  results.push({ ...s, ...r, secs });
  console.error(`${r.code === 0 ? 'PASS' : 'FAIL'} ${s.title} (${secs}s)`);
}

console.log('\ncheck summary');
for (const r of results) console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.title.padEnd(24)} ${r.secs}s${r.note ? `  (${r.note})` : ''}`);
const failed = results.filter((r) => r.code !== 0);
for (const r of failed) {
  const lines = r.out.split('\n').filter((l) => l.trim());
  console.log(`\n--- ${r.title}: last ${Math.min(40, lines.length)} line(s) ---`);
  console.log(lines.slice(-40).join('\n'));
}
const gone = results.find((r) => r.id === 'audit' && r.code === 0 && /no longer occur/.test(r.out));
if (gone) console.log(`\nnote (audit): ${gone.out}`);
console.log(failed.length ? `\ncheck FAILED: ${failed.map((r) => r.id).join(', ')}` : '\ncheck OK');
process.exit(failed.length ? 1 : 0);
