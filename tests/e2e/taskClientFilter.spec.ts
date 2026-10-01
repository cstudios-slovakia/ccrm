import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Tasks can be filtered by the lead / client they are linked to — from the top
 * of the My Tasks calendar block as well as from the Global Tasks filter bar.
 */

const TASK_TITLE = 'Zavolať klientke Silvii';

test.describe('Tasks → client filter', () => {
  test('My Tasks shows the client filter and it narrows the calendar', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks');

    const filter = page.getByTestId('task-client-filter');
    await expect(filter).toBeVisible();
    await expect(page.getByText(TASK_TITLE).first()).toBeVisible();

    // Another client's filter hides Silvia's task…
    await filter.getByRole('button').first().click();
    await page.getByText('Novák Stavby s.r.o.', { exact: true }).click();
    await expect(page.getByText(TASK_TITLE)).toHaveCount(0);

    // …and Silvia's own brings it back.
    await filter.getByRole('button').first().click();
    await page.getByText('Silvia', { exact: true }).click();
    await expect(page.getByText(TASK_TITLE).first()).toBeVisible();
  });

  for (const scope of ['Týždeň', 'Časová os', 'Skryť']) {
    test(`the client filter is there in the "${scope}" scope too`, async ({ page }) => {
      await startSession(page);
      await gotoView(page, '#tasks');
      await page.getByRole('button', { name: scope, exact: true }).click();
      await expect(page.getByTestId('task-client-filter')).toBeVisible();
      await page.screenshot({ path: `test-results/task-client-filter-${scope}.png`, fullPage: false });
    });
  }

  test('Global Tasks has it in the filter bar', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks');
    await page.getByRole('button', { name: 'Globálne úlohy', exact: true }).click();
    await expect(page.getByTestId('task-client-filter')).toBeVisible();
  });
});
