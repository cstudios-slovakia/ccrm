import { QAReport, formatFindingLine, type QAFinding, type Severity } from './reportCollector';

const VALID: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/**
 * Severity at which a discovered defect fails the run.
 *
 * The previous harness recorded defects to a file and always exited 0, so a run
 * that found two high-severity bugs still printed "12 passed". Reports nobody
 * is told to read do not get read.
 */
export const FAIL_ON: Severity = (() => {
  const raw = (process.env.QA_FAIL_ON ?? 'HIGH').toUpperCase() as Severity;
  return VALID.includes(raw) ? raw : 'HIGH';
})();

/** Call at the end of a test. Throws with the defects the test just discovered. */
export function assertNoDefectsFound() {
  if (process.env.QA_FAIL_ON === 'NEVER') return;
  const found = QAReport.scopeFindingsAtLeast(FAIL_ON);
  if (found.length === 0) return;

  const body = found.map(formatFindingLine).join('\n\n');
  throw new Error(
    `${found.length} defect(s) found at severity ${FAIL_ON} or above:\n\n${body}\n\n` +
      `Full report with proposed fixes: test-results/qa-audit-report.md`,
  );
}

/**
 * For known-bug canaries: the test PASSES only when the harness recorded the
 * expected defect. Missing it means the suite is broken. If the product bug
 * itself is gone, delete the canary — do not weaken this assertion.
 */
export function assertKnownBugDetected(match: (f: QAFinding) => boolean, harnessMessage: string): QAFinding[] {
  const found = QAReport.scopeFindings().filter(match);
  if (found.length > 0) return found;
  const seen = QAReport.scopeFindings();
  const dump = seen.length > 0 ? seen.map(formatFindingLine).join('\n\n') : '(no findings in this test)';
  throw new Error(
    `${harnessMessage}\n\n` +
      `If this product bug has been fixed, delete this canary rather than weakening it.\n\n` +
      `Findings recorded in this test:\n${dump}`,
  );
}
