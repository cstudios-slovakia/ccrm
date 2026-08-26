import fs from 'fs';
import path from 'path';

export interface QAFailure {
  id: string;
  module: string;
  action: string;
  errorType: 'VISUAL_DEFECT' | 'UNHANDLED_EXCEPTION' | 'ROUTE_OR_LOOKUP_ERROR' | 'INTERACTION_FAILURE';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  symptom: string;
  expected: string;
  actual: string;
  screenshotPath?: string;
  consoleErrors?: string[];
  codeLocation?: string;
  proposedFix?: string;
}

const DATA_FILE = path.resolve('test-results', 'qa-collected-data.json');

function loadCollectedData(): { failures: QAFailure[]; passedSteps: string[] } {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { failures: [], passedSteps: [] };
}

function saveCollectedData(data: { failures: QAFailure[]; passedSteps: string[] }) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

export class QAReportCollector {
  static recordPass(step: string) {
    const data = loadCollectedData();
    data.passedSteps.push(step);
    saveCollectedData(data);
  }

  static recordFailure(failure: QAFailure) {
    const data = loadCollectedData();
    // Avoid duplicate failures by ID
    const exists = data.failures.some(f => f.id === failure.id);
    if (!exists) {
      data.failures.push(failure);
    }
    saveCollectedData(data);
  }

  static clear() {
    saveCollectedData({ failures: [], passedSteps: [] });
  }

  static generateMarkdownReport(outputPath: string = 'test-results/qa-audit-report.md'): string {
    const data = loadCollectedData();
    const total = data.passedSteps.length + data.failures.length;
    const passed = data.passedSteps.length;
    const failed = data.failures.length;

    let md = `# CCRM Automated QA Audit Report\n\n`;
    md += `**Generated At**: ${new Date().toISOString()}\n`;
    md += `**Total Checks Run**: ${total} | **Passed**: ${passed} | **Issues Found**: ${failed}\n\n`;

    if (failed === 0) {
      md += `> [!NOTE]\n> All scanned views, buttons, modals, and user flows completed successfully with zero defects detected.\n\n`;
      return md;
    }

    md += `## ❌ Discovered Defects & Recommendations\n\n`;

    data.failures.forEach((f, idx) => {
      md += `### ${idx + 1}. [${f.severity}] ${f.module} — ${f.action}\n\n`;
      md += `- **Defect ID**: \`${f.id}\`\n`;
      md += `- **Defect Category**: \`${f.errorType}\`\n`;
      md += `- **Observed Symptom**: ${f.symptom}\n`;
      md += `- **Expected Behavior**: ${f.expected}\n`;
      md += `- **Actual Outcome**: ${f.actual}\n`;
      if (f.codeLocation) {
        md += `- **Code Location**: \`${f.codeLocation}\`\n`;
      }
      if (f.screenshotPath) {
        md += `- **Screenshot**: \`${f.screenshotPath}\`\n`;
      }
      if (f.consoleErrors && f.consoleErrors.length > 0) {
        md += `- **Console Errors Captured**:\n`;
        f.consoleErrors.forEach((err) => {
          md += `  \`\`\`text\n  ${err}\n  \`\`\`\n`;
        });
      }
      if (f.proposedFix) {
        md += `\n**💡 Proposed Code Fix**:\n${f.proposedFix}\n`;
      }
      md += `\n---\n\n`;
    });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, md, 'utf-8');
    return md;
  }
}
