import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * A task linked to a lead links straight to that lead — from the task card on
 * My Calendar and from the task drawer — so following a task to its client
 * does not mean leaving for the pipeline and searching for the name.
 */

const TASK_TITLE = 'Zavolať klientke Silvii';
const LEAD_NAME = 'Silvia';
const LEAD_HASH = '#lead-lead-silvia';

/** My Calendar → click the task's day → that day's task cards. */
async function openTaskDay(page: Page) {
  await gotoView(page, '#tasks');
  await page.getByText(TASK_TITLE).first().click();
}

const taskCard = (page: Page) =>
  page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: TASK_TITLE }) }).last();

async function expectLeadOpened(page: Page) {
  await expect.poll(() => new URL(page.url()).hash).toBe(LEAD_HASH);
  await expect(page.getByText(LEAD_NAME).first()).toBeVisible();
  await expect(page.getByText(/Client Profile Not Found|Profil klienta sa nenašiel/)).toHaveCount(0);
}

test.describe('Task → lead link', () => {
  test('the lead badge on a task card opens the lead', async ({ page }) => {
    await startSession(page);
    await openTaskDay(page);

    const link = taskCard(page).getByTestId('task-lead-link');
    await expect(link).toBeVisible();
    await expect(link).toContainText(LEAD_NAME);
    await expect(link).toHaveAttribute('href', LEAD_HASH);
    await page.screenshot({ path: 'test-results/task-lead-link.png', fullPage: false });

    await link.click();
    await expectLeadOpened(page);
  });

  test('the task drawer links to its saved lead', async ({ page }) => {
    await startSession(page);
    await openTaskDay(page);

    await taskCard(page).getByTitle(/^(Edit Task|Upraviť úlohu|Feladat szerkesztése|View Task|Zobraziť úlohu|Feladat megtekintése)$/).click();
    const drawer = page.locator('div.fixed.inset-0').filter({ hasText: /Edit Task|Upraviť úlohu|Feladat szerkesztése/ });
    const link = drawer.getByTestId('task-drawer-lead-link');
    await expect(link).toBeVisible();

    await link.click();
    await expectLeadOpened(page);
    await expect(drawer).toHaveCount(0);
  });
});
