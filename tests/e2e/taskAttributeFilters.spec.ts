import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Every attribute shown on a task — project, assignee, due date — filters the
 * section it is clicked in, the same way the client / lead filter does. Clicking
 * it again clears it, and the filter shows as a removable chip.
 *
 * Seed data: "Objednať krytinu" is Erik's, on project-1; "Pripraviť cenovú
 * ponuku" is Mária's and Erik's with no project; "Uzavrieť mesačnú fakturáciu"
 * is done, Mária's, on project-1.
 */

const PROJECT_TASK = 'Objednať krytinu';
const OTHER_TASK = 'Pripraviť cenovú ponuku';
const DONE_TASK = 'Uzavrieť mesačnú fakturáciu';

async function openGlobal(page: Page) {
  await startSession(page);
  await gotoView(page, '#tasks');
  await page.getByRole('button', { name: 'Globálne úlohy', exact: true }).click();
}

async function openDone(page: Page) {
  await startSession(page);
  await gotoView(page, '#tasks');
  await page.getByRole('button', { name: 'Hotové a archív', exact: true }).click();
}

test.describe('Tasks → click-to-filter attributes', () => {
  test('Global Tasks: the project badge filters, and clicking it again clears', async ({ page }) => {
    await openGlobal(page);
    await expect(page.getByText(OTHER_TASK).first()).toBeVisible();

    await page.getByTestId('task-project-filter-chip').first().click();
    await expect(page.getByTestId('task-active-filter-project')).toBeVisible();
    await expect(page.getByText(PROJECT_TASK).first()).toBeVisible();
    await expect(page.getByText(OTHER_TASK)).toHaveCount(0);

    await page.getByTestId('task-project-filter-chip').first().click();
    await expect(page.getByTestId('task-active-filter-project')).toHaveCount(0);
    await expect(page.getByText(OTHER_TASK).first()).toBeVisible();
  });

  test('Global Tasks: an assignee badge filters to that person', async ({ page }) => {
    await openGlobal(page);

    // Mária is only on the quote task (and the done one, which is closed).
    await page.getByTestId('task-assignee-filter-chip').filter({ hasText: 'Mária' }).first().click();
    await expect(page.getByTestId('task-active-filter-assignee')).toContainText('Mária');
    await expect(page.getByText(OTHER_TASK).first()).toBeVisible();
    await expect(page.getByText(PROJECT_TASK)).toHaveCount(0);

    await page.getByTestId('task-active-filter-assignee').getByRole('button').click();
    await expect(page.getByText(PROJECT_TASK).first()).toBeVisible();
  });

  test('Global Tasks: a due date narrows the date picker to that day', async ({ page }) => {
    await openGlobal(page);
    await expect(page.getByText(PROJECT_TASK).first()).toBeVisible();

    await page
      .locator('div.group')
      .filter({ has: page.getByText(OTHER_TASK) })
      .last()
      .getByTestId('task-day-filter-chip')
      .click();
    await expect(page.getByText(OTHER_TASK).first()).toBeVisible();
    await expect(page.getByText(PROJECT_TASK)).toHaveCount(0);
  });

  test('Done & Archived: project and assignee badges filter the done list', async ({ page }) => {
    await openDone(page);
    await expect(page.getByText(DONE_TASK).first()).toBeVisible();

    await page.getByTestId('task-project-filter-chip').first().click();
    await expect(page.getByTestId('task-active-filter-project')).toBeVisible();
    await expect(page.getByText(DONE_TASK).first()).toBeVisible();

    // Erik is not on the done task, so filtering to him empties the tab.
    await page.getByTestId('task-active-filter-project').getByRole('button').click();
    await page.getByTestId('task-assignee-filter-chip').filter({ hasText: 'Mária' }).first().click();
    await expect(page.getByTestId('task-active-filter-assignee')).toContainText('Mária');
    await expect(page.getByText(DONE_TASK).first()).toBeVisible();
  });

  test('Done & Archived: the completed-by name sets the Completed By filter', async ({ page }) => {
    await openDone(page);
    await page.getByTestId('task-completed-by-filter-chip').first().click();
    await expect(page.getByTestId('task-completed-by-filter-chip').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(DONE_TASK).first()).toBeVisible();
  });
});
