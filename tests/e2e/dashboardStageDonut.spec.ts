import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * The "Leads by stage" donut has no Open button. Each status is a link to the
 * leads list with that pipeline stage already selected.
 */
test('a stage on the donut opens leads filtered to that status', async ({ page }) => {
  await startSession(page);
  await gotoView(page, 'dashboard');

  const card = page
    .locator('h2', { hasText: 'Leady podľa fázy' })
    .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")]')
    .first();

  await expect(card.getByRole('link', { name: 'Otvoriť' })).toHaveCount(0);
  await expect(card.locator('a[href="#leads?status=new"]')).toBeVisible();
  const offerSent = card.locator('a[href="#leads?status=offer%20sent"]');
  await expect(offerSent).toBeVisible();
  await expect(offerSent.locator('svg')).toBeVisible();

  await offerSent.click();

  await expect(page).toHaveURL(/#leads\?status=offer(%20|\+)sent/);
  await expect(page.getByRole('button', { name: /offer sent \(/i })).toBeVisible();
});
