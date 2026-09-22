import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * "Add a new lead / client" from inside a picker.
 *
 * Every lead/client dropdown in the app is one `ClientSelect`, and the button
 * beside its search box opens the shared quick-add form. The point of the
 * feature is that nobody has to leave the half-filled form they are in, so the
 * journey worth pinning is: open a picker, create a record from it, and find
 * that record selected in the picker that asked for it.
 *
 * Pinned rather than left to the crawler because the crawler only proves the
 * panel opens and an option can be clicked — it cannot tell that the new record
 * came back into the trigger, which is the whole contract.
 *
 * The button lives beside the search box, deliberately outside the
 * `role="listbox"`: a listbox may only hold options, and when it held this
 * button too the crawler picked it as the first "option" of every lead dropdown
 * in the app. That is what `addNewButton` asserts by scoping to the panel but
 * not to the listbox.
 */

const PROJECT = 'Strecha Silvia — etapa 1';
const NEW_NAME = 'QA Rýchly Klient';

/** The pairing picker on the project card — named, because the card carries
    several dropdowns and which one comes first has moved before. */
const pairingPicker = (page: Page) =>
  page.locator('label', { hasText: 'Spárovaný lead / klient' })
    .locator('xpath=..')
    .locator('button[aria-haspopup="listbox"]');

/** The picker panel's add-new button — beside the search box, not in the list. */
const addNewButton = (page: Page) => page.getByRole('button', { name: /Pridať nový lead \/ klienta/i });

test.describe('Quick-add client', () => {
  test('creates a record from a picker and selects it there', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#projects');

    await page.getByText(PROJECT).first().click();
    await page.getByRole('button', { name: /^zmeniť$/i }).first().click();

    // The paired lead / client picker.
    const trigger = pairingPicker(page);
    await trigger.click();

    const listbox = page.locator('[role="listbox"]').last();
    await expect(listbox).toBeVisible();
    // The add button is a control of the panel, never an option of the list.
    await expect(listbox.getByRole('button', { name: /Pridať nový/i })).toHaveCount(0);

    await addNewButton(page).click();

    // The panel gets out of the way — the form that replaced it is a modal.
    await expect(page.locator('[role="listbox"]')).toHaveCount(0);

    const form = page.locator('form').filter({ hasText: /Nový lead \/ klient/ });
    await expect(form).toBeVisible();
    await form.locator('input').first().fill(NEW_NAME);
    await form.getByRole('button', { name: /^Vytvoriť$/ }).click();

    await expect(form).toHaveCount(0);
    // The pairing took: the card the picker replaced now names the new client.
    await expect(page.getByRole('heading', { name: NEW_NAME })).toBeVisible();
  });

  test('the new record joins the register the picker reads from', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#projects');

    await page.getByText(PROJECT).first().click();
    await page.getByRole('button', { name: /^zmeniť$/i }).first().click();

    await pairingPicker(page).click();
    await addNewButton(page).click();

    const form = page.locator('form').filter({ hasText: /Nový lead \/ klient/ });
    await form.locator('input').first().fill(NEW_NAME);
    await form.getByRole('button', { name: /^Vytvoriť$/ }).click();
    await expect(form).toHaveCount(0);

    // Reopen the picker: the record is in the register like any other.
    await page.getByRole('button', { name: /^zmeniť$/i }).first().click();
    await pairingPicker(page).click();
    await expect(
      page.locator('[role="listbox"]').last().getByRole('option', { name: NEW_NAME }),
    ).toBeVisible();
  });
});
