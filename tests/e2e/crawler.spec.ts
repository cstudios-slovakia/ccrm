import { test, expect } from '@playwright/test';
import { seedAuthSession, ensureAuthenticated } from './helpers/auth';
import { QAReportCollector } from './helpers/reportCollector';

test.describe('Automated App Exploration & UI/UX Crawler', () => {
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
    test(`Crawl & Audit View: ${r.name} (${r.hash})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      await ensureAuthenticated(page, r.hash);
      await page.waitForTimeout(400);

      // 1. Verify view container rendered
      const rootApp = page.locator('#root');
      await expect(rootApp).toBeVisible({ timeout: 10000 });
      QAReportCollector.recordPass(`Route ${r.name} rendered without crash`);

      // 2. Check for universal error banners
      const errorBanner = page.locator('div.border-red-400:has(h2), [role="alert"].bg-rose-50');
      const hasError = (await errorBanner.count()) > 0 && (await errorBanner.first().isVisible().catch(() => false));
      if (hasError) {
        const text = await errorBanner.first().innerText().catch(() => 'Error banner');
        QAReportCollector.recordFailure({
          id: `CRAWL-${r.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}-001`,
          module: r.name,
          action: `Navigate to route ${r.hash}`,
          errorType: 'ROUTE_OR_LOOKUP_ERROR',
          severity: 'HIGH',
          symptom: `Error screen encountered upon loading view: ${text.slice(0, 100)}`,
          expected: `Route ${r.name} should display active data and functional UI components.`,
          actual: text,
          consoleErrors: consoleErrors.slice(0, 5),
        });
      }

      // 3. Test Header Action Buttons on this view
      const headerButtons = page.locator('header button');
      const btnCount = await headerButtons.count();
      const testLimit = Math.min(btnCount, 5);

      for (let i = 0; i < testLimit; i++) {
        const btn = headerButtons.nth(i);
        if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
          const btnText = (await btn.innerText().catch(() => '')) || 'IconBtn';
          if (!/zmazať|delete|odhlásiť|logout|trash/i.test(btnText)) {
            await btn.hover().catch(() => {});
          }
        }
      }
      QAReportCollector.recordPass(`Exercised header controls on ${r.name}`);
    });
  }
});
