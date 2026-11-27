import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Time tracking v2 phase 10(b): the phone container. At 390 px two running timers show one summary
 * button above the bottom bar; it opens a bottom sheet with a row per timer; stopping one leaves the
 * single card; with everything paused the bar shows "Paused / Resume". Backend mocked
 * (tests/e2e/helpers/timeTrackingMock.ts). Seed: "Návrh cenovej ponuky" 08:00-09:30 today.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function setParallel(page: Page) {
  await page.evaluate(async () => {
    const res = await fetch('/api/time_entries.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settings', settings: { requireProjectToStop: false, parallel: { enabled: true, maxParallel: 4, sameProject: 'differentTasks' } } }),
    });
    if (!res.ok) throw new Error(`settings failed: ${res.status}`);
  });
}

async function startTwoTimers(page: Page) {
  await page.getByTestId('timer-title').fill('Prvá práca');
  await page.getByTestId('timer-start').click();
  await expect(page.getByTestId('mobile-running-card')).toBeVisible();
  const seeded = page.getByTestId('time-entry-row').filter({ hasText: 'Návrh cenovej ponuky' });
  await seeded.hover();
  await seeded.getByTestId('time-entry-continue').click({ force: true });
  await page.getByTestId('start-mode-parallel').click();
}

async function twoTimersSession(page: Page) {
  await startSession(page);
  await gotoView(page, '#time-tracking');
  await setParallel(page);
  await gotoView(page, '#time-tracking');
  await startTwoTimers(page);
}

test.describe('Time tracking: phone container', () => {
  test('two timers: summary -> sheet with 2 rows -> stop one -> single card', async ({ page }) => {
    await twoTimersSession(page);

    await expect(page.getByTestId('mobile-running-summary')).toBeVisible();
    await page.getByTestId('mobile-running-summary').click();
    await expect(page.getByTestId('mobile-timer-sheet')).toBeVisible();
    await expect(page.getByTestId('mobile-timer-sheet-handle')).toBeVisible();
    await expect(page.getByTestId('mobile-timer-sheet').getByTestId('timer-container-row')).toHaveCount(2);

    await page.getByTestId('mobile-timer-sheet').getByTestId('timer-container-stop').first().click();
    await expect(page.getByTestId('mobile-timer-sheet')).toHaveCount(0);
    await expect(page.getByTestId('mobile-running-card')).toBeVisible();
  });

  test('"+ Add timer" shows the start inputs inside the sheet', async ({ page }) => {
    await twoTimersSession(page);

    await page.getByTestId('mobile-running-summary').click();
    await page.getByTestId('mobile-timer-sheet').getByTestId('timer-container-add').click();
    await expect(page.getByTestId('mobile-timer-sheet').getByTestId('timer-title')).toBeVisible();
    await page.getByTestId('mobile-timer-sheet-close').click();
    await expect(page.getByTestId('mobile-timer-sheet')).toHaveCount(0);
  });

  test('everything paused: the bar shows the Paused / Resume card', async ({ page }) => {
    await twoTimersSession(page);

    await page.getByTestId('mobile-running-summary').click();
    await page.getByTestId('mobile-timer-sheet').getByTestId('timer-container-pause-all').click();
    await page.getByTestId('mobile-timer-sheet-close').click();
    await expect(page.getByTestId('mobile-paused-card')).toBeVisible();
    await expect(page.getByTestId('mobile-paused-resume')).toBeVisible();
    await page.getByTestId('mobile-paused-resume').click();
    await expect(page.getByTestId('mobile-paused-card')).toHaveCount(0);
  });
});
