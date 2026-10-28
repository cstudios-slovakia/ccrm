#!/usr/bin/env node
/**
 * Turns "the QA run failed" into "a test outside the known-failing list failed".
 *
 *   node scripts/qa/run-qa.mjs ...; node scripts/qa/apply-known-failing.mjs $?
 *
 * Reads Playwright's JSON report and scripts/qa/known-failing.json. Exit code:
 *   - the run's own code when it is not 0 or 1 (lock, RAM, refused full run),
 *     or when no report exists to judge by;
 *   - 1 when any failed test is not on the list, or any test never ran
 *     (a run that hit its time limit proves nothing about the rest);
 *   - 0 otherwise.
 * Known failures are printed on every run, and an entry whose test now passes
 * is called out for removal, so the list can only shrink on purpose.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runCode = Number(process.argv[2] ?? 1);
const REPORT = path.join(ROOT, 'test-results', 'qa-results.json');
const LIST = path.join(ROOT, 'scripts', 'qa', 'known-failing.json');

if (runCode !== 0 && runCode !== 1) process.exit(runCode);
if (!fs.existsSync(REPORT)) {
  console.log('No Playwright report to judge by; keeping the run result.');
  process.exit(runCode);
}

const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const known = JSON.parse(fs.readFileSync(LIST, 'utf8')).tests;

const tests = [];
function walk(suite, titles) {
  const here = suite.title && suite.title !== suite.file ? [...titles, suite.title] : titles;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      tests.push({
        file: path.basename(spec.file ?? suite.file ?? ''),
        title: [...here, spec.title].join(' › '),
        status: t.status,
        ran: (t.results ?? []).length > 0,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, here);
}
for (const s of report.suites ?? []) walk(s, []);

const matches = (entry, t) => entry.file === t.file && t.title.includes(entry.title);
const failed = tests.filter((t) => t.status === 'unexpected' || t.status === 'timedOut');
const notRun = tests.filter((t) => !t.ran);
const newFailures = failed.filter((t) => !known.some((e) => matches(e, t)));
const knownFailures = failed.filter((t) => known.some((e) => matches(e, t)));
const nowPassing = known.filter((e) => tests.some((t) => matches(e, t) && (t.status === 'expected' || t.status === 'flaky')));

const lines = [];
lines.push('## Known-failing tests');
lines.push('');
if (knownFailures.length) {
  lines.push(`${knownFailures.length} test(s) on the known-failing list failed. They do not block this run, but they are not fixed:`);
  lines.push('');
  for (const t of knownFailures) {
    const e = known.find((k) => matches(k, t));
    lines.push(`- **${t.file}** › ${t.title}\n  - ${e.reason}`);
  }
} else {
  lines.push('None of the known-failing tests failed.');
}
if (nowPassing.length) {
  lines.push('');
  lines.push('These entries now PASS. Remove them from scripts/qa/known-failing.json:');
  for (const e of nowPassing) lines.push(`- ${e.file} › ${e.title}`);
}
if (newFailures.length) {
  lines.push('');
  lines.push(`**${newFailures.length} failure(s) NOT on the list (these fail the run):**`);
  for (const t of newFailures) lines.push(`- ${t.file} › ${t.title}`);
}
if (notRun.length) {
  lines.push('');
  lines.push(`**${notRun.length} test(s) never ran** (the run hit its time limit or crashed), so the result is not trustworthy.`);
}
const text = lines.join('\n');
console.log('\n' + text + '\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');

const bad = newFailures.length > 0 || notRun.length > 0;
if (bad) console.log('QA: failing (see above).');
else console.log(`QA: passing apart from ${knownFailures.length} known failure(s).`);
process.exit(bad ? 1 : 0);
