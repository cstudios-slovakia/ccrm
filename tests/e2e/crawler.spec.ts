import { test, expect } from '@playwright/test';
import { seedAuthSession, ensureAuthenticated } from './helpers/auth';
import { QAReportCollector } from './helpers/reportCollector';
import { UIExplorer } from './helpers/uiExplorer';

test.describe('Deep Autonomous UI/UX Crawler & Defect Discovery Engine', () => {
  const routes = [
    { name: 'Dashboard', hash: '#dashboard' },
    { name: 'Leads / Pipeline', hash: '#leads' },
    { name: 'Clients Register', hash: '#clients' },
    { name: 'Projects', hash: '#projects' },
    { name: 'Warehouse / Sklad', hash: '#warehouse' },
    { name: 'Financial Management', hash: '#financial' },
    { name: 'Meeting Room', hash: '#meetings' },
    { name: 'Files Manager', hash: '#files' },
    { name: 'Email Hub', hash: '#email' },
    { name: 'Automation', hash: '#automation' },
    { name: 'Update Notes', hash: '#updates' },
    { name: 'System Settings', hash: '#settings' },
  ];

  test.beforeEach(async ({ page }) => {
    await seedAuthSession(page);
  });

  test.afterAll(() => {
    QAReportCollector.generateMarkdownReport();
  });

  for (const r of routes) {
    test(`Deep Audit View: ${r.name} (${r.hash})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      // 1. Navigate to view
      await ensureAuthenticated(page, r.hash);
      await page.waitForTimeout(150);

      // 2. Base render & error banner check
      const rootApp = page.locator('#root');
      await expect(rootApp).toBeVisible({ timeout: 5000 });
      await UIExplorer.checkVisibleErrorBanners(page, `${r.name} (Initial Load)`);

      // 3. Sub-tabs & filter pills traversal
      await UIExplorer.auditSubTabs(page, r.name);

      // 4. Action buttons, modals, drawers & nested dropdown occlusion check
      await UIExplorer.auditModalsAndDrawers(page, r.name);

      // 5. Standalone page dropdown occlusion check
      await UIExplorer.auditAllDropdownsInContainer(page, page.locator('#root'), r.name);

      // 6. Datagrid row clicking & detail sub-view exploration
      await UIExplorer.auditTableRows(page, r.name);
      await UIExplorer.dismissAnyOpenModals(page);

      // 7. Verify no severe unhandled exceptions crashed the view
      const severeErrors = consoleErrors.filter(e => 
        !e.includes('favicon') && 
        !e.includes('404 (Not Found)') && 
        !e.includes('502 (Bad Gateway)')
      );
      if (severeErrors.length > 0) {
        QAReportCollector.recordFailure({
          id: `CONSOLE-ERR-${r.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}-${Date.now()}`,
          module: r.name,
          action: `Console error observation on ${r.name}`,
          errorType: 'CONSOLE_ERROR',
          severity: 'MEDIUM',
          symptom: `Unhandled JavaScript console errors detected during exploration of ${r.name}`,
          consoleErrors: severeErrors.slice(0, 5),
        });
      }

      QAReportCollector.recordPass(`Completed deep audit on ${r.name}`);
    });
  }
});
