import { expect, test } from '@playwright/test';
import { startSession, gotoView } from './helpers/appDriver';

test.describe('Dashboard widget settings persistence across reload', () => {
  test('leads_by_status unchecking and settings survive save and page reload', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#dashboard');

    // Click edit mode button
    const editBtn = page.getByRole('button', { name: 'Upraviť', exact: true });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Click the leads_by_status widget card to open settings drawer
    const leadsCard = page.locator('[data-flip*="leads_by_status"]').first();
    await expect(leadsCard).toBeVisible();
    await leadsCard.click();

    // Wait for the drawer
    const drawer = page.getByRole('complementary', { name: /Nastavenia modulu|Widget settings|Modul beállításai/ });
    await expect(drawer).toBeVisible();

    const phases = ['new', 'contacted', 'offer sent', 'accepted', 'rejected'];
    for (const phase of phases) {
      const btn = drawer.getByRole('button', { name: phase, exact: true });
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    }

    // Close the drawer
    await drawer.getByRole('button', { name: /Zavrieť|Close|Bezárás/i }).click();
    await expect(drawer).not.toBeVisible();

    // Click Save dashboard
    const saveBtn = page.getByRole('button', { name: 'Uložiť', exact: true });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Reload the page
    await page.reload();
    await gotoView(page, '#dashboard');

    // Enter edit mode again and reopen drawer
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    await leadsCard.click();
    await expect(drawer).toBeVisible();

    // Verify all phases remained unchecked (did not revert to all checked)
    for (const phase of phases) {
      const btn = drawer.getByRole('button', { name: phase, exact: true });
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    }
  });
});
