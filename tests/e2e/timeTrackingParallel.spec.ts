import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Time tracking v2, parallel timers (docs/TIME-TRACKING-V2.md D5, A2 UI): with `settings.parallel.enabled`
 * a second Start asks "Switch / Run in parallel"; the container lists every running row, the header pill
 * counts the extra ones, and overlapping entries draw as one cluster. With parallel off a second Start
 * switches. The backend is mocked (tests/e2e/helpers/timeTrackingMock.ts).
 *
 * Seed (Erik, today): "Návrh cenovej ponuky" 08:00-09:30 and a task entry 10:00-10:45, no overlap.
 */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function setParallel(page: Page, enabled: boolean) {
  await page.evaluate(async (enabled) => {
    const res = await fetch('/api/time_entries.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settings', settings: { parallel: { enabled, maxParallel: 4, sameProject: 'differentTasks' } } }),
    });
    if (!res.ok) throw new Error(`settings failed: ${res.status}`);
  }, enabled);
}

async function addHour(page: Page, projectId: string, description: string) {
  await page.evaluate(async ({ projectId, description }) => {
    const at = (h: number) => {
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      return d.toISOString();
    };
    const res = await fetch('/api/time_entries.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', projectId, description, startAt: at(6), endAt: at(7), billable: true, source: 'manual' }),
    });
    if (!res.ok) throw new Error(`create failed: ${res.status}`);
  }, { projectId, description });
}

/** Starts a free-text timer from the bar, then ▶ Continue on the seeded "Návrh cenovej ponuky" row. */
async function startTwoTimers(page: Page) {
  await page.getByTestId('timer-title').fill('Prvá práca');
  await page.getByTestId('timer-start').click();
  await expect(page.getByTestId('header-timer-running')).toContainText('Prvá práca');
  const seeded = page.getByTestId('time-entry-row').filter({ hasText: 'Návrh cenovej ponuky' });
  await seeded.hover();
  await seeded.getByTestId('time-entry-continue').click();
}

test.describe('Time tracking: parallel timers', () => {
  test('Run in parallel: two rows in the container, "+1" in the header, stopping one leaves a single timer', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await setParallel(page, true);
    await gotoView(page, '#time-tracking');

    await startTwoTimers(page);
    await expect(page.getByTestId('start-mode-popover')).toBeVisible();
    await page.getByTestId('start-mode-parallel').click();

    await expect(page.getByTestId('timer-container-row')).toHaveCount(2);
    await expect(page.getByTestId('header-timer-extra')).toHaveText('+1');
    await expect(page.getByTestId('timer-container-worked')).toBeVisible();
    await expect(page.getByTestId('timer-container-delivered')).toBeVisible();

    await page.getByTestId('timer-container-stop').first().click();
    await expect(page.getByTestId('timer-container-row')).toHaveCount(1);
    await expect(page.getByTestId('header-timer-extra')).toHaveCount(0);
    await expect(page.getByTestId('header-timer-running')).toHaveCount(1);
  });

  test('Switch in the popover keeps one timer', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await setParallel(page, true);
    await gotoView(page, '#time-tracking');

    await startTwoTimers(page);
    await page.getByTestId('start-mode-switch').click();
    await expect(page.getByTestId('header-timer-running')).toContainText('Návrh cenovej ponuky');
    await expect(page.getByTestId('header-timer-extra')).toHaveCount(0);
  });

  test('overlapping entries: List day total shows Worked and Delivered, the List and the Calendar draw one cluster of 2', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await addHour(page, 'project-1', 'Paralelná A');
    await addHour(page, 'project-2', 'Paralelná B');
    await gotoView(page, '#time-tracking');

    const header = page.locator(`[data-testid="day-card-header"][data-date="${today()}"]`);
    await expect(header.getByTestId('worked-delivered')).toHaveText(
      /(Worked|Odpracované|Ledolgozott) 3:15:00 · (Delivered|Dodané|Leszállított) 4:15:00/,
    );
    await expect(page.getByTestId('cluster-group').first()).toHaveAttribute('data-count', '2');

    await gotoView(page, '#time-tracking/calendar');
    await expect(page.getByTestId('cluster-frame').first()).toHaveAttribute('data-count', '2');
  });

  test('with parallel off a second Start switches: one timer, no popover', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await setParallel(page, false);
    await gotoView(page, '#time-tracking');

    await startTwoTimers(page);
    await expect(page.getByTestId('header-timer-running')).toContainText('Návrh cenovej ponuky');
    await expect(page.getByTestId('start-mode-popover')).toHaveCount(0);
    await expect(page.locator('[data-testid="header-timer-running"]')).toHaveCount(1);
    await expect(page.getByTestId('header-timer-extra')).toHaveCount(0);
  });
});
