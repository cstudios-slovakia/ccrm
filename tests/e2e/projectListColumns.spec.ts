import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * The projects table's columns, as a project type lays them out: which ones it
 * shows, in what order, and its own custom attributes among them.
 *
 * Pinned as a journey because the interesting part spans two screens. The
 * crawler can see that the Columns tab renders, but not that a switch flipped
 * there changes the table on the way back — and not that an attribute column
 * reads a value out of `project.data` and sorts by it rather than by the raw
 * text it happens to be stored as.
 *
 * The fixture's roof type carries "Plocha (m²)" (a number: 145 on project-1, 62
 * on project-3) and "Rozpočet" (money, 18 400 € on project-1 only). It runs in
 * Slovak, and a second project type keeps the list mixed until it is filtered.
 */

const ROOF_TYPE = 'Rekonštrukcia strechy';
const ROOF_BIG = 'Strecha Silvia — etapa 1';
const ROOF_SMALL = 'Havarijná oprava — bytový dom Košice';
const WINDOWS_PROJECT = /Novák/;

const SAVE_TYPE = /Save Project Type|Uložiť typ projektu|Projekt típus mentése/;
const BACK_TO_PROJECTS = /Back to projects|Späť na projekty|Vissza a projektekhez/;

/** A column header, scoped to `thead` — the filter bar repeats several of these words. */
const header = (page: Page, name: string | RegExp) =>
  page.locator('thead').getByRole('button', { name });

const row = (page: Page, name: string | RegExp) => page.locator('tbody tr').filter({ hasText: name });

/**
 * One column's on/off switch in the type editor. Each carries the column's own
 * name in its label ("Zobraziť „Plocha (m²)“"), which is the only unique handle
 * on the row — the label text alone repeats elsewhere in the editor.
 */
const columnSwitch = (page: Page, name: RegExp) => page.getByRole('switch', { name });

const AREA = /Plocha/;
const BUDGET = /Rozpočet/;
const PROGRESS = /Postup/;
const NAME_COLUMN = /Projekt/;

/** Open the Columns tab of the roof project type. */
async function openRoofColumns(page: Page) {
  await gotoView(page, '#projects');
  await page.getByTitle(/Project settings|Nastavenia projektov|Projekt beállítások/).click();
  await page.getByText(ROOF_TYPE).first().click();
  await page.getByRole('tab', { name: /Columns|Stĺpce|Oszlopok/ }).click();
  await expect(columnSwitch(page, AREA)).toBeVisible();
}

async function saveAndReturn(page: Page) {
  await page.getByRole('button', { name: SAVE_TYPE }).click();
  await page.getByRole('button', { name: BACK_TO_PROJECTS }).click();
}

/** Narrow the list to one project type, so that type's layout is what applies. */
async function filterToRoof(page: Page) {
  await page.getByRole('button', { name: /Všetky typy/ }).first().click();
  await page.getByRole('option', { name: ROOF_TYPE, exact: true }).click();
}

test.describe('Project list columns', () => {
  test('a type nobody has arranged shows exactly the built-in columns', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#projects');

    for (const name of [/Projekt/, /Typ/, /Klient/, /Manažéri/, /Hodnotenie/, /Termín/, /Postup/, /Stav/]) {
      await expect(header(page, name).first()).toBeVisible();
    }
    // An attribute is not a column until somebody asks for it.
    await expect(page.locator('thead').getByText('Plocha (m²)')).toHaveCount(0);
  });

  test('the Columns tab lists built-ins and attributes, with the name column locked', async ({ page }) => {
    await startSession(page);
    await openRoofColumns(page);
    await page.screenshot({ path: 'test-results/project-columns-settings.png', fullPage: false });

    // Both kinds of column, in one list: a built-in starts on, an attribute off.
    await expect(columnSwitch(page, /Stav/)).toHaveAttribute('aria-checked', 'true');
    await expect(columnSwitch(page, AREA)).toHaveAttribute('aria-checked', 'false');
    await expect(columnSwitch(page, BUDGET)).toHaveAttribute('aria-checked', 'false');

    // The project name identifies the row and opens it, so its switch is locked on.
    const nameSwitch = columnSwitch(page, NAME_COLUMN);
    await expect(nameSwitch).toBeDisabled();
    await expect(nameSwitch).toHaveAttribute('aria-checked', 'true');
  });

  test('switching an attribute on puts its values in the table, and a built-in off removes it', async ({ page }) => {
    await startSession(page);
    await openRoofColumns(page);

    await columnSwitch(page, AREA).click();
    await columnSwitch(page, PROGRESS).click();
    await saveAndReturn(page);
    await filterToRoof(page);

    // The attribute is a column now, reading each project's own value...
    await expect(header(page, AREA).first()).toBeVisible();
    await expect(row(page, ROOF_BIG)).toContainText('145');
    await expect(row(page, ROOF_SMALL)).toContainText('62');
    // ...and the column switched off is gone.
    await expect(header(page, PROGRESS)).toHaveCount(0);
    await page.screenshot({ path: 'test-results/project-columns-list.png', fullPage: false });
  });

  test('an attribute column sorts by its value, and a blank one sorts last', async ({ page }) => {
    await startSession(page);
    await openRoofColumns(page);
    // Money too, so the sort has to read the amount out of the stored object
    // rather than compare it as text. Only one roof project carries one.
    await columnSwitch(page, AREA).click();
    await columnSwitch(page, BUDGET).click();
    await saveAndReturn(page);
    await filterToRoof(page);

    const areaHeader = header(page, AREA).first();
    await areaHeader.click(); // ascending: 62 before 145
    await expect(page.locator('tbody tr').first()).toContainText(ROOF_SMALL);
    await areaHeader.click(); // descending
    await expect(page.locator('tbody tr').first()).toContainText(ROOF_BIG);

    // The project with no budget has no value to order by, so it goes last
    // whichever way the money column is sorted.
    const budgetHeader = header(page, BUDGET).first();
    await budgetHeader.click();
    await expect(page.locator('tbody tr').last()).toContainText(ROOF_SMALL);
    await budgetHeader.click();
    await expect(page.locator('tbody tr').last()).toContainText(ROOF_SMALL);
  });

  test('a list of mixed types falls back to the built-in columns', async ({ page }) => {
    await startSession(page);
    await openRoofColumns(page);
    await columnSwitch(page, AREA).click();
    await columnSwitch(page, PROGRESS).click();
    await saveAndReturn(page);

    // Unfiltered, the list holds both project types: the roof type's layout
    // cannot speak for a project that has no such attribute.
    await expect(row(page, WINDOWS_PROJECT)).toHaveCount(1);
    await expect(page.locator('thead').getByText('Plocha (m²)')).toHaveCount(0);
    await expect(header(page, PROGRESS).first()).toBeVisible();

    // Filtered to the roof type, the layout applies again.
    await filterToRoof(page);
    await expect(header(page, AREA).first()).toBeVisible();
    await expect(header(page, PROGRESS)).toHaveCount(0);
  });

  test('the arrangement is remembered when the editor is reopened', async ({ page }) => {
    await startSession(page);
    await openRoofColumns(page);
    await columnSwitch(page, AREA).click();
    await saveAndReturn(page);

    await openRoofColumns(page);
    await expect(columnSwitch(page, AREA)).toHaveAttribute('aria-checked', 'true');
  });
});
