import { test } from '@playwright/test';
import { QAReport } from './helpers/reportCollector';
import { assertKnownBugDetected } from './helpers/gate';
import { ViewCrawler } from './helpers/uiExplorer';
import { analyzePanel } from './helpers/diagnostics';
import {
  SETTLE,
  gotoView,
  readViewState,
  startSession,
  waitForStableRect,
  type ConsoleCapture,
} from './helpers/appDriver';

/**
 * Harness acceptance tests. They PASS only when the suite still detects the
 * two sample product bugs this feature was built to catch.
 *
 * Do not "fix" a failure by loosening these checks. If the product bug is
 * gone, delete the canary.
 */

test.describe('Known-bug canaries', () => {
  let consoleCapture: ConsoleCapture;

  test.beforeEach(async ({ page }) => {
    QAReport.beginScope();
    consoleCapture = await startSession(page);
  });

  test('Čas termínu in the create-task drawer is reported as occluded or invisible', async ({
    page,
  }) => {
    const crawler = new ViewCrawler(page, 'Canary: create-task deadline time', consoleCapture);

    await gotoView(page, '#tasks');
    const create = page
      .locator('main')
      .getByRole('button', { name: /Vytvoriť novú úlohu|Create New Task|Új feladat/i })
      .first();
    if (!(await create.isVisible({ timeout: 4000 }).catch(() => false))) {
      throw new Error(
        'Canary could not find the create-task button on #tasks. The harness cannot prove Čas termínu.',
      );
    }
    await create.click({ timeout: 4000 });
    await page.waitForTimeout(SETTLE.overlay);

    const overlay = await crawler.markTopOverlay();
    if (!overlay) {
      throw new Error('Create-task did not open a drawer. The Čas termínu canary cannot run.');
    }

    const trigger = await crawler.findDropdownTriggerByLabel(
      overlay,
      /Čas\s*termín|Deadline Time|Határidő időpont/i,
    );
    if (!trigger) {
      throw new Error(
        'Create-task drawer opened but the Čas termínu dropdown was not found by label. ' +
          'The crawler would miss this bug.',
      );
    }

    await crawler.auditDropdown(trigger, 'the create-task form', { select: false });

    const detected = QAReport.scopeFindings().filter(
      (f) => f.category === 'DROPDOWN_OCCLUDED' || f.category === 'DROPDOWN_OPENED_BUT_INVISIBLE',
    );
    if (detected.length > 0) {
      assertKnownBugDetected(
        (f) => f.category === 'DROPDOWN_OCCLUDED' || f.category === 'DROPDOWN_OPENED_BUT_INVISIBLE',
        'Harness detected the known Čas termínu occlusion.',
      );
      return;
    }

    // Same detector the crawler uses, applied directly — distinguishes
    // "bug fixed" from "crawler missed it".
    const panel = page.locator('[role="listbox"]').last();
    const mounted = await panel.waitFor({ state: 'attached', timeout: 2000 }).then(
      () => true,
      () => false,
    );
    if (mounted) {
      await waitForStableRect(panel, 1500);
      const analysis = await analyzePanel(panel);
      const broken =
        !analysis.paintable ||
        analysis.outsideViewport ||
        analysis.occludedPoints > 0 ||
        Boolean(analysis.clippedBy);
      if (broken) {
        throw new Error(
          'Čas termínu is still occluded/invisible, but auditDropdown did not record DROPDOWN_OCCLUDED ' +
            'or DROPDOWN_OPENED_BUT_INVISIBLE. The harness detector missed the known bug.',
        );
      }
    }

    throw new Error(
      'The Čas termínu dropdown opened and is visible. If the product bug is fixed, delete this canary.',
    );
  });

  test("client profile timeline tab is reported as an error screen (Silvia?tab=timeline)", async ({
    page,
  }) => {
    const crawler = new ViewCrawler(page, 'Canary: client timeline tab', consoleCapture);

    await gotoView(page, '#clients');
    await crawler.auditRecordDrilldown('#clients');

    const viaCrawler = (f: { category: string; actual: string; url?: string; details?: string }) =>
      f.category === 'TAB_SWITCH_WRONG_RESULT' ||
      f.category === 'NAVIGATION_WRONG_RESULT' ||
      f.category === 'ERROR_SCREEN' ||
      /Silvia\?tab=/.test(`${f.actual} ${f.url ?? ''} ${f.details ?? ''}`);

    if (QAReport.scopeFindings().some(viaCrawler)) {
      assertKnownBugDetected(viaCrawler, 'Harness detected the known Silvia?tab=timeline error screen.');
      return;
    }

    await gotoView(page, '#clients');
    const row = page.locator('main table tbody tr').first();
    if (!(await row.isVisible({ timeout: 4000 }).catch(() => false))) {
      throw new Error('Clients register has no row to open. Fixture seeding is broken.');
    }
    await row.click({ timeout: 4000 });
    await page.waitForTimeout(SETTLE.overlay);

    const tab = page
      .locator('button')
      .filter({ hasText: /časová os|history timeline|chronological|histórie/i })
      .first();
    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tab.click({ timeout: 4000 });
      await page.waitForTimeout(SETTLE.content);
    } else {
      await gotoView(page, '#client-Silvia?tab=timeline');
    }

    const state = await readViewState(page);
    if (state.errorScreen) {
      throw new Error(
        'The client-tab bug still exists (error screen rendered) but the crawler did not record it. ' +
          `Screen: "${state.errorScreen}". Hash: ${state.hash}.`,
      );
    }

    throw new Error(
      'The client timeline tab did not render an error screen. If the product bug is fixed, delete this canary.',
    );
  });
});
