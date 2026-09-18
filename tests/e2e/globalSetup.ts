import { admitRun } from '../../scripts/qa/admission.mjs';
import { beginRun, inferSuiteKind, pruneOldRuns } from './helpers/reportCollector';

/**
 * Waits for the machine, then opens a fresh run folder.
 *
 * One QA run per machine: `scripts/qa/run-qa.mjs` takes a machine-wide lock
 * and hands it down through `QA_LOCK_OWNER`. A bare `npx playwright test`
 * has no such parent, so the lock is taken here instead -- after playwright
 * has started the dev server, which is why the port is not checked. Either
 * way a second run queues instead of starving the first.
 *
 * Everything a human reads afterwards -- report, findings JSON and the
 * screenshots it links to -- is written into `test-results/runs/<stamp>-<kind>/`,
 * and so is every worker's findings scratch, so a re-run never overwrites or
 * orphans a previous run's evidence and two runs never see each other's.
 */
export default async function globalSetup() {
  if (!process.env.QA_LOCK_OWNER) {
    await admitRun({ scope: 'playwright test (direct)', port: process.env.QA_PORT ?? 5273, checkPort: false });
    process.env.QA_LOCK_OWNER = String(process.pid);
  }
  pruneOldRuns();
  const runId = beginRun(inferSuiteKind());
  console.log(`\nQA run: test-results/runs/${runId}/\n`);
}
