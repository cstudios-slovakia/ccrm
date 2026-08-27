import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  LATEST_FULL_REPORT,
  REPORT_PATH,
  generateMarkdownReport,
  isCanaryFinding,
} from './helpers/reportCollector';
import { FAIL_ON } from './helpers/gate';

/** file:// URL — most terminals turn this into a clickable link. */
function link(file: string): string {
  const abs = path.resolve(file).split(String.fromCharCode(92)).join('/');
  return 'file:///' + abs.replace(/^[/]+/, '');
}

function openInEditor(file: string) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', file], { stdio: 'ignore', detached: true, shell: false }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [file], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [file], { stdio: 'ignore', detached: true }).unref();
  }
}

/**
 * Merges every worker's findings into one report and prints the verdict, so the
 * outcome is visible in the terminal the moment the run ends instead of only on
 * disk. Set QA_OPEN=1 to also open the report automatically when defects exist.
 */
export default function globalTeardown() {
  const { data, suiteKind, runDir } = generateMarkdownReport();

  const counts = data.findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  const canaries = data.findings.filter(isCanaryFinding);
  const blocking = data.findings.filter(
    (f) => !isCanaryFinding(f) && rank[f.severity] <= rank[FAIL_ON as keyof typeof rank],
  );
  const gated = process.env.QA_FAIL_ON !== 'NEVER';
  const failed = gated && blocking.length > 0;
  const productFindings = data.findings.filter((f) => !isCanaryFinding(f));

  const line = '='.repeat(72);
  console.log(`\n${line}`);
  console.log('CCRM QA AUDIT SUMMARY');
  console.log(line);

  if (failed) {
    console.log(`RESULT: FAILED - ${blocking.length} defect(s) at ${FAIL_ON} or above.`);
  } else if (productFindings.length > 0) {
    console.log(
      `RESULT: PASSED - ${productFindings.length} finding(s), none at ${FAIL_ON} or above.`,
    );
  } else {
    console.log('RESULT: PASSED - no defects found.');
  }
  if (canaries.length > 0) {
    console.log(
      `        ${canaries.length} canary detection(s) - expected: the canaries prove the harness ` +
        `still catches the two known product bugs.`,
    );
  }

  console.log(`\nChecks passed:  ${data.passes.length}`);
  console.log(
    `Defects found:  ${data.findings.length}` +
      (data.findings.length
        ? `  (critical ${counts.CRITICAL ?? 0}, high ${counts.HIGH ?? 0}, medium ${counts.MEDIUM ?? 0}, low ${counts.LOW ?? 0})`
        : ''),
  );

  if (data.findings.length > 0) {
    console.log(`\nTop findings:`);
    for (const f of data.findings.slice(0, 12)) {
      console.log(`  [${f.severity.padEnd(8)}] ${f.id}  ${f.module} > ${f.target}`);
      console.log(`             expected: ${f.expected}`);
      console.log(`             actual:   ${f.actual}`);
    }
    if (data.findings.length > 12) {
      console.log(`  ... and ${data.findings.length - 12} more.`);
    }
  }

  const runRel = path.relative(process.cwd(), runDir).split(path.sep).join('/');
  console.log(`\nThis run (${suiteKind}) is saved in full at:`);
  console.log(`  ${runRel}/            report.md + findings.json + screenshots/`);
  console.log(`\nRead it:`);
  console.log(`  npm run test:qa:report          opens the report`);
  console.log(`  ${link(REPORT_PATH)}`);
  if (data.findings.length > 0) {
    console.log(`  npm run test:qa:report:html     Playwright traces and video`);
  }
  if (suiteKind === 'partial' && fs.existsSync(LATEST_FULL_REPORT)) {
    console.log(`\nThis was a filtered run. Last full audit: ${path
      .relative(process.cwd(), LATEST_FULL_REPORT)
      .split(path.sep)
      .join('/')}`);
  }
  console.log(`${line}\n`);

  if (process.env.QA_OPEN === '1' && data.findings.length > 0) {
    openInEditor(REPORT_PATH);
  }
}
