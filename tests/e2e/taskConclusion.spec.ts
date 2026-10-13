import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * "Requires conclusion" on tasks. A task can ask that whoever finishes it first
 * writes how it went; until then it cannot be set to a done state. The option
 * is only offered while Settings → Tasks has it switched on.
 *
 * Pinned as journeys because the crawler never ticks a box, fills a note and
 * then tries to finish the task, which is the whole feature.
 */

const FLAGGED_TASK = 'Zavolať klientke Silvii'; // fixture task-1, patched below to require a conclusion
const NEW_TASK = 'Odovzdať podklady';
const CONCLUSION = 'Klientka potvrdila termín obhliadky na utorok.';

const SAVE = /Save Changes|Uložiť zmeny|Módosítások mentése/;
const CREATE = /^(Create task|Vytvoriť úlohu|Feladat létrehozása)$/;
const NEW_TASK_BUTTON = /Create New Task|Vytvoriť novú úlohu|Új feladat/;

/**
 * Serves the fixture with Settings → Tasks set as given and task-1 optionally
 * flagged. The fixture discards writes, which would flip the switch back on the
 * next pull, so the pushed value is remembered and served from then on.
 */
async function serveSettings(page: Page, opts: { offer: boolean; defaultRequires?: boolean; flagTask?: boolean }) {
  let offer = opts.offer;
  let defaultRequires = opts.defaultRequires ?? false;
  await page.route('**/sync.php**', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const pushed = (request.postDataJSON() as {
          settings?: { taskSettings?: { offerConclusion?: boolean; defaultRequiresConclusion?: boolean } };
        })?.settings?.taskSettings;
        if (pushed && typeof pushed.offerConclusion === 'boolean') offer = pushed.offerConclusion;
        if (pushed && typeof pushed.defaultRequiresConclusion === 'boolean')
          defaultRequires = pushed.defaultRequiresConclusion;
      } catch {
        /* not JSON — nothing to remember */
      }
      return route.fallback();
    }
    const payload = buildSyncPayload();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...payload,
        tasks: payload.tasks.map((task) =>
          opts.flagTask && task.id === 'task-1' ? { ...task, requiresConclusion: true } : task,
        ),
        settings: {
          ...payload.settings,
          taskSettings: { offerConclusion: offer, defaultRequiresConclusion: defaultRequires },
        },
      }),
    });
  });
}

/** Every task and settings blob the app pushed to /sync.php, newest write winning. */
function recordPushes(page: Page) {
  const tasks = new Map<string, Record<string, unknown>>();
  const settings: Record<string, unknown>[] = [];
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as {
          tasks?: Record<string, unknown>[];
          settings?: Record<string, unknown>;
        };
        for (const task of body?.tasks ?? []) tasks.set(String(task.id), task);
        if (body?.settings) settings.push(body.settings);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return { tasks, settings };
}

const pushedByTitle = (pushed: Map<string, Record<string, unknown>>, title: string) =>
  [...pushed.values()].find((task) => task.title === title);

/** The flagged fixture task's card on the board (its title is a span, not a heading). */
const taskCard = (page: Page) =>
  page.locator('div.group').filter({ has: page.locator(`span[title="${FLAGGED_TASK}"]`) }).last();

/** Opens the drawer of the fixture task due tomorrow (the Tomorrow list starts collapsed). */
async function openEditDrawer(page: Page) {
  await page.getByRole('button', { name: /^(Tomorrow|Zajtra|Holnap) \(\d+\)/ }).first().click();
  const card = taskCard(page);
  // The card renders a desktop and a mobile row; only one is visible.
  await card.getByTitle(/^(Edit Task|Upraviť úlohu|Feladat szerkesztése)$/).locator('visible=true').first().click();
  return page.locator('div.fixed.inset-0').filter({ hasText: /Edit Task|Upraviť úlohu|Feladat szerkesztése/ });
}

/** Picks a task state in the drawer's status dropdown. */
async function chooseDrawerStatus(drawer: ReturnType<Page['locator']>, label: RegExp) {
  await drawer.getByRole('button', { name: /^(New|Nové|Új)$/ }).first().click();
  await drawer.page().getByRole('option', { name: label }).click();
}

test.describe('Task: requires conclusion', () => {
  test('Settings → Tasks switch is saved and gates the checkbox', async ({ page }) => {
    await startSession(page);
    await serveSettings(page, { offer: false });
    const pushes = recordPushes(page);

    // Off: the quick-create popup offers nothing extra.
    await gotoView(page, '#tasks');
    await page.getByRole('button', { name: NEW_TASK_BUTTON }).first().click();
    const popup = page.locator('[data-quick-task-form]');
    await expect(popup).toBeVisible();
    await expect(popup.getByTestId('task-requires-conclusion')).toHaveCount(0);

    // Switch it on in Settings → Tasks.
    await gotoView(page, '#settings/tasks');
    const toggle = page.getByTestId('task-settings-offer-conclusion');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect.poll(() => pushes.settings.at(-1)?.taskSettings).toEqual({
      offerConclusion: true,
      defaultRequiresConclusion: false,
    });
    await page.screenshot({ path: 'test-results/task-conclusion-settings.png' });

    // On: the popup now has the checkbox, and ticking it travels with the task.
    await gotoView(page, '#tasks');
    await page.getByRole('button', { name: NEW_TASK_BUTTON }).first().click();
    const popup2 = page.locator('[data-quick-task-form]');
    const box = popup2.getByTestId('task-requires-conclusion');
    await expect(box).toBeVisible();
    await popup2.locator('textarea').first().fill(NEW_TASK);
    await box.check();
    await popup2.getByRole('button', { name: CREATE }).click();
    await expect.poll(() => pushedByTitle(pushes.tasks, NEW_TASK)?.requiresConclusion).toBe(true);
  });

  test('the checkbox is not sent when it was left unticked', async ({ page }) => {
    await startSession(page);
    await serveSettings(page, { offer: true });
    const pushes = recordPushes(page);
    await gotoView(page, '#tasks');

    await page.getByRole('button', { name: NEW_TASK_BUTTON }).first().click();
    const popup = page.locator('[data-quick-task-form]');
    await expect(popup.getByTestId('task-requires-conclusion')).not.toBeChecked();
    await popup.locator('textarea').first().fill(NEW_TASK);
    await popup.getByRole('button', { name: CREATE }).click();
    await expect.poll(() => pushedByTitle(pushes.tasks, NEW_TASK)).toBeTruthy();
    expect(pushedByTitle(pushes.tasks, NEW_TASK)?.requiresConclusion ?? false).toBe(false);
  });

  test('the defaultRequiresConclusion setting controls the default state of the checkbox on new tasks', async ({
    page,
  }) => {
    await startSession(page);
    await serveSettings(page, { offer: true, defaultRequires: false });
    const pushes = recordPushes(page);

    // Switch defaultRequiresConclusion on in Settings → Tasks
    await gotoView(page, '#settings/tasks');
    const defaultToggle = page.getByTestId('task-settings-default-conclusion');
    await expect(defaultToggle).not.toBeChecked();
    await defaultToggle.check();
    await expect
      .poll(() => pushes.settings.at(-1)?.taskSettings)
      .toEqual({ offerConclusion: true, defaultRequiresConclusion: true });

    // New task modal now has the checkbox checked by default
    await gotoView(page, '#tasks');
    await page.getByRole('button', { name: NEW_TASK_BUTTON }).first().click();
    const popup = page.locator('[data-quick-task-form]');
    await expect(popup.getByTestId('task-requires-conclusion')).toBeChecked();
    await popup.locator('textarea').first().fill(NEW_TASK);
    await popup.getByRole('button', { name: CREATE }).click();
    await expect.poll(() => pushedByTitle(pushes.tasks, NEW_TASK)?.requiresConclusion).toBe(true);
  });

  test('the edit drawer refuses Done until the conclusion is written', async ({ page }) => {
    await startSession(page);
    // The setting is OFF here on purpose: a task that already carries the flag
    // keeps requiring a conclusion after the option is switched off.
    await serveSettings(page, { offer: false, flagTask: true });
    const pushes = recordPushes(page);
    await gotoView(page, '#tasks');

    const drawer = await openEditDrawer(page);
    await expect(drawer.getByTestId('task-requires-conclusion')).toBeChecked();
    // The box appears only once the task is being finished.
    await expect(drawer.getByTestId('task-conclusion-input')).toHaveCount(0);

    await chooseDrawerStatus(drawer, /^(Done|Hotovo|Kész)$/);
    const input = drawer.getByTestId('task-conclusion-input');
    await expect(input).toBeVisible();
    await page.screenshot({ path: 'test-results/task-conclusion-drawer.png' });

    // Saving without it is refused: the drawer stays open and nothing is pushed as done.
    await drawer.getByRole('button', { name: SAVE }).click();
    await expect(drawer).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await page.waitForTimeout(400);
    expect(pushedByTitle(pushes.tasks, FLAGGED_TASK)?.status).not.toBe('Done');

    // Blank space is not a conclusion either.
    await input.fill('   ');
    await drawer.getByRole('button', { name: SAVE }).click();
    await expect(drawer).toBeVisible();

    // Written, it saves, and the text travels with the task.
    await input.fill(CONCLUSION);
    await drawer.getByRole('button', { name: SAVE }).click();
    await expect.poll(() => pushedByTitle(pushes.tasks, FLAGGED_TASK)?.status).toBe('Done');
    expect(pushedByTitle(pushes.tasks, FLAGGED_TASK)?.conclusion).toBe(CONCLUSION);
  });

  test('the board status dropdown asks for the conclusion first', async ({ page }) => {
    await startSession(page);
    await serveSettings(page, { offer: true, flagTask: true });
    const pushes = recordPushes(page);
    await gotoView(page, '#tasks');

    await page.getByRole('button', { name: /^(Tomorrow|Zajtra|Holnap) \(\d+\)/ }).first().click();
    const card = taskCard(page);
    await card.getByRole('button', { name: /^(New|Nové|Új)$/ }).first().click();
    await page.getByRole('option', { name: /^(Done|Hotovo|Kész)$/ }).click();

    const dialog = page.getByTestId('task-conclusion-dialog');
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: /Complete task|Dokončiť úlohu|Feladat befejezése/ });
    await expect(confirm).toBeDisabled();
    await page.screenshot({ path: 'test-results/task-conclusion-dialog.png' });

    // Backing out leaves the task exactly as it was.
    await dialog.getByRole('button', { name: /^(Cancel|Zrušiť|Mégse)$/ }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(400);
    expect(pushedByTitle(pushes.tasks, FLAGGED_TASK)?.status ?? 'New').not.toBe('Done');

    // Going through again, with a conclusion, completes it.
    await card.getByRole('button', { name: /^(New|Nové|Új)$/ }).first().click();
    await page.getByRole('option', { name: /^(Done|Hotovo|Kész)$/ }).click();
    await dialog.locator('textarea').fill(CONCLUSION);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => pushedByTitle(pushes.tasks, FLAGGED_TASK)?.status).toBe('Done');
    expect(pushedByTitle(pushes.tasks, FLAGGED_TASK)?.conclusion).toBe(CONCLUSION);
  });

  test('a task without the flag completes straight away', async ({ page }) => {
    await startSession(page);
    await serveSettings(page, { offer: true });
    const pushes = recordPushes(page);
    await gotoView(page, '#tasks');

    await page.getByRole('button', { name: /^(Tomorrow|Zajtra|Holnap) \(\d+\)/ }).first().click();
    const card = taskCard(page);
    await card.getByRole('button', { name: /^(New|Nové|Új)$/ }).first().click();
    await page.getByRole('option', { name: /^(Done|Hotovo|Kész)$/ }).click();

    await expect(page.getByTestId('task-conclusion-dialog')).toHaveCount(0);
    await expect.poll(() => pushedByTitle(pushes.tasks, FLAGGED_TASK)?.status).toBe('Done');
  });

  test('unticking the conclusion checkbox in existing tasks works for the task creator / admin', async ({ page }) => {
    await startSession(page);
    await serveSettings(page, { offer: true, flagTask: true });
    const pushes = recordPushes(page);
    await gotoView(page, '#tasks');

    const drawer = await openEditDrawer(page);
    const box = drawer.getByTestId('task-requires-conclusion');
    await expect(box).toBeChecked();
    await expect(box).toBeEnabled();

    // Unticking works for Admin / Creator
    await box.uncheck();
    await expect(box).not.toBeChecked();
    await drawer.getByRole('button', { name: SAVE }).click();
    await expect.poll(() => pushedByTitle(pushes.tasks, FLAGGED_TASK)?.requiresConclusion ?? false).toBe(false);
  });
});

