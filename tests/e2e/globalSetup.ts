import fs from 'node:fs';
import { FINDINGS_DIR, beginRun, inferSuiteKind, pruneOldRuns } from './helpers/reportCollector';

/**
 * Opens a fresh run folder and clears the per-worker scratch.
 *
 * Worker findings must start empty so this run does not inherit the last run's
 * defects. Everything a human reads afterwards -- report, findings JSON and the
 * screenshots it links to -- is written into `test-results/runs/<stamp>-<kind>/`,
 * so a re-run never overwrites or orphans a previous run's evidence.
 */
export default function globalSetup() {
  pruneOldRuns();
  const runId = beginRun(inferSuiteKind());

  fs.rmSync(FINDINGS_DIR, { recursive: true, force: true });
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });

  console.log(`\nQA run: test-results/runs/${runId}/\n`);
}
