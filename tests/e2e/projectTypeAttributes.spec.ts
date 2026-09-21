import { expect, test, type Dialog, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Project type settings: custom attributes can be edited in place. Changing
 * the type of a field that already lives on existing projects must warn that
 * stored values can be lost — cancelling the warning must leave the type
 * alone.
 */

const TYPE_NAME = 'Rekonštrukcia strechy';
const ATTR_NAME = 'Plocha (m²)';
const EDIT_ATTR = /Edit attribute|Upraviť atribút|Attribútum szerkesztése/;
const SAVE_CHANGES = /Save changes|Uložiť zmeny|Változtatások mentése/;
const TYPE_WARNING = /data loss|strate údajov|adatvesztés/i;
const NUMBER_TYPE = /Number|Číslo|Szám/;
const TEXT_TYPE = /Text Field|Textové pole|Szövegmező/;

async function openRoofTypeAttributes(page: Page) {
  await gotoView(page, '#projects');
  await page.getByTitle(/Project settings|Nastavenia projektov|Projekt beállítások/).click();
  await page.getByText(TYPE_NAME).first().click();
  await page.getByRole('tab', { name: /Attributes|Atribúty|Attribútumok/ }).click();
  await expect(page.getByText(ATTR_NAME).first()).toBeVisible();
}

async function startEditArea(page: Page) {
  const row = page.getByText(ATTR_NAME, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await row.getByRole('button', { name: EDIT_ATTR }).click();
  await expect(page.getByRole('button', { name: SAVE_CHANGES })).toBeVisible();
}

test.describe('Project type attributes', () => {
  test('an existing attribute can be renamed without a type-change warning', async ({ page }) => {
    await startSession(page);
    await openRoofTypeAttributes(page);
    await startEditArea(page);

    const label = page.getByPlaceholder(/e\.g\. Dimensions|napr\. Rozmery|pl\. Méretek/);
    await label.fill('Plocha upravená');
    await page.getByRole('button', { name: SAVE_CHANGES }).click();

    await expect(page.getByText('Plocha upravená').first()).toBeVisible();
    await expect(page.getByText(ATTR_NAME)).toHaveCount(0);
  });

  test('changing an existing attribute type warns, and cancelling keeps the type', async ({ page }) => {
    await startSession(page);
    await openRoofTypeAttributes(page);
    await startEditArea(page);

    let warned = false;
    const onDialog = (dialog: Dialog) => {
      warned = true;
      expect(dialog.message()).toMatch(TYPE_WARNING);
      void dialog.dismiss();
    };
    page.on('dialog', onDialog);

    await page.getByRole('button', { name: NUMBER_TYPE }).click();
    const search = page.getByPlaceholder(/Search|Hľadať|Keresés/);
    if (await search.isVisible().catch(() => false)) {
      await search.fill('Text');
    }
    await page.getByRole('option', { name: TEXT_TYPE }).click();

    expect(warned).toBe(true);
    await expect(page.getByRole('button', { name: NUMBER_TYPE })).toBeVisible();
    page.off('dialog', onDialog);
  });

  test('accepting the type-change warning updates the attribute type', async ({ page }) => {
    await startSession(page);
    await openRoofTypeAttributes(page);
    await startEditArea(page);

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toMatch(TYPE_WARNING);
      void dialog.accept();
    });

    await page.getByRole('button', { name: NUMBER_TYPE }).click();
    const search = page.getByPlaceholder(/Search|Hľadať|Keresés/);
    if (await search.isVisible().catch(() => false)) {
      await search.fill('Text');
    }
    await page.getByRole('option', { name: TEXT_TYPE }).click();

    await expect(page.getByRole('button', { name: TEXT_TYPE })).toBeVisible();
    await page.getByRole('button', { name: SAVE_CHANGES }).click();

    const row = page.getByText(ATTR_NAME, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(row.getByText(TEXT_TYPE)).toBeVisible();
  });

  test('checkbox options are added one by one, each can be required, and a typed draft is kept', async ({ page }) => {
    await startSession(page);
    await openRoofTypeAttributes(page);

    await page.getByPlaceholder(/e\.g\. Dimensions|napr\. Rozmery|pl\. Méretek/).fill('Kontrola');
    await page.getByRole('button', { name: TEXT_TYPE }).click();
    const search = page.getByPlaceholder(/Search|Hľadať|Keresés/);
    if (await search.isVisible().catch(() => false)) {
      await search.fill('Check');
    }
    await page.getByRole('option', { name: /Checkbox|Zaškrtávacie pole|Jelölőnégyzet/ }).click();

    const newOption = page.getByPlaceholder(/New option|Nová možnosť|Új opció/);
    const addOption = page.getByRole('button', { name: /^(Add|Pridať|Hozzáadás)$/ });
    await newOption.fill('Statika');
    await addOption.click();
    await newOption.fill('Revízia');
    await newOption.press('Enter');
    await expect(page.getByRole('textbox', { name: /Option 2|Možnosť 2|2\. opció/ })).toHaveValue('Revízia');

    // A duplicate cannot be added.
    await newOption.fill('Statika');
    await expect(addOption).toBeDisabled();

    // Only the first option is required; the typed draft is saved without clicking Add.
    await page.getByRole('button', { name: /^(Required|Povinné|Kötelező)$/ }).first().click();
    await newOption.fill('Fotodokumentácia');
    await page.getByRole('button', { name: /Add Attribute|Pridať atribút|Attribútum hozzáadása/ }).click();

    const row = page.getByText('Kontrola', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(row.getByText(/1 (required boxes|povinných políčok|kötelező négyzet)/)).toBeVisible();

    await row.getByRole('button', { name: EDIT_ATTR }).click();
    await expect(page.getByRole('textbox', { name: /Option 3|Možnosť 3|3\. opció/ })).toHaveValue('Fotodokumentácia');
  });
});
