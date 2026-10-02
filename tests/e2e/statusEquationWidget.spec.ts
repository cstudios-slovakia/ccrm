import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * "Invoicable value by status" is a dashboard widget like any other: it sits in
 * the grid, is added from the library, and has a settings drawer. What is
 * specific to it is that the user chooses which lead phases and project
 * statuses count towards its sums — including the closed ones (refused,
 * archived, cancelled…), which are left out until switched on.
 *
 * The fixture runs in Slovak and has no closed lead phase, but its project
 * statuses are the built-in set, whose "Completed" and "Cancelled" are closed.
 */

const WIDGET = 'default_status_value_equation';
const EDIT = 'Upraviť';
const DONE = 'Hotovo';

// The built-in project statuses, as the Slovak UI names them (upper-cased in the widget).
const OPEN_PROJECT = 'AKTÍVNY';
const CLOSED_PROJECT = 'ZRUŠENÝ';
const LEAD_PHASE = 'NEW';

const card = (page: Page): Locator => page.locator(`[data-flip="${WIDGET}"]`);
const pill = (page: Page, name: string): Locator => card(page).getByText(name, { exact: true });

/** The status chips in the settings drawer, by the label they carry. */
const chip = (page: Page, name: string): Locator =>
  page.getByRole('complementary').getByRole('button', { name, exact: true });

async function openSettings(page: Page) {
  await page.getByRole('button', { name: EDIT, exact: true }).click();
  await card(page).click();
  await expect(page.getByRole('complementary')).toBeVisible();
}

test.describe('Invoicable value by status widget', () => {
  test.beforeEach(async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#dashboard');
    await expect(card(page)).toBeVisible();
  });

  test('is part of the board rather than fixed above it, and leaves closed statuses out by default', async ({ page }) => {
    // It is a grid card, so it takes part in editing like the others.
    await expect(page.locator('[data-flip]').first()).toHaveAttribute('data-flip', WIDGET);

    await expect(pill(page, OPEN_PROJECT)).toBeVisible();
    await expect(pill(page, LEAD_PHASE)).toBeVisible();
    await expect(pill(page, CLOSED_PROJECT)).toHaveCount(0);
  });

  test('which statuses count is chosen in its settings', async ({ page }) => {
    await openSettings(page);

    // The closed statuses are on offer, just switched off.
    await expect(chip(page, CLOSED_PROJECT)).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, OPEN_PROJECT)).toHaveAttribute('aria-pressed', 'true');

    // Count a closed project status, and leave an open lead phase out.
    await chip(page, CLOSED_PROJECT).click();
    await chip(page, LEAD_PHASE).click();

    await expect(chip(page, CLOSED_PROJECT)).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, LEAD_PHASE)).toHaveAttribute('aria-pressed', 'false');
    await expect(pill(page, CLOSED_PROJECT)).toBeVisible();
    await expect(pill(page, LEAD_PHASE)).toHaveCount(0);

    // Putting the closed status back lands on the default again.
    await chip(page, CLOSED_PROJECT).click();
    await expect(pill(page, CLOSED_PROJECT)).toHaveCount(0);
  });

  test('can be moved and resized like any other widget', async ({ page }) => {
    await page.getByRole('button', { name: EDIT, exact: true }).click();
    await expect(page.getByRole('button', { name: DONE, exact: true })).toBeVisible();

    const before = (await card(page).boundingBox())!.width;
    await card(page).locator('button[aria-label="Zmeniť veľkosť"]').click();
    await expect.poll(async () => (await card(page).boundingBox())!.width).not.toBe(before);
    await expect(page.locator('[data-flip]').first()).toHaveAttribute('data-flip', WIDGET);
  });
});
