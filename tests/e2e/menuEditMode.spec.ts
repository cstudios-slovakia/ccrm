import { expect, test, type Locator, type Page } from '@playwright/test';
import { startSession, waitForAppReady } from './helpers/appDriver';
import { TEST_USER } from './helpers/fixture';

/**
 * Menu edit mode ("Upraviť menu"): the Start menu dialog, the sidebar in edit
 * mode and the mobile editor. Every action is performed and its result checked.
 */

const GROUPS = [
  { id: 'g1', title: 'Prehľad', items: ['dashboard', 'tasks', 'time-tracking', 'whatsapp', 'overview'] },
  { id: 'g2', title: 'Práca', items: ['projects', 'tickets', 'rag_ai', 'sai'] },
  { id: 'g3', title: 'Obchod', items: ['leads', 'clients', 'invoices', 'orders', 'warehouse', 'financial'] },
];

function seededUser() {
  const meta = JSON.parse(TEST_USER.metadata_json);
  meta.navLayout = GROUPS.flatMap((g) => g.items);
  meta.preferences = { ...(meta.preferences ?? {}), sidebarGroups: GROUPS, sidebarPinned: true };
  return { ...TEST_USER, metadata_json: JSON.stringify(meta) };
}

async function openDesktopEdit(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startSession(page, { user: seededUser() });
  await page.goto('/');
  await waitForAppReady(page);
  await page.locator('aside[data-sidebar]').getByTitle(/Upraviť štruktúru menu/).click();
  const dialog = page.getByRole('dialog', { name: 'Upraviť menu' });
  await expect(dialog).toBeVisible();
  return { dialog, sidebar: page.locator('aside[data-sidebar]') };
}

/** The group card in the dialog whose heading is `name`: the innermost div holding the heading and its add button. */
const groupCard = (dialog: Locator, name: string) =>
  dialog
    .locator('div')
    .filter({ has: dialog.page().getByRole('heading', { level: 3, name, exact: true }) })
    .filter({ has: dialog.page().getByRole('button', { name: /^Pridať modul/ }) })
    .last();

/** Labels of the rows of a dialog group, in order. */
const rowLabels = (card: Locator) =>
  card.getByRole('button', { name: /^Akcie pre / }).evaluateAll((els) =>
    els.map((e) => (e.getAttribute('aria-label') ?? '').replace(/^Akcie pre /, ''))
  );

test.describe('Start menu edit dialog (desktop)', () => {
  test('pin toggle pins and unpins a module in the sidebar', async ({ page }) => {
    const { dialog, sidebar } = await openDesktopEdit(page);
    await expect(sidebar.getByText('Ľudia', { exact: true })).toHaveCount(0);
    const pin = dialog.getByRole('button', { name: 'Pripnúť do bočného panela' }).first();
    const rowName = await pin.evaluate((b) => b.parentElement?.querySelector('[aria-label^="Akcie pre "]')?.getAttribute('aria-label')?.slice(10));
    await pin.click();
    await expect(sidebar.getByText(rowName!, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: `Akcie pre ${rowName}` }).locator('xpath=..').getByRole('button', { name: 'Pripnuté v bočnom paneli' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('item menu moves a module down, to another group, hides and restores it', async ({ page }) => {
    const { dialog } = await openDesktopEdit(page);
    const ops = groupCard(dialog, 'Operatíva & CRM');
    const before = await rowLabels(ops);
    await dialog.getByRole('button', { name: `Akcie pre ${before[0]}` }).click();
    await page.getByRole('menuitem', { name: /Posunúť nižšie/ }).click();
    await expect.poll(() => rowLabels(ops)).toEqual([before[1], before[0], ...before.slice(2)]);

    // Alt+ArrowUp on the row's ⋯ button moves it back.
    await dialog.getByRole('button', { name: `Akcie pre ${before[0]}` }).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => rowLabels(ops)).toEqual(before);

    await dialog.getByRole('button', { name: `Akcie pre ${before[0]}` }).click();
    await page.getByRole('menuitem', { name: 'Presunúť do skupiny' }).click();
    await page.getByRole('menuitemradio', { name: 'Systém & Nástroje' }).click();
    await expect.poll(() => rowLabels(groupCard(dialog, 'Systém & Nástroje'))).toContain(before[0]);
    await expect.poll(() => rowLabels(ops)).not.toContain(before[0]);

    await dialog.getByRole('button', { name: `Akcie pre ${before[0]}` }).click();
    await page.getByRole('menuitem', { name: /Skryť modul/ }).click();
    const hiddenCard = dialog.locator('div', { hasText: 'Skryté moduly' }).filter({ has: page.getByRole('button', { name: 'Zobraziť' }) }).last();
    await expect(hiddenCard.getByText(before[0], { exact: true })).toBeVisible();
    await hiddenCard.getByRole('button', { name: 'Zobraziť' }).click();
    await expect(dialog.getByRole('button', { name: 'Zobraziť' })).toHaveCount(0);
  });

  test('Escape closes an open menu but keeps the editor open; a second Escape is Done', async ({ page }) => {
    const { dialog } = await openDesktopEdit(page);
    await dialog.getByRole('button', { name: /^Akcie pre / }).first().click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('new group opens in rename, the name saves on Enter', async ({ page }) => {
    const { dialog } = await openDesktopEdit(page);
    await dialog.getByRole('button', { name: 'Nová skupina', exact: true }).click();
    const input = dialog.getByRole('textbox', { name: 'Názov skupiny' });
    await expect(input).toBeFocused();
    await input.fill('Moja skupina');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('heading', { level: 3, name: 'Moja skupina' })).toBeVisible();
  });

  test('deleting a group asks first, then offers Undo above the dialog', async ({ page }) => {
    const { dialog } = await openDesktopEdit(page);
    await dialog.getByRole('button', { name: 'Možnosti skupiny Analytika & Evidencie' }).click();
    await page.getByRole('menuitem', { name: /Vymazať skupinu/ }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Vymazať skupinu Analytika & Evidencie?');
    await confirm.getByRole('button', { name: 'Vymazať skupinu' }).click();
    await expect(dialog.getByRole('heading', { level: 3, name: 'Analytika & Evidencie' })).toHaveCount(0);
    const undo = page.getByTestId('undo-toast-message');
    await expect(undo).toHaveText('Skupina bola vymazaná');
    // Reachable: nothing of the edit mode paints over it.
    await page.getByRole('button', { name: 'Späť' }).click();
    await expect(dialog.getByRole('heading', { level: 3, name: 'Analytika & Evidencie' })).toBeVisible();
  });

  test('dragging a module from the dialog onto the sidebar pins it there', async ({ page }) => {
    const { dialog, sidebar } = await openDesktopEdit(page);
    await expect(sidebar.getByText('Ľudia', { exact: true })).toHaveCount(0);
    const row = dialog.locator('[draggable="true"]', { hasText: 'Ľudia' }).first();
    const target = sidebar.getByText('Podpora a tikety', { exact: true });
    const dt = await page.evaluateHandle(() => new DataTransfer());
    await row.dispatchEvent('dragstart', { dataTransfer: dt });
    const tb = (await target.boundingBox())!;
    const at = { dataTransfer: dt, clientX: tb.x + 10, clientY: tb.y + 4 };
    await sidebar.dispatchEvent('dragenter', at);
    await target.dispatchEvent('dragenter', at);
    await target.dispatchEvent('dragover', at);
    await expect(sidebar.getByText('Ľudia sem')).toBeVisible();
    await target.dispatchEvent('drop', at);
    await row.dispatchEvent('dragend', { dataTransfer: dt });
    await expect(sidebar.getByRole('button', { name: 'Akcie pre Ľudia' })).toBeVisible();
  });
});

test.describe('Sidebar in edit mode (desktop)', () => {
  test('item menu unpins; group menu renames', async ({ page }) => {
    const { sidebar } = await openDesktopEdit(page);
    await sidebar.getByRole('button', { name: 'Akcie pre SAI' }).click();
    await page.getByRole('menuitem', { name: 'Odopnúť z bočného panela' }).click();
    await expect(sidebar.getByRole('button', { name: 'Akcie pre SAI' })).toHaveCount(0);

    await sidebar.getByRole('button', { name: 'Možnosti skupiny Práca' }).click();
    await page.getByRole('menuitem', { name: 'Premenovať' }).click();
    const input = sidebar.getByRole('textbox', { name: 'Názov skupiny' });
    await input.fill('Projekty a podpora');
    await page.keyboard.press('Enter');
    await expect(sidebar.getByText('Projekty a podpora', { exact: true })).toBeVisible();
  });

  test('+ on a group pins an unpinned module into it', async ({ page }) => {
    const { sidebar } = await openDesktopEdit(page);
    await sidebar.getByRole('button', { name: 'Pridať modul do skupiny Obchod' }).click();
    const menu = page.getByRole('menu');
    await menu.getByRole('textbox').fill('Ľud');
    await menu.getByRole('button', { name: /Ľudia/ }).or(menu.getByRole('menuitem', { name: /Ľudia/ })).first().click();
    await expect(sidebar.getByRole('button', { name: 'Akcie pre Ľudia' })).toBeVisible();
  });
});

test.describe('Mobile editor', () => {
  async function openMobileEdit(page: Page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSession(page, { user: seededUser() });
    await page.goto('/');
    await waitForAppReady(page);
    await page.getByRole('button', { name: 'Otvoriť Štart menu' }).click();
    await page.locator('[data-start-menu]').getByTitle(/Prispôsobiť menu/).first().click();
    await expect(page.getByRole('heading', { name: 'Upraviť menu' }).last()).toBeVisible();
  }

  test('item sheet moves a module down; Escape closes only the sheet', async ({ page }) => {
    await openMobileEdit(page);
    await page.getByRole('button', { name: 'Akcie pre Projekty' }).last().click();
    const sheet = page.getByRole('dialog', { name: /Projekty/ });
    await expect(sheet).toContainText('Skupina Práca · 1. z 4');
    await sheet.getByRole('button', { name: 'Posunúť nižšie' }).click();
    await page.getByRole('button', { name: 'Akcie pre Projekty' }).last().click();
    await expect(page.getByRole('dialog', { name: /Projekty/ })).toContainText('2. z 4');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Projekty/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Akcie pre Projekty' }).last()).toBeVisible();
  });

  test('add sheet pins a module into the group', async ({ page }) => {
    await openMobileEdit(page);
    await page.getByRole('button', { name: 'Pridať modul do skupiny Práca' }).last().click();
    const sheet = page.getByRole('dialog', { name: /Pridať do skupiny Práca/ });
    await sheet.getByRole('button', { name: /Ľudia/ }).first().click();
    await expect(page.getByRole('button', { name: 'Akcie pre Ľudia' }).last()).toBeVisible();
  });
});
