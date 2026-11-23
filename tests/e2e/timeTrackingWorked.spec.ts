import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Time tracking v2, worked time (docs/TIME-TRACKING-V2.md, D1, D9): two entries of one person that
 * run in parallel share their clock time, so a day total reads "Worked · Delivered". The backend
 * is mocked; tests/e2e/helpers/timeTrackingMock.ts settles `workedMs` like the real server.
 *
 * The seed already holds 1:30 and 0:45 of Erik's today (08:00-09:30, 10:00-10:45), no overlap.
 * This spec adds two overlapping hours, 06:00-07:00 on different projects: 2:00 delivered,
 * 1:00 worked. Day total: worked 2:15 + 1:00 = 3:15, delivered 2:15 + 2:00 = 4:15.
 */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function addParallelHour(page: Page, projectId: string, description: string) {
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

test.describe('Time tracking: worked time', () => {
  test('two parallel hours show Worked 1:00 on top of Delivered 2:00 in the List day total, and "of your time" on the rows', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await addParallelHour(page, 'project-1', 'Paralelná A');
    await addParallelHour(page, 'project-2', 'Paralelná B');
    await gotoView(page, '#time-tracking');

    const header = page.locator(`[data-testid="day-card-header"][data-date="${today()}"]`);
    // Worked and Delivered are labelled in the workspace language (Slovak here).
    await expect(header.getByTestId('worked-delivered')).toHaveText(
      /(Worked|Odpracované|Ledolgozott) 3:15:00 · (Delivered|Dodané|Leszállított) 4:15:00/,
    );

    // Each of the two parallel hours carries 0:30 of the person's own time.
    const row = (text: string) => page.getByTestId('time-entry-row').filter({ hasText: text });
    await expect(row('Paralelná A').getByTestId('time-entry-worked')).toHaveText(/0:30/);
    await expect(row('Paralelná B').getByTestId('time-entry-worked')).toHaveText(/0:30/);
    // A row that ran alone has no such line.
    await expect(row('Návrh cenovej ponuky').getByTestId('time-entry-worked')).toHaveCount(0);
  });
});
