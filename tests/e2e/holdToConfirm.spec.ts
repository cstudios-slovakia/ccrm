import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import {
  captureRequests,
  captureSync,
  holdToConfirm,
  holdWithKeyboard,
  undoButton,
  undoToast,
} from './helpers/hold';

/**
 * Hold-to-confirm and Undo on archive/delete actions.
 *
 * The contract being checked, per entity:
 *   - a plain click does nothing and shows the "Hold to …" hint;
 *   - a release at ~300 ms does nothing;
 *   - a hold of ≥ 500 ms performs the action and raises the Undo toast;
 *   - Undo puts the record back where it was;
 *   - without Undo the server is told only after the toast expires.
 *
 * The undo toast quotes the record's name, so "is it gone from the screen?" is
 * asked of <main> only — never of the whole page.
 */

const UNDO_WINDOW_MS = 6000;

const TASK_DONE = 'Uzavrieť mesačnú fakturáciu';
const TASK_OPEN = 'Pripraviť cenovú ponuku';
const LEAD_NAME = 'Novák Stavby s.r.o.';
const LEAD_ID = 'lead-novak';

const inMain = (page: Page, text: string) =>
  page.locator('main').getByText(text, { exact: false }).filter({ visible: true });

/** The accessible name a hold button gets: "<Verb>: <what>, podržte pre potvrdenie". */
const holdButton = (page: Page, verb: 'Zmazať' | 'Archivovať', what: string | RegExp) =>
  page
    .getByRole('button', {
      name: typeof what === 'string' ? new RegExp(`^${verb}: ${what}, podržte pre potvrdenie$`) : what,
    })
    .first();

async function openDoneTab(page: Page) {
  await gotoView(page, '#tasks');
  await page.getByRole('button', { name: 'Hotové a archív', exact: true }).click();
  await expect(inMain(page, TASK_DONE).first()).toBeVisible();
}

async function openGlobalTasks(page: Page) {
  await gotoView(page, '#tasks');
  await page.getByRole('button', { name: 'Globálne úlohy', exact: true }).click();
  await expect(inMain(page, TASK_OPEN).first()).toBeVisible();
}

test.describe('Hold to confirm — tasks', () => {
  test('a click and a short hold do nothing; the hint appears', async ({ page }) => {
    await startSession(page);
    await captureSync(page);
    await openDoneTab(page);

    const del = holdButton(page, 'Zmazať', TASK_DONE);
    await expect(del).toBeVisible();

    await del.click();
    await expect(page.getByRole('status').filter({ hasText: 'Podržte pre zmazanie' })).toBeVisible();
    await expect(inMain(page, TASK_DONE).first()).toBeVisible();
    await expect(undoToast(page)).toHaveCount(0);

    await holdToConfirm(del, 200);
    await expect(inMain(page, TASK_DONE).first()).toBeVisible();
    await expect(undoToast(page)).toHaveCount(0);
  });

  test('holding deletes, shows Undo, and Undo restores the task', async ({ page }) => {
    await startSession(page);
    const requests = await captureRequests(page, '**/api/task.php', 'DELETE');
    await captureSync(page);
    await openDoneTab(page);

    await holdToConfirm(holdButton(page, 'Zmazať', TASK_DONE));
    await expect(inMain(page, TASK_DONE)).toHaveCount(0);
    await expect(undoToast(page)).toBeVisible();
    await expect(page.getByTestId('undo-toast-message')).toContainText(TASK_DONE);

    await undoButton(page).click();
    await expect(inMain(page, TASK_DONE).first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Obnovené' })).toBeVisible();

    // Nothing may have reached the server.
    await page.waitForTimeout(UNDO_WINDOW_MS + 500);
    expect(requests).toHaveLength(0);
  });

  test('the server delete goes out only after the undo window closes', async ({ page }) => {
    await startSession(page);
    const requests = await captureRequests(page, '**/api/task.php', 'DELETE');
    const sync = await captureSync(page);
    await openDoneTab(page);

    await holdToConfirm(holdButton(page, 'Zmazať', TASK_DONE));
    await expect(undoToast(page)).toBeVisible();

    await page.waitForTimeout(UNDO_WINDOW_MS - 2500);
    expect(requests).toHaveLength(0);
    expect(sync.hasDeleted('tasks', 'task-4')).toBe(false);

    await expect.poll(() => requests.length, { timeout: 6000 }).toBe(1);
    expect(requests[0].body).toEqual({ id: 'task-4' });
    await expect(undoToast(page)).toHaveCount(0);
  });

  test('keyboard hold works', async ({ page }) => {
    await startSession(page);
    await captureSync(page);
    await openDoneTab(page);

    const del = holdButton(page, 'Zmazať', TASK_DONE);
    await holdWithKeyboard(del, 200);
    await expect(inMain(page, TASK_DONE).first()).toBeVisible();

    await holdWithKeyboard(del);
    await expect(inMain(page, TASK_DONE)).toHaveCount(0);
    await expect(undoToast(page)).toBeVisible();
  });

  test('archive: hold archives, Undo returns the task to the active list', async ({ page }) => {
    await startSession(page);
    await captureSync(page);
    await openGlobalTasks(page);

    const archive = holdButton(page, 'Archivovať', TASK_OPEN);
    await archive.click();
    await expect(inMain(page, TASK_OPEN).first()).toBeVisible();

    await holdToConfirm(archive);
    await expect(inMain(page, TASK_OPEN)).toHaveCount(0);
    await expect(undoToast(page)).toBeVisible();

    await undoButton(page).click();
    await expect(inMain(page, TASK_OPEN).first()).toBeVisible();
  });

  test('bulk: select three, one hold, one toast, one Undo restores all three', async ({ page }) => {
    await startSession(page);
    await captureSync(page);
    await openGlobalTasks(page);

    // The task cards carry a checkbox-like selector; pick every visible card.
    const selectAll = page.getByRole('button', { name: /Vybrať všetky/ }).first();
    await selectAll.click();
    const toolbarDelete = page.getByRole('button', { name: /^Zmazať: vybrané úlohy/ });
    await expect(toolbarDelete).toBeVisible();

    await holdToConfirm(toolbarDelete);
    await expect(undoToast(page)).toHaveCount(1);
    await expect(page.getByTestId('undo-toast-message')).toContainText(/zmazané|zmazaná|zmazaných/);
    await expect(inMain(page, TASK_OPEN)).toHaveCount(0);

    await undoButton(page).click();
    await expect(inMain(page, TASK_OPEN).first()).toBeVisible();
  });
});

test.describe('Hold to confirm — leads, projects, clients', () => {
  test('lead: click does nothing; hold deletes; Undo restores; the delete is pushed only after expiry', async ({ page }) => {
    await startSession(page);
    const sync = await captureSync(page);
    await gotoView(page, '#leads');
    await expect(inMain(page, LEAD_NAME).first()).toBeVisible();

    const del = holdButton(page, 'Zmazať', LEAD_NAME);
    await del.click();
    await expect(inMain(page, LEAD_NAME).first()).toBeVisible();

    await holdToConfirm(del, 200);
    await expect(inMain(page, LEAD_NAME).first()).toBeVisible();

    await holdToConfirm(del);
    await expect(inMain(page, LEAD_NAME)).toHaveCount(0);
    await expect(undoToast(page)).toBeVisible();
    await page.waitForTimeout(UNDO_WINDOW_MS - 2500);
    expect(sync.hasDeleted('leads', LEAD_ID)).toBe(false);

    await undoButton(page).click();
    await expect(inMain(page, LEAD_NAME).first()).toBeVisible();
    await page.waitForTimeout(UNDO_WINDOW_MS + 500);
    expect(sync.hasDeleted('leads', LEAD_ID)).toBe(false);
  });

  test('lead: without Undo the id is in `deleted` once the toast has expired', async ({ page }) => {
    await startSession(page);
    const sync = await captureSync(page);
    await gotoView(page, '#leads');
    await holdToConfirm(holdButton(page, 'Zmazať', LEAD_NAME));
    await expect(undoToast(page)).toBeVisible();
    expect(sync.hasDeleted('leads', LEAD_ID)).toBe(false);
    await expect.poll(() => sync.hasDeleted('leads', LEAD_ID), { timeout: UNDO_WINDOW_MS + 4000 }).toBe(true);
  });

  test('lead: under protocol v1 the held lead stays in the snapshot until expiry', async ({ page }) => {
    await startSession(page);
    const sync = await captureSync(page, 1);
    await gotoView(page, '#leads');
    await holdToConfirm(holdButton(page, 'Zmazať', LEAD_NAME));
    await expect(undoToast(page)).toBeVisible();
    // Any push sent now must still carry the lead, or the server would delete it by omission.
    await page.waitForTimeout(1500);
    for (const push of sync.pushes) {
      expect(push.leads.some((l: any) => l.id === LEAD_ID)).toBe(true);
    }
    await expect(undoToast(page)).toHaveCount(0, { timeout: UNDO_WINDOW_MS + 2000 });
    await expect.poll(() => sync.pushes.some((p) => !p.leads.some((l: any) => l.id === LEAD_ID)), { timeout: 5000 }).toBe(true);
  });

  test('project: hold deletes and Undo restores it', async ({ page }) => {
    await startSession(page);
    await captureSync(page);
    await gotoView(page, '#projects');
    const del = page.getByRole('button', { name: /^Zmazať: .+, podržte pre potvrdenie$/ }).first();
    await expect(del).toBeVisible();
    const label = (await del.getAttribute('aria-label')) ?? '';
    const name = label.replace(/^Zmazať: /, '').replace(/, podržte pre potvrdenie$/, '');
    expect(name).not.toBe('');

    await del.click();
    await expect(inMain(page, name).first()).toBeVisible();

    await holdToConfirm(del);
    await expect(undoToast(page)).toBeVisible();
    await undoButton(page).click();
    await expect(inMain(page, name).first()).toBeVisible();
  });

  test('project: archive then Undo returns it to the active list', async ({ page }) => {
    await startSession(page);
    await captureSync(page);
    await gotoView(page, '#projects');
    const archive = page.getByRole('button', { name: /^Archivovať: .+, podržte pre potvrdenie$/ }).first();
    await expect(archive).toBeVisible();
    await holdToConfirm(archive);
    await expect(undoToast(page)).toBeVisible();
    await undoButton(page).click();
    await expect(archive).toBeVisible();
  });

  test('client: archive from the list, Undo brings it back', async ({ page }) => {
    await startSession(page);
    // The fixture has no client record (client-* id or a positive value adjustment), so seed one.
    await captureSync(page, 2, (payload) => {
      payload.leads = [...payload.leads, { ...(payload.leads[0] as any), id: 'client-qa', name: 'QA Klient', adjustment: 100 } as any];
    });
    await gotoView(page, '#clients');
    const archive = page.getByRole('button', { name: /^Archivovať: .+, podržte pre potvrdenie$/ }).first();
    await expect(archive).toBeVisible();
    const label = (await archive.getAttribute('aria-label')) ?? '';
    const name = label.replace(/^Archivovať: /, '').replace(/, podržte pre potvrdenie$/, '');

    await archive.click();
    await expect(inMain(page, name).first()).toBeVisible();
    await holdToConfirm(archive);
    await expect(undoToast(page)).toBeVisible();
    await undoButton(page).click();
    await expect(inMain(page, name).first()).toBeVisible();
  });
});
