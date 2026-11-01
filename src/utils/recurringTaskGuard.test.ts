import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walkPhpFiles(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkPhpFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.php')) {
      results.push(full);
    }
  }
  return results;
}

const TASK_SQL_PATTERN = /\b(FROM|JOIN|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+[`]?tasks[`]?\b/gi;

interface ScanFinding {
  file: string;
  line: number;
  snippet: string;
}

export function scanContentForTaskLeaks(content: string, fileName = 'inline.php'): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const regex = new RegExp(TASK_SQL_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const line = content.slice(0, match.index).split('\n').length;
    // Window around match (+/- 500 characters) to look for ccrm_sql_real_tasks or /* recurring-template:
    const start = Math.max(0, match.index - 500);
    const end = Math.min(content.length, match.index + 500);
    const windowText = content.slice(start, end);

    const hasHelper = windowText.includes('ccrm_sql_real_tasks');
    const hasAnnotation = windowText.includes('/* recurring-template:');

    if (!hasHelper && !hasAnnotation) {
      findings.push({
        file: fileName,
        line,
        snippet: match[0].replace(/\s+/g, ' '),
      });
    }
  }

  return findings;
}

describe('Recurring Task Guard: Leak-proofing backend SQL queries', () => {
  it('scans all public/**/*.php and verifies every tasks SQL uses ccrm_sql_real_tasks() or an explicit annotation', () => {
    const publicDir = path.resolve(process.cwd(), 'public');
    const phpFiles = walkPhpFiles(publicDir);
    assert.ok(phpFiles.length > 10, 'Expected to find PHP files in public directory');

    const allFindings: ScanFinding[] = [];

    for (const file of phpFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(process.cwd(), file);
      const findings = scanContentForTaskLeaks(content, relPath);
      allFindings.push(...findings);
    }

    if (allFindings.length > 0) {
      const report = allFindings
        .map((f) => `  ${f.file}:${f.line} -> ${f.snippet}`)
        .join('\n');
      assert.fail(`Found ${allFindings.length} query/queries on \`tasks\` without ccrm_sql_real_tasks() or /* recurring-template: annotation:\n${report}`);
    }
  });

  it('fails on a deliberately broken query without helper or annotation', () => {
    const brokenSql = `$stmt = $pdo->prepare("SELECT * FROM tasks WHERE status = 'open' AND owner = ?");`;
    const findings = scanContentForTaskLeaks(brokenSql, 'broken_sample.php');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, 'broken_sample.php');
    assert.match(findings[0].snippet, /FROM tasks/i);
  });

  it('passes on queries using ccrm_sql_real_tasks() or /* recurring-template: annotations', () => {
    const validWithHelper = `$stmt = $pdo->prepare("SELECT * FROM \`tasks\` WHERE " . ccrm_sql_real_tasks() . " AND status = 'open'");`;
    assert.strictEqual(scanContentForTaskLeaks(validWithHelper).length, 0);

    const validWithAnnotation = `$stmt = $pdo->prepare("SELECT * FROM \`tasks\` WHERE id = ?"); /* recurring-template: template check */`;
    assert.strictEqual(scanContentForTaskLeaks(validWithAnnotation).length, 0);
  });
});
