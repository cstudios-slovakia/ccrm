import { test } from '@playwright/test';
import { QAReport } from './helpers/reportCollector';
import { assertNoDefectsFound } from './helpers/gate';
import { ViewCrawler } from './helpers/uiExplorer';
import { dismissOverlays, gotoView, startSession, type ConsoleCapture } from './helpers/appDriver';

/**
 * One test per module. Each drives the coverage ladder declared in
 * `.agents/skills/ccrm-qa-audit/SKILL.md` and fails on any high-severity
 * defect it discovers.
 *
 * `#dashboard` (the widget dashboard) and `#tasks` (the kanban task panel) are
 * separate views and are both crawled.
 */

interface ModuleUnderTest {
  name: string;
  hash: string;
  /** Registers whose rows open a detail view worth drilling into. */
  drilldown?: boolean;
}

const MODULES: ModuleUnderTest[] = [
  { name: 'Dashboard', hash: '#dashboard' },
  { name: 'Tasks', hash: '#tasks' },
  { name: 'Leads / Pipeline', hash: '#leads', drilldown: true },
  { name: 'Clients Register', hash: '#clients', drilldown: true },
  { name: 'Projects', hash: '#projects', drilldown: true },
  { name: 'Warehouse', hash: '#warehouse', drilldown: true },
  { name: 'Financial Management', hash: '#financial', drilldown: true },
  { name: 'Meeting Room', hash: '#meetings' },
  { name: 'Files Manager', hash: '#files', drilldown: true },
  { name: 'Email Hub', hash: '#email' },
  { name: 'Automation', hash: '#automation' },
  { name: 'Update Notes', hash: '#updates' },
  { name: 'System Settings', hash: '#settings' },
];

test.describe('Deep UI audit', () => {
  let consoleCapture: ConsoleCapture;

  test.beforeEach(async ({ page }) => {
    QAReport.beginScope();
    consoleCapture = await startSession(page);
  });

  for (const mod of MODULES) {
    test(`${mod.name} (${mod.hash})`, async ({ page }) => {
      const crawler = new ViewCrawler(page, mod.name, consoleCapture);

      await gotoView(page, mod.hash);
      await crawler.assertViewHealthy(mod.name, `Opening ${mod.hash} renders the ${mod.name} module.`);
      crawler.drainConsole(`${mod.name} initial load`);

      // 1. Tab strips: switching panels actually works and stays healthy.
      await crawler.auditTabStrips(mod.name);
      await dismissOverlays(page);

      // 2. Record detail + deep-link routing (first-row drill-down).
      if (mod.drilldown) {
        await gotoView(page, mod.hash);
        await crawler.auditRecordDrilldown(mod.hash);
      }

      // 3. Create forms: labeled create buttons first (header + main), every
      //    field, every dropdown in the form (no cap), then submit.
      await gotoView(page, mod.hash);
      await crawler.auditCreateFlows(mod.name);
      await dismissOverlays(page);

      // 4. One edit drawer per module.
      await gotoView(page, mod.hash);
      await crawler.auditEditFlows(mod.name);
      await dismissOverlays(page);

      // 5. Page-level dropdowns last, since choosing a filter mutates the view.
      await gotoView(page, mod.hash);
      await crawler.auditAllDropdowns(page.locator('main'), `${mod.name} (page controls)`, { select: true });
      await crawler.auditNativeSelects(page.locator('main'), `${mod.name} (page controls)`);

      crawler.drainConsole(`${mod.name} audit`);
      assertNoDefectsFound();
    });
  }
});
