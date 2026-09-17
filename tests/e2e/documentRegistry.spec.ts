import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Files uploaded onto a project must also live in the documents registry,
 * paired with that project. The crawler would see the new column once the
 * fixture is seeded, but it would not prove the Project documents filter
 * hides lead-only files, or that the assigned-project link actually opens
 * the project — both are the feature.
 */

const PROJECT_NAME = 'Strecha Silvia — etapa 1';
const PROJECT_FILE = 'zmluva-strecha-silvia.pdf';
const LEAD_FILE = 'ponuka-silvia.pdf';
const FILTER = /Project documents|Projektové dokumenty|Projektdokumentumok/;
const COLUMN = /Assigned project|Priradený projekt|Hozzárendelt projekt/;
const PROJECT_ACTION = /^(Project|Projekt)$/;
const FILES_TAB = /^(Files|Súbory|Fájlok)/;

test.describe('Documents Registry', () => {
  test('project uploads appear with their assigned project and the Project documents filter', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#files');

    await expect(page.getByRole('columnheader', { name: COLUMN })).toBeVisible();

    const projectRow = page.locator('tr').filter({ hasText: PROJECT_FILE });
    await expect(projectRow).toBeVisible();
    await expect(projectRow.getByText(PROJECT_NAME)).toBeVisible();
    await expect(page.locator('tr').filter({ hasText: LEAD_FILE })).toBeVisible();

    await page.getByRole('button', { name: FILTER }).click();

    await expect(projectRow).toBeVisible();
    await expect(page.locator('tr').filter({ hasText: LEAD_FILE })).toHaveCount(0);
    await expect(page.locator('tr').filter({ hasText: 'strecha-pred.jpg' })).toBeVisible();

    await projectRow.getByRole('link', { name: PROJECT_ACTION }).click();
    await expect(page.getByRole('button', { name: FILES_TAB }).first()).toBeVisible();
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();
  });
});
