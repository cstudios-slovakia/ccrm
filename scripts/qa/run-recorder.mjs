#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Convenience CLI for replaying one Chrome DevTools Recorder export.
 *
 * The replay itself is a Playwright test (`tests/e2e/recorder.spec.ts`), which is
 * what gives it the dev server, the backend fixture, traces, the shared QA
 * report and a real exit code. This wrapper only points that test at a single
 * file so you do not have to remember the environment variable.
 *
 *   node scripts/qa/run-recorder.mjs tests/recordings/my-flow.json [--headed]
 *
 * With no argument, every recording in tests/recordings/ is replayed.
 */

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const file = args.find((a) => !a.startsWith('--'));

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/qa/run-recorder.mjs [path-to-recording.json] [--headed]');
  console.log('       npm run test:qa:recorder        (replays every recording)');
  process.exit(0);
}

const env = { ...process.env };

if (file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`Recording not found: ${resolved}`);
    process.exit(1);
  }
  env.QA_RECORDING = resolved;
  console.log(`Replaying ${path.relative(process.cwd(), resolved)}`);
} else {
  console.log('Replaying every recording in tests/recordings/');
}

const cli = ['playwright', 'test', 'recorder.spec.ts', '--workers=1'];
if (headed) cli.push('--headed');

const result = spawnSync('npx', cli, { stdio: 'inherit', env, shell: true });
process.exit(result.status ?? 1);
