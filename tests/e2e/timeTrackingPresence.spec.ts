import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Time tracking v2, presence cycle (docs/TIME-TRACKING-V2.md D7, D8.1, D8.2, C6, C8, C9): the ring on the
 * header pill, the "Still working?" dialog at minute 50, the paused state after the deadline, Resume, the
 * second tab and the off switch. The backend is mocked (tests/e2e/helpers/timeTrackingMock.ts): a spec moves
 * the cycle with `window.__ttPresence = { minutesIn, enabled }`, which the mock reads on the next running-set
 * read. A focus event makes the app do that read without a reload (a reload would lose the window variable).
 */

type Override = { minutesIn?: number; enabled?: boolean };

/** Sets the mock's override and makes the app re-read the running set. */
async function nudge(page: Page, override: Override) {
  await page.evaluate((o) => {
    (window as unknown as { __ttPresence?: Override }).__ttPresence = o;
    window.dispatchEvent(new Event('focus'));
  }, override);
}

async function startTimer(page: Page, title: string) {
  await page.getByTestId('timer-title').fill(title);
  await page.getByTestId('timer-start').click();
  await expect(page.getByTestId('header-timer-running')).toContainText(title);
}

test.describe('Time tracking: presence', () => {
  test('ring tracks, dialog asks at minute 50, Still working restarts the cycle', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await startTimer(page, 'Prezencia');

    await expect(page.getByTestId('cycle-ring').first()).toHaveAttribute('data-phase', 'tracking');
    await expect(page.getByTestId('presence-dialog')).toHaveCount(0);

    await nudge(page, { minutesIn: 51 });
    const dialog = page.getByTestId('presence-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-phase', 'question');
    await expect(page.getByTestId('presence-countdown')).toContainText(/\d:\d\d/);
    await expect(page.getByTestId('cycle-ring').first()).toHaveAttribute('data-phase', 'question');
    await expect.poll(() => page.title()).toMatch(/^⏰/);

    await page.getByTestId('presence-confirm').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('cycle-ring').first()).toHaveAttribute('data-phase', 'tracking');
    await expect.poll(() => page.title()).not.toMatch(/^⏰/);
    await expect(page.getByTestId('header-timer-running')).toContainText('Prezencia');
  });

  test('no answer pauses the timer, Resume starts a new running entry', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await startTimer(page, 'Bez odpovede');

    await nudge(page, { minutesIn: 61 });
    const dialog = page.getByTestId('presence-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-phase', 'paused');
    await expect(page.getByTestId('header-timer-running')).toHaveCount(0);
    await expect.poll(() => page.title()).toMatch(/^⏸/);

    await page.getByTestId('presence-resume').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('header-timer-running')).toContainText('Bez odpovede');
    await expect(page.getByTestId('cycle-ring').first()).toHaveAttribute('data-phase', 'tracking');

    // The paused entry was closed at the prompt, the resumed one runs: two rows with that title.
    await gotoView(page, '#time-tracking');
    await expect(page.getByTestId('time-entry-row').filter({ hasText: 'Bez odpovede' })).toHaveCount(2);
  });

  test('an answer in one tab closes the question in the other tab', async ({ page, context }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await startTimer(page, 'Dve karty');

    // Each page has its own mocked backend, so the second tab starts its own timer; the tab channel is shared per user.
    const other = await context.newPage();
    await startSession(other);
    await gotoView(other, '#time-tracking');
    await startTimer(other, 'Dve karty');

    await nudge(page, { minutesIn: 51 });
    await nudge(other, { minutesIn: 51 });
    await expect(page.getByTestId('presence-dialog')).toBeVisible();
    await expect(other.getByTestId('presence-dialog')).toBeVisible();

    await page.getByTestId('presence-confirm').click();
    await expect(page.getByTestId('presence-dialog')).toHaveCount(0);
    await expect(other.getByTestId('presence-dialog')).toHaveCount(0, { timeout: 5000 });
    await other.close();
  });

  test('with presence disabled there is no ring and no dialog', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await nudge(page, { enabled: false });
    await startTimer(page, 'Bez kontroly');

    await nudge(page, { minutesIn: 61, enabled: false });
    await expect(page.getByTestId('header-timer-running')).toContainText('Bez kontroly');
    await expect(page.getByTestId('cycle-ring')).toHaveCount(0);
    await expect(page.getByTestId('presence-dialog')).toHaveCount(0);
  });
});
