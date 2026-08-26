import { test, expect } from '@playwright/test';
import { seedAuthSession, ensureAuthenticated } from './helpers/auth';
import { QAReportCollector } from './helpers/reportCollector';

test.describe('Client Register & Detail Sub-tabs QA', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthSession(page);
    await ensureAuthenticated(page, '#dashboard');
  });

  test.afterAll(() => {
    QAReportCollector.generateMarkdownReport();
  });

  test('Verify Client Detail Sub-tab URL Query Routing (Timeline, Files, Leads, Invoices)', async ({ page }) => {
    const tabsToTest = [
      { name: 'Časová os / Timeline', tabKey: 'timeline' },
      { name: 'Priložené súbory / Files', tabKey: 'files' },
      { name: 'Aktívne Leady / Leads', tabKey: 'leads' },
      { name: 'Faktúry a platby / Invoices', tabKey: 'invoices' },
    ];

    for (const tab of tabsToTest) {
      await page.goto(`/#client-Silvia?tab=${tab.tabKey}`);
      await page.waitForTimeout(400);

      // Check if the regression error banner "Profil klienta sa nenašiel" appears
      const errorBanner = page.locator('h2:has-text("Profil klienta sa nenašiel"), h2:has-text("Client Profile Not Found"), p:has-text("sa nepodarilo nájsť v aktívnej databáze")').first();
      const hasError = await errorBanner.isVisible().catch(() => false);

      if (hasError) {
        const errorText = await errorBanner.innerText().catch(() => 'Error banner visible');
        const screenshotPath = `test-results/screenshots/client-tab-${tab.tabKey}-defect.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });

        QAReportCollector.recordFailure({
          id: `CLIENT-SUBTAB-${tab.tabKey.toUpperCase()}-001`,
          module: 'Client Register / Detail View',
          action: `Open client detail sub-tab via URL '#client-Silvia?tab=${tab.tabKey}'`,
          errorType: 'ROUTE_OR_LOOKUP_ERROR',
          severity: 'HIGH',
          symptom: `When opening a client detail view with a sub-tab query parameter (?tab=${tab.tabKey}), route parsing in App.tsx line 1917 extracts 'Silvia?tab=${tab.tabKey}' as the client name. Because no lead exists with name 'Silvia?tab=${tab.tabKey}', database resolution in ClientsView.tsx fails and throws: "Profil klienta sa nenašiel: Názov profilu 'Silvia?tab=${tab.tabKey}' sa nepodarilo nájsť v aktívnej databáze."`,
          expected: `The client profile should resolve client name 'Silvia' and open directly into the '${tab.name}' sub-tab.`,
          actual: `Error banner thrown: "${errorText.trim().replace(/\n+/g, ' ')}"`,
          screenshotPath,
          codeLocation: 'src/App.tsx:1916-1918 & src/components/ClientsView.tsx:2563-2569',
          proposedFix: `In \`App.tsx\` line 1917, strip query string when extracting the client name: \`const rawClient = activeTab.replace("client-", ""); const clientName = decodeURIComponent(rawClient.split("?")[0]);\``,
        });

        console.warn(`⚠️ [QA Detected Defect] URL '#client-Silvia?tab=${tab.tabKey}' triggered Client Not Found error!`);
        expect(hasError, `Tab switch to ${tab.name} should not throw "Profil klienta sa nenašiel"`).toBe(false);
      } else {
        QAReportCollector.recordPass(`Loaded sub-tab "${tab.name}" successfully`);
      }
    }
  });
});
