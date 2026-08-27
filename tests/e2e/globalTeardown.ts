import fs from 'node:fs';
import { LATEST_FULL_REPORT, REPORT_PATH, generateMarkdownReport } from './helpers/reportCollector';

/**
 * Merges every worker's findings into one report and prints a summary, so the
 * outcome is visible in the terminal instead of only on disk.
 */
export default function globalTeardown() {
  const { data, suiteKind } = generateMarkdownReport();

  const counts = data.findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  const line = '─'.repeat(72);
  console.log(`\n${line}`);
  console.log('CCRM QA AUDIT SUMMARY');
  console.log(line);
  console.log(`Checks passed:  ${data.passes.length}`);
  console.log(`Defects found:  ${data.findings.length}` +
    (data.findings.length
      ? `  (critical ${counts.CRITICAL ?? 0}, high ${counts.HIGH ?? 0}, medium ${counts.MEDIUM ?? 0}, low ${counts.LOW ?? 0})`
      : ''));

  if (data.findings.length > 0) {
    console.log(`\nTop findings:`);
    for (const f of data.findings.slice(0, 12)) {
      console.log(`  [${f.severity.padEnd(8)}] ${f.id}  ${f.module} › ${f.target}`);
      console.log(`             expected: ${f.expected}`);
      console.log(`             actual:   ${f.actual}`);
    }
    if (data.findings.length > 12) {
      console.log(`  … and ${data.findings.length - 12} more.`);
    }
  }

  console.log(`\nThis run: ${suiteKind}`);
  console.log(`Report with proposed fixes: ${REPORT_PATH}`);
  if (suiteKind === 'full') {
    console.log(`Last full-suite copy:       ${LATEST_FULL_REPORT}`);
  } else if (fs.existsSync(LATEST_FULL_REPORT)) {
    console.log(`Last full-suite report:     ${LATEST_FULL_REPORT}`);
  }
  console.log(`${line}\n`);
}
