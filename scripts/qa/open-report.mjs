#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Opens the human QA report (markdown with proposed fixes). Playwright's HTML
 * report is traces/video; pass --html if you need that too.
 *
 *   npm run test:qa:report
 *   npm run test:qa:report -- --html
 */

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run test:qa:report [-- --html] [-- --list]');
  console.log('       Opens test-results/qa-audit-report.md (the latest run).');
  console.log('       --list  show the saved run folders in test-results/runs/');
  console.log('       --html  also open Playwright traces and video');
  process.exit(0);
}

const RUNS_DIR = path.resolve('test-results', 'runs');

function savedRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
}

if (args.includes('--list')) {
  const runs = savedRuns();
  if (runs.length === 0) {
    console.log('No saved runs yet. Run npm run test:qa first.');
    process.exit(0);
  }
  console.log(`Saved QA runs (newest first) in test-results/runs/:
`);
  for (const r of runs) {
    const findings = path.join(RUNS_DIR, r, 'findings.json');
    let summary = '';
    try {
      const d = JSON.parse(fs.readFileSync(findings, 'utf-8'));
      summary = `${d.findings.length} defect(s), ${d.passes.length} check(s) passed`;
    } catch {
      summary = 'no findings.json';
    }
    console.log(`  ${r}  -  ${summary}`);
  }
  console.log(`
Open one: test-results/runs/<name>/report.md`);
  process.exit(0);
}

const report = path.resolve('test-results', 'qa-audit-report.md');
const latestFull = path.resolve('test-results', 'qa-audit-report-latest-full.md');

if (!fs.existsSync(report) && !fs.existsSync(latestFull)) {
  console.error('No QA report found. Run npm run test:qa first.');
  process.exit(1);
}

const target = fs.existsSync(report) ? report : latestFull;
console.log(`Opening ${path.relative(process.cwd(), target)}`);
if (fs.existsSync(latestFull) && path.resolve(latestFull) !== path.resolve(target)) {
  console.log(`Last full-suite report: ${path.relative(process.cwd(), latestFull)}`);
}
const runs = savedRuns();
if (runs.length > 0) {
  console.log(`${runs.length} saved run(s) in test-results/runs/ - newest: ${runs[0]}`);
  console.log(`List them all: npm run test:qa:report -- --list`);
}

function openFile(file) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', file], { stdio: 'ignore', detached: true, shell: false });
  } else if (process.platform === 'darwin') {
    spawn('open', [file], { stdio: 'ignore', detached: true });
  } else {
    spawn('xdg-open', [file], { stdio: 'ignore', detached: true });
  }
}

openFile(target);

if (args.includes('--html')) {
  spawn('npx', ['playwright', 'show-report'], { stdio: 'inherit', shell: true });
}
