import fs from 'node:fs';
import path from 'node:path';
import { archiveCurrentReportIfPresent, FINDINGS_DIR } from './helpers/reportCollector';

/**
 * Worker findings must start empty so this run does not inherit last run's
 * defects. The human markdown report is archived first, so a Clients-only
 * re-run cannot erase a previous full-suite report from disk.
 */
export default function globalSetup() {
  archiveCurrentReportIfPresent();
  fs.rmSync(FINDINGS_DIR, { recursive: true, force: true });
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
  fs.mkdirSync(path.resolve('test-results', 'screenshots'), { recursive: true });
}
