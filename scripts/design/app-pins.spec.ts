import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * TEMPLATE, not a test. App screenshots (QA mock data, Normal view size) with numbered pins, to set
 * beside canvas renders from `render-canvas.mjs`.
 *
 * To use: copy it into `tests/e2e/` under a temporary name tagged with your session (e.g.
 * `zz-tt-pins-<tag>.spec.ts`), edit the shots, run it under the QA lock (one Chromium, port 5273):
 *   npx playwright test tests/e2e/zz-tt-pins-<tag>.spec.ts --workers=1
 * wrapped in `admitRun()` / `releaseRunLock()` from `scripts/qa/admission.mjs` (see
 * `scripts/capture-module-screenshots.mjs` for the pattern). Set TT_SHOTS_DIR to choose the output
 * folder. Delete the copy afterwards; never commit it under tests/e2e/.
 */
const OUT = process.env.TT_SHOTS_DIR ?? path.resolve('test-results/tt-pins');
mkdirSync(OUT, { recursive: true });

type Pin = { n: string; sel?: string; text?: string; up?: number; nth?: number; color?: string };

async function pins(page: Page, list: Pin[]) {
  await page.evaluate((pinsIn) => {
    document.querySelectorAll('[data-pin]').forEach((e) => e.remove());
    const all = [...document.querySelectorAll('body *')];
    for (const pin of pinsIn) {
      let el: Element | undefined;
      if (pin.sel) el = [...document.querySelectorAll(pin.sel)].filter((e) => e.getBoundingClientRect().width > 0)[pin.nth || 0];
      else {
        const hits = all.filter((e) => (e.textContent || '').replace(/\s+/g, ' ').includes(pin.text!) && e.getBoundingClientRect().width > 0);
        el = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)))[pin.nth || 0];
      }
      if (!el) { console.log(`PIN ${pin.n} not found`); continue; }
      for (let i = 0; i < (pin.up || 0); i++) el = el.parentElement || el;
      const r = el.getBoundingClientRect();
      const c = pin.color || '#2563eb';
      const box = document.createElement('div');
      box.setAttribute('data-pin', '1');
      Object.assign(box.style, { position: 'absolute', left: `${r.left + scrollX - 4}px`, top: `${r.top + scrollY - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`, border: `3px solid ${c}`, borderRadius: '10px', zIndex: '2147483647', pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(255,255,255,.8)' });
      const badge = document.createElement('div');
      badge.textContent = pin.n;
      Object.assign(badge.style, { position: 'absolute', left: '-14px', top: '-14px', minWidth: '26px', height: '26px', padding: '0 6px', borderRadius: '13px', background: c, color: '#fff', font: '700 14px/26px system-ui, sans-serif', textAlign: 'center' });
      box.appendChild(badge);
      document.body.appendChild(box);
    }
  }, list);
}

async function setup(page: Page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('ccrm_view_size', 'normal'); window.sessionStorage.setItem('ccrm_notif_banner_dismissed', '1'); } catch { /* ignore */ }
  });
  page.on('console', (m) => { if (m.text().startsWith('PIN')) console.log(m.text()); });
  await startSession(page);
}

async function shot(page: Page, name: string, list: Pin[], fullPage = false) {
  await page.waitForTimeout(900);
  await pins(page, list);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

test.describe('tt pins', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('desktop', async ({ page }) => {
    test.setTimeout(300_000);
    await setup(page);

    // A1 calendar popover
    await gotoView(page, '#time-tracking/calendar');
    await page.getByTestId('calendar-block').first().click().catch(() => {});
    await shot(page, 'a-calendar', [{ n: 'A1', sel: '[data-cal-popover]' }]);

    // A2 timesheet columns
    await gotoView(page, '#time-tracking/timesheet');
    await shot(page, 'a-timesheet', [{ n: 'A2', sel: '[data-testid="time-timesheet"] thead tr' }]);

    // A3/A4 reports summary
    await gotoView(page, '#time-tracking/reports');
    await shot(page, 'a-reports', [{ n: 'A3', text: 'Rozdelenie mzdy' }, { n: 'A4', sel: 'table' }], true);

    // A5 salary allocation utilisation
    await page.getByRole('button', { name: /Salary allocation|Rozdelenie mzdy|Bérfelosztás/ }).click().catch(() => {});
    await shot(page, 'a-salary', [{ n: 'A5', sel: '[data-testid="salary-report"] table thead th:last-child' }], true);

    // A6 team role badges
    await gotoView(page, '#time-tracking/team');
    await shot(page, 'a-team', [{ n: 'A6', sel: '[data-testid="team-matrix"] tbody th', nth: 0 }, { n: 'A6', sel: '[data-testid="team-matrix"] tbody th', nth: 1 }]);

    // A9 tags, A10 create project form (entry drawer)
    await gotoView(page, '#time-tracking');
    await page.getByTestId('time-entry-row').first().getByTestId('time-entry-title').click();
    await page.getByTestId('entry-drawer').waitFor();
    await shot(page, 'a-drawer-tags', [{ n: 'A9', text: 'comma, separated', up: 0, sel: '[data-testid="entry-drawer"] input[placeholder*=","]' }]);
    await page.getByTestId('entry-drawer').getByTestId('project-picker-trigger').click().catch(() => {});
    await page.getByTestId('project-picker-panel').locator('input').first().fill('Nový projekt').catch(() => {});
    await page.getByTestId('project-create-open').click().catch(() => {});
    await shot(page, 'a-drawer-create', [{ n: 'A10', sel: '[data-testid="project-picker-panel"]' }]);

    // A8 task drawer time section
    await gotoView(page, '#tasks');
    await page.getByRole('button', { name: /Budúce|Future|Jövőbeli/ }).click().catch(() => {});
    await page.getByTestId('task-card').filter({ hasText: 'Objednať krytinu' }).getByText('Objednať krytinu').first().click().catch(() => {});
    await page.getByTestId('task-time-start').scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, 'a-task', [{ n: 'A8', sel: '[data-testid="task-add-time"]', up: 2 }]);
  });

  test('phone', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: test.info().project.use.baseURL });
    const page = await ctx.newPage();
    await setup(page);
    await gotoView(page, '#time-tracking');
    await shot(page, 'a-phone', [{ n: 'A7', sel: '[data-testid="time-entry-row"]', up: 2 }]);
    await ctx.close();
  });
});
