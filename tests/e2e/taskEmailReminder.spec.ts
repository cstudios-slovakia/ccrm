import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * "Notify me about the task by e-mail" in the task drawers. The server sends
 * the mail (api/task_reminders.php); here we check that the choice is made in
 * both drawers, travels to /sync.php as `emailReminders` keyed by the signed-in
 * user, and never disturbs a colleague's own reminder on the same task.
 */

const EDIT_TASK = 'Zavolať klientke Silvii'; // fixture task-1, due tomorrow 10:00, carries Mária's reminder
const NEW_TASK = 'Skontrolovať dodávku škridiel';

/** Every task the app pushed to /sync.php, newest write winning per id. */
function recordSyncedTasks(page: Page) {
  const pushed = new Map<string, Record<string, unknown>>();
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { tasks?: Record<string, unknown>[] };
        for (const task of body?.tasks ?? []) pushed.set(String(task.id), task);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

/**
 * Opens the drawer of the fixture task due tomorrow. The Tomorrow list starts
 * collapsed on My Calendar, so it is expanded first.
 */
async function openEditDrawer(page: Page) {
  await page.getByRole('button', { name: /^(Tomorrow|Zajtra|Holnap) \(\d+\)/ }).first().click();
  const card = page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: EDIT_TASK }) }).last();
  await card.getByTitle(/^(Edit Task|Upraviť úlohu|Feladat szerkesztése)$/).click();
  return page.locator('div.fixed.inset-0').filter({ hasText: /Edit Task|Upraviť úlohu|Feladat szerkesztése/ });
}

const pushedByTitle = (pushed: Map<string, Record<string, unknown>>, title: string) =>
  [...pushed.values()].find((task) => task.title === title);

test.describe('Task e-mail reminder', () => {
  test('the edit drawer sets my reminder and keeps a colleague’s', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedTasks(page);
    await gotoView(page, '#tasks');

    const drawer = await openEditDrawer(page);
    const field = drawer.getByTestId('task-email-reminder');

    await expect(field).toContainText('Mária');
    const toggle = field.getByTestId('task-email-reminder-toggle');
    await expect(toggle).not.toBeChecked();

    await toggle.check();
    // Ticking it picks "in the morning", the day the task is due.
    await expect(field.getByTestId('task-email-reminder-morning')).toHaveAttribute('aria-checked', 'true');
    await field.getByTestId('task-email-reminder-1h').click();
    await expect(field.getByTestId('task-email-reminder-1h')).toHaveAttribute('aria-checked', 'true');
    // The fixture task is due tomorrow at 10:00, so the mail is due at 09:00.
    await expect(field.getByTestId('task-email-reminder-hint')).toContainText('09:00');
    await expect(field.getByTestId('task-email-reminder-hint')).toContainText('erik@crm.com');
    await field.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/task-email-reminder-edit.png' });

    await drawer.getByRole('button', { name: /Save Changes|Uložiť zmeny|Módosítások mentése/ }).click();
    await expect.poll(() => pushedByTitle(pushed, EDIT_TASK)?.emailReminders).toEqual({ Mária: '1d', Erik: '1h' });
  });

  test('the new-task drawer creates the task with my reminder', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedTasks(page);
    await gotoView(page, '#tasks');

    await page.getByRole('button', { name: /Create New Task|Vytvoriť novú úlohu|Új feladat/ }).first().click();
    const drawer = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('button', { name: /Save Task|Uložiť|Mentés/ }) }).last();
    await drawer.locator('input[type="text"]').first().fill(NEW_TASK);

    const field = drawer.getByTestId('task-email-reminder');
    await field.getByTestId('task-email-reminder-toggle').check();
    await field.getByTestId('task-email-reminder-1d').click();
    await expect(field.getByTestId('task-email-reminder-1d')).toHaveAttribute('aria-checked', 'true');

    await drawer.getByRole('button', { name: /^(Save Task|Uložiť|Mentés)$/ }).click();
    await expect.poll(() => pushedByTitle(pushed, NEW_TASK)?.emailReminders).toEqual({ Erik: '1d' });
  });

  test('unticking removes only my reminder', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedTasks(page);
    await gotoView(page, '#tasks');

    const drawer = await openEditDrawer(page);
    const toggle = drawer.getByTestId('task-email-reminder-toggle');

    await toggle.check();
    await toggle.uncheck();
    await expect(drawer.getByTestId('task-email-reminder-morning')).toHaveCount(0);

    await drawer.getByRole('button', { name: /Save Changes|Uložiť zmeny|Módosítások mentése/ }).click();
    await expect.poll(() => pushedByTitle(pushed, EDIT_TASK)?.emailReminders).toEqual({ Mária: '1d' });
  });
});
