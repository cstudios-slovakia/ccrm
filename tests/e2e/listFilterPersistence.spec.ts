import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * List filters are remembered per user (users.metadata_json.preferences.listFilters):
 * pick a stage, open a record, come back, and the list is still filtered. The
 * fixture runs in Slovak.
 */

const stageTrigger = (page: Page, label: RegExp) =>
  page.getByRole('button', { name: label }).locator('visible=true').first();

async function pickStage(page: Page, stage: string) {
  await stageTrigger(page, /Všetky fázy/).click();
  await page.getByRole('option', { name: stage }).first().click();
}

test.describe('List filters are remembered', () => {
  test('leads: the stage filter survives opening a lead and coming back, and a reload', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#leads');
    await pickStage(page, 'contacted');
    await expect(stageTrigger(page, /contacted/i)).toBeVisible();

    // Open a lead the way a link does, then use the header's back arrow.
    await gotoView(page, '#leads/lead-silvia');
    await page.getByRole('button', { name: /Späť|Back/i }).first().click();
    await expect(page).toHaveURL(/#leads/);
    await expect(stageTrigger(page, /contacted/i)).toBeVisible();

    // And after a reload — the filter is in the user's row, not in the page.
    await page.reload();
    await gotoView(page, '#leads');
    await expect(stageTrigger(page, /contacted/i)).toBeVisible();
  });
});
