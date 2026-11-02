import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

test.describe('Recurring Tasks Module', () => {
  test('navigates to Recurring tab and lists seeded templates', async ({ page }) => {
    await startSession(page);
    await gotoView(page, 'tasks');

    // Click the Recurring tab between Global Tasks and Done & Archived
    const recurringTab = page.getByRole('button', { name: /Recurring|Opakované|Ismétlődő/i });
    await expect(recurringTab).toBeVisible();
    await recurringTab.click();

    // Verify header title and subtitle
    await expect(page.getByText(/Recurring Tasks|Opakované úlohy|Ismétlődő feladatok/i).first()).toBeVisible();

    // Verify seeded templates are listed
    await expect(page.getByText('Pravidelná týždenná záloha').first()).toBeVisible();
    await expect(page.getByText('Revízia elektrických rozvodov').first()).toBeVisible();

    // Verify schedule descriptions
    await expect(page.getByText(/Každý týždeň|Every week|Minden héten/i).first()).toBeVisible();

    // Verify current task link is shown for the open occurrence
    await expect(page.getByRole('button', { name: /Pravidelná týždenná záloha/i }).first()).toBeVisible();
  });

  test('displays repeat badge on occurrence cards and calendar ghost pills', async ({ page }) => {
    await startSession(page);
    await gotoView(page, 'tasks');

    // On My Tasks list, open occurrence should display repeat badge
    const card = page.locator('[data-task-card]').filter({ hasText: 'Pravidelná týždenná záloha' });
    await expect(card.first()).toBeVisible();

    // Verify badge with Repeat icon
    const badge = card.locator('span').filter({ hasText: /Recurring|Opakované|Ismétlődő/i });
    await expect(badge.first()).toBeVisible();

    // Its tooltip spells out the series' rule and that it never ends
    await expect(badge.first()).toHaveAttribute(
      'title',
      /(Každý týždeň|Every week|Minden héten).*(bez konca|no end|vég nélkül)/i,
    );

    // Verify planned recurring toggle button is present next to calendar controls
    const toggle = page.getByRole('switch', { name: /Show planned recurring tasks|Zobraziť plánované opakované úlohy|Tervezett ismétlődő feladatok megjelenítése|Planned recurring|Plánované opakované|Tervezett ismétlődő/i });
    await expect(toggle).toBeVisible();
  });

  test('opening occurrence drawer displays series banner and Edit series button', async ({ page }) => {
    await startSession(page);
    await gotoView(page, 'tasks');

    // Open the occurrence drawer
    const card = page.locator('[data-task-card]').filter({ hasText: 'Pravidelná týždenná záloha' });
    const editBtn = card.getByTitle(/Edit Task|Upraviť úlohu|Feladat szerkesztése/i).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
    } else {
      await card.getByText('Pravidelná týždenná záloha').first().click();
    }

    // Drawer should show series banner
    await expect(page.getByText(/Každý týždeň|Every week|Minden héten|Part of a recurring series|Súčasť opakovanej série|Egy ismétlődő sorozat része/i).first()).toBeVisible();
    const editSeriesBtn = page.getByRole('button', { name: /Edit series|Upraviť sériu|Sorozat szerkesztése/i });
    await expect(editSeriesBtn).toBeVisible();

    // Clicking Edit series opens template drawer
    await editSeriesBtn.click();
    await expect(page.getByText(/Edit Recurring Task|Upraviť opakovanú úlohu|Ismétlődő feladat szerkesztése/i).first()).toBeVisible();
  });

  test('standalone task in edit drawer has "Make this task repeat" switch', async ({ page }) => {
    await startSession(page);
    await gotoView(page, 'tasks');

    // Open a regular non-recurring task (expand Tomorrow if collapsed)
    const tomorrowBtn = page.getByRole('button', { name: /Tomorrow|Zajtra|Holnap/i }).first();
    if (await tomorrowBtn.isVisible()) {
      await tomorrowBtn.click();
    }
    const card = page.locator('[data-task-card]').filter({ hasText: 'Zavolať klientke Silvii' });
    const editBtn = card.getByTitle(/Edit Task|Upraviť úlohu|Feladat szerkesztése/i).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
    } else {
      await card.getByText('Zavolať klientke Silvii').first().click();
    }

    // Verify the repeat conversion switch is offered
    const repeatSwitch = page.getByRole('switch', { name: /Make this task repeat|Nastaviť opakovanie úlohy|Feladat ismétlődővé tétele/i });
    await expect(repeatSwitch).toBeVisible();
  });

  test('quick task modal has Repeat switch which reveals recurrence fields', async ({ page }) => {
    await startSession(page);
    await gotoView(page, 'tasks');

    // Open QuickTask form via the main action button
    const createBtn = page.getByRole('main').getByRole('button', { name: /Create New Task|Vytvoriť novú úlohu|Új feladat/i }).first();
    await createBtn.click();

    // Check repeat switch
    const repeatSwitch = page.getByRole('switch', { name: /Repeat|Opakovanie|Ismétlés/i });
    await expect(repeatSwitch).toBeVisible();

    // Toggle repeat on
    await repeatSwitch.click();

    // Recurrence fields should appear
    await expect(page.getByText(/On a schedule|Podľa kalendára|Podľa plánu|Ütemezés szerint/i)).toBeVisible();
    await expect(page.getByText(/After completion|Po dokončení|Befejezés után/i)).toBeVisible();
    await expect(page.getByText(/Next 5 due dates|Ďalších 5 termínov|Következő 5 határidő/i)).toBeVisible();
  });
});
