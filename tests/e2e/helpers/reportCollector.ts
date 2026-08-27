import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const FINDINGS_DIR = path.resolve('test-results', 'qa-findings');
export const REPORT_PATH = path.resolve('test-results', 'qa-audit-report.md');
export const FINDINGS_JSON = path.resolve('test-results', 'qa-findings.json');
export const HISTORY_DIR = path.resolve('test-results', 'qa-history');
export const LATEST_FULL_REPORT = path.resolve('test-results', 'qa-audit-report-latest-full.md');
export const LATEST_FULL_JSON = path.resolve('test-results', 'qa-findings-latest-full.json');

/** UTF-8 BOM so Windows editors do not mojibake Slovak in the markdown report. */
const UTF8_BOM = '\uFEFF';

export type SuiteKind = 'full' | 'partial';

const SUITE_KIND_MARKER = path.resolve('test-results', 'qa-suite-kind.txt');

/**
 * CLI-only inference. Used from playwright.config.ts where `process.argv`
 * still contains the spec file / --grep. Do not read the marker here — it
 * would leak the previous run's kind.
 */
export function inferSuiteKindFromArgv(argv: string[] = process.argv.slice(2)): SuiteKind {
  if (argv.some((a) => a === '--grep' || a === '-g')) return 'partial';
  if (argv.some((a) => /\.spec\.[cm]?[tj]s$/.test(a))) return 'partial';
  return 'full';
}

export function persistSuiteKind(kind: SuiteKind) {
  fs.mkdirSync(path.dirname(SUITE_KIND_MARKER), { recursive: true });
  fs.writeFileSync(SUITE_KIND_MARKER, kind, 'utf-8');
  process.env.QA_SUITE = kind;
}

/**
 * A full suite is `npm run test:qa` / bare `playwright test`. Passing a spec
 * file or `--grep` is a partial run and must not replace the last full report.
 */
export function inferSuiteKind(): SuiteKind {
  const forced = process.env.QA_SUITE?.toLowerCase();
  if (forced === 'full' || forced === 'partial') return forced;
  if (fs.existsSync(SUITE_KIND_MARKER)) {
    const v = fs.readFileSync(SUITE_KIND_MARKER, 'utf-8').trim().toLowerCase();
    if (v === 'full' || v === 'partial') return v;
  }
  return inferSuiteKindFromArgv();
}

/** Copies the previous markdown/json report aside so a grep re-run cannot erase it. */
export function archiveCurrentReportIfPresent() {
  if (!fs.existsSync(REPORT_PATH)) return;
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(REPORT_PATH, path.join(HISTORY_DIR, `${stamp}-qa-audit-report.md`));
  if (fs.existsSync(FINDINGS_JSON)) {
    fs.copyFileSync(FINDINGS_JSON, path.join(HISTORY_DIR, `${stamp}-qa-findings.json`));
  }
}

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Every defect class the crawler can prove. Each one maps to a concrete
 * "expected vs actual" statement — we never report a symptom without saying
 * what the desired result was.
 */
export type DefectCategory =
  | 'DROPDOWN_DID_NOT_OPEN'
  | 'DROPDOWN_OPENED_BUT_INVISIBLE'
  | 'DROPDOWN_OCCLUDED'
  | 'DROPDOWN_NOT_SELECTABLE'
  | 'NAVIGATION_DID_NOTHING'
  | 'NAVIGATION_WRONG_RESULT'
  | 'TAB_SWITCH_WRONG_RESULT'
  | 'ERROR_SCREEN'
  | 'VIEW_RENDERED_EMPTY'
  | 'INTERACTION_FAILED'
  | 'FORM_FIELD_NOT_FILLABLE'
  | 'FORM_SUBMIT_WRONG_RESULT'
  | 'MODAL_WOULD_NOT_CLOSE'
  | 'CONSOLE_ERROR'
  | 'UNCAUGHT_EXCEPTION';

const CATEGORY_PREFIX: Record<DefectCategory, string> = {
  DROPDOWN_DID_NOT_OPEN: 'DDNO',
  DROPDOWN_OPENED_BUT_INVISIBLE: 'DDIV',
  DROPDOWN_OCCLUDED: 'DDOC',
  DROPDOWN_NOT_SELECTABLE: 'DDNS',
  NAVIGATION_DID_NOTHING: 'NAV0',
  NAVIGATION_WRONG_RESULT: 'NAVW',
  TAB_SWITCH_WRONG_RESULT: 'TABW',
  ERROR_SCREEN: 'ERRS',
  VIEW_RENDERED_EMPTY: 'BLNK',
  INTERACTION_FAILED: 'INTF',
  FORM_FIELD_NOT_FILLABLE: 'FLDF',
  FORM_SUBMIT_WRONG_RESULT: 'SUBW',
  MODAL_WOULD_NOT_CLOSE: 'MODC',
  CONSOLE_ERROR: 'CONS',
  UNCAUGHT_EXCEPTION: 'EXCP',
};

export interface QAFinding {
  /** Stable across runs: derived from module + target + action + category. */
  id: string;
  module: string;
  /** The specific control or element acted upon, named the way a human sees it. */
  target: string;
  /** What the crawler did. */
  action: string;
  /** The desired result of that action. */
  expected: string;
  /** What actually happened. */
  actual: string;
  category: DefectCategory;
  severity: Severity;
  /** Machine-gathered evidence: geometry, stacking contexts, DOM tags. */
  details?: string;
  /** Concrete, source-aware remediation. */
  proposedFix?: string;
  screenshotPath?: string;
  consoleErrors?: string[];
  url?: string;
}

export interface QAPass {
  module: string;
  action: string;
}

export interface CollectedData {
  findings: QAFinding[];
  passes: QAPass[];
}

function stableId(f: Pick<QAFinding, 'module' | 'target' | 'action' | 'category'>): string {
  const basis = `${f.module}::${f.target}::${f.action}::${f.category}`;
  const hash = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8).toUpperCase();
  return `${CATEGORY_PREFIX[f.category]}-${hash}`;
}

/**
 * Per-worker findings sink.
 *
 * Each Playwright worker owns its own file so runs can go parallel without
 * racing on a single JSON blob. `globalTeardown` merges every worker file into
 * the final markdown report.
 */
class Collector {
  private findings: QAFinding[] = [];
  private passes: QAPass[] = [];
  private scopeIds = new Set<string>();
  private readonly file: string;

  constructor() {
    this.file = path.join(FINDINGS_DIR, `worker-${process.pid}-${crypto.randomBytes(3).toString('hex')}.json`);
  }

  /** Starts tracking findings for one test, so that test can fail on its own defects. */
  beginScope() {
    this.scopeIds.clear();
  }

  /** Findings discovered since the last `beginScope()`. */
  scopeFindings(): QAFinding[] {
    return this.findings.filter((f) => this.scopeIds.has(f.id));
  }

  /** Findings in the current scope at or above the given severity. */
  scopeFindingsAtLeast(minimum: Severity): QAFinding[] {
    return this.scopeFindings().filter((f) => SEVERITY_RANK[f.severity] <= SEVERITY_RANK[minimum]);
  }

  pass(module: string, action: string) {
    this.passes.push({ module, action });
    this.flush();
  }

  record(input: Omit<QAFinding, 'id'>): QAFinding {
    const id = stableId(input);
    this.scopeIds.add(id);
    const existing = this.findings.find((f) => f.id === id);
    if (existing) return existing;
    const finding: QAFinding = { id, ...input };
    this.findings.push(finding);
    this.flush();
    return finding;
  }

  private flush() {
    fs.mkdirSync(FINDINGS_DIR, { recursive: true });
    const payload: CollectedData = { findings: this.findings, passes: this.passes };
    fs.writeFileSync(this.file, JSON.stringify(payload, null, 2), 'utf-8');
  }
}

export const QAReport = new Collector();

/** Human-readable one-liner used in the thrown error that fails a test. */
export function formatFindingLine(f: QAFinding): string {
  return `[${f.severity}] ${f.id} ${f.module} › ${f.target}\n    action:   ${f.action}\n    expected: ${f.expected}\n    actual:   ${f.actual}`;
}

export function readAllFindings(): CollectedData {
  const merged: CollectedData = { findings: [], passes: [] };
  if (!fs.existsSync(FINDINGS_DIR)) return merged;
  const seen = new Set<string>();
  for (const name of fs.readdirSync(FINDINGS_DIR)) {
    if (!name.endsWith('.json')) continue;
    try {
      const data: CollectedData = JSON.parse(fs.readFileSync(path.join(FINDINGS_DIR, name), 'utf-8'));
      for (const f of data.findings ?? []) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        merged.findings.push(f);
      }
      merged.passes.push(...(data.passes ?? []));
    } catch {
      // A truncated worker file must not sink the whole report.
    }
  }
  merged.findings.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.module.localeCompare(b.module),
  );
  return merged;
}

export function generateMarkdownReport(): { markdown: string; data: CollectedData; suiteKind: SuiteKind } {
  const data = readAllFindings();
  const suiteKind = inferSuiteKind();
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of data.findings) counts[f.severity]++;

  let md = `# CCRM Automated QA Audit Report\n\n`;
  md += `**Generated**: ${new Date().toISOString()}\n\n`;
  md += `**Suite**: ${suiteKind}`;
  if (suiteKind === 'partial') {
    md += ` — this run was filtered; the last complete audit is \`test-results/qa-audit-report-latest-full.md\` if one exists.`;
  } else {
    md += ` — also copied to \`test-results/qa-audit-report-latest-full.md\`.`;
  }
  md += `\n\n`;
  md += `**Checks passed**: ${data.passes.length} · **Defects found**: ${data.findings.length}`;
  md += ` (Critical ${counts.CRITICAL} · High ${counts.HIGH} · Medium ${counts.MEDIUM} · Low ${counts.LOW})\n\n`;

  if (data.findings.length === 0) {
    md += `> No defects found. Every navigated view rendered, every discovered control responded, `;
    md += `every dropdown opened visibly, and every submitted form produced its expected result.\n`;
  } else {
    md += `Every entry below is an action whose **actual** result differed from its **expected** result.\n\n`;
    md += `| ID | Severity | Module | Target | Problem |\n|---|---|---|---|---|\n`;
    for (const f of data.findings) {
      md += `| \`${f.id}\` | ${f.severity} | ${f.module} | ${f.target} | ${f.category} |\n`;
    }
    md += `\n---\n\n## Defect detail\n\n`;

    data.findings.forEach((f, i) => {
      md += `### ${i + 1}. \`${f.id}\` — ${f.module} › ${f.target}\n\n`;
      md += `- **Severity**: ${f.severity}\n`;
      md += `- **Category**: \`${f.category}\`\n`;
      md += `- **Action performed**: ${f.action}\n`;
      md += `- **Expected result**: ${f.expected}\n`;
      md += `- **Actual result**: ${f.actual}\n`;
      if (f.url) md += `- **URL**: \`${f.url}\`\n`;
      if (f.details) md += `- **Evidence**: ${f.details}\n`;
      if (f.consoleErrors?.length) {
        md += `- **Console output**:\n`;
        for (const e of f.consoleErrors) md += `  - \`${e.replace(/\s+/g, ' ').slice(0, 300)}\`\n`;
      }
      if (f.screenshotPath) md += `- **Screenshot**: \`${f.screenshotPath}\`\n`;
      if (f.proposedFix) md += `\n  **Proposed fix**\n\n${indentBlock(f.proposedFix)}\n`;
      md += `\n`;
    });
  }

  if (data.passes.length > 0) {
    md += `---\n\n<details>\n<summary>Passed checks (${data.passes.length})</summary>\n\n`;
    for (const p of data.passes) md += `- ${p.module} — ${p.action}\n`;
    md += `\n</details>\n`;
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, UTF8_BOM + md, 'utf-8');
  fs.writeFileSync(FINDINGS_JSON, JSON.stringify(data, null, 2), 'utf-8');
  if (suiteKind === 'full') {
    fs.writeFileSync(LATEST_FULL_REPORT, UTF8_BOM + md, 'utf-8');
    fs.writeFileSync(LATEST_FULL_JSON, JSON.stringify(data, null, 2), 'utf-8');
  }
  return { markdown: md, data, suiteKind };
}

function indentBlock(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
