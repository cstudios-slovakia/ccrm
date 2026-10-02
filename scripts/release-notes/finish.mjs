#!/usr/bin/env node
/**
 * Records how a run ended, so the next scheduled run knows where to start.
 *
 *   node scripts/release-notes/finish.mjs <runDir> --outcome published|skipped|failed [--note "..."]
 *
 * published / skipped  move the baseline to the run's head commit
 * failed               leave the baseline, count the failure (detect.mjs gives up after 3)
 */
import path from 'node:path';
import { parseArgs, readJson, readState, writeState } from './lib.mjs';

const args = parseArgs();
const runDir = args._[0];
const outcome = args.outcome;
if (!runDir || !['published', 'skipped', 'failed'].includes(outcome)) {
  console.error('Usage: node scripts/release-notes/finish.mjs <runDir> --outcome published|skipped|failed [--note "..."]');
  process.exit(1);
}

const context = readJson(path.join(runDir, 'context.json'));
const state = readState() ?? { failures: {}, history: [] };
const entry = {
  at: new Date().toISOString(),
  sha: context.headSha,
  version: context.toVersion,
  craftVersion: context.craftVersion,
  kind: context.kind,
  outcome,
  runDir,
  ...(typeof args.note === 'string' ? { note: args.note } : {}),
};

const failures = { ...(state.failures ?? {}) };
if (outcome === 'failed') failures[context.headSha] = (failures[context.headSha] ?? 0) + 1;
else delete failures[context.headSha];

writeState({
  ...state,
  ...(outcome === 'failed' ? {} : { lastSha: context.headSha, lastVersion: context.toVersion }),
  failures,
  history: [...(state.history ?? []), entry].slice(-100),
});
console.log(`[release-notes] ${context.craftVersion}: ${outcome}${outcome === 'failed' ? ` (attempt ${failures[context.headSha]})` : ''}`);
