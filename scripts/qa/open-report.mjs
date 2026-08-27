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
  console.log('Usage: npm run test:qa:report [-- --html]');
  console.log('       Opens test-results/qa-audit-report.md (this run).');
  console.log('       A previous full-suite copy lives at qa-audit-report-latest-full.md');
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
