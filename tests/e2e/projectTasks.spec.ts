import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * A project's Tasks tab: tasks are written straight into it (Enter adds one, a
 * pasted list adds one per line), they are ordinary synced tasks carrying the
 * project's id, and every field stays editable from the tab itself.
 *
 * Pinned as a journey rather than left to the crawler because the crawler
 * would never type a line and press Enter, which is the whole feature.
 */

const PROJECT_NAME = 'Strecha Silvia — etapa 1';
const TAB = /^(Tasks|Úlohy|Feladatok)/;

/** Every task the app pushed to /sync.php, newest write winning per id. */
function recordSyncedTasks(page: Page) {
  const pushed = new Map<string, Record<string, unknown>>();
  // Registered after the fixture's mocks, so Playwright asks this one first.
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

async function openProjectTasks(page: Page) {
  await gotoView(page, '#projects');
  await page.getByText(PROJECT_NAME).first().click();
  const tab = page.getByRole('button', { name: TAB });
  await tab.first().click();
  return page.getByRole('textbox', { name: /New tasks, one per line|Nové úlohy, jedna na riadok|Új feladatok, soronként egy/ });
}

const row = (page: Page, title: string) => page.locator('li').filter({ hasText: title });

test.describe('Project tasks', () => {
  test('write tasks into a project, one per line, then edit and finish one', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedTasks(page);
    const input = await openProjectTasks(page);

    // A task already linked to the project in the dataset is listed.
    await expect(row(page, 'Objednať krytinu')).toBeVisible();

    // One line + Enter → one task, and the box is ready for the next.
    await input.fill('QA úloha jedna');
    await input.press('Enter');
    await expect(row(page, 'QA úloha jedna')).toBeVisible();
    await expect(input).toHaveValue('');

    // A pasted list + Enter → one task per line, markers dropped.
    await input.fill('- QA hromadná prvá\n- QA hromadná druhá\n\n- QA hromadná tretia');
    await input.press('Enter');
    for (const title of ['QA hromadná prvá', 'QA hromadná druhá', 'QA hromadná tretia']) {
      await expect(row(page, title)).toBeVisible();
    }
    await expect(page.locator('li').filter({ hasText: '- QA hromadná' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/project-tasks-tab.png', fullPage: false });

    // They are real tasks on the wire, linked to the project.
    await expect
      .poll(() => ['QA úloha jedna', 'QA hromadná prvá', 'QA hromadná druhá', 'QA hromadná tretia']
        .every((title) => [...pushed.values()].some((t) => t.title === title && t.relatedProjectId === 'project-1')), {
        timeout: 10_000,
      })
      .toBe(true);

    // Clicking a row opens the full task drawer; a change there is saved.
    await row(page, 'QA hromadná druhá').getByRole('button', { name: 'QA hromadná druhá' }).click();
    const drawer = page.locator('div.fixed.inset-0').filter({ hasText: /Edit Task|Upraviť úlohu|Feladat szerkesztése/ });
    await expect(drawer).toBeVisible();
    await page.screenshot({ path: 'test-results/project-tasks-drawer.png', fullPage: false });
    const title = drawer.locator('form input[type="text"]').first();
    await title.fill('QA hromadná druhá — upravená');
    await drawer.locator('button[type="submit"]').click();
    await expect(drawer).toBeHidden();
    await expect(row(page, 'QA hromadná druhá — upravená')).toBeVisible();
    await expect
      .poll(() => [...pushed.values()].some((t) => t.title === 'QA hromadná druhá — upravená' && t.relatedProjectId === 'project-1'), {
        timeout: 10_000,
      })
      .toBe(true);

    // The checkbox finishes a task: it leaves the open list.
    await row(page, 'QA úloha jedna').getByRole('checkbox').click();
    await expect(page.locator('ul').first().locator('li').filter({ hasText: 'QA úloha jedna' })).toHaveCount(0);
    await expect
      .poll(() => {
        const task = [...pushed.values()].find((t) => t.title === 'QA úloha jedna');
        return Boolean(task?.completedAt);
      }, { timeout: 10_000 })
      .toBe(true);
  });

  test('a project-linked task shows its project on the Tasks board', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks');
    // The board groups by time; the linked task is due in six days, so open the
    // team-wide board where every open task is listed.
    await page.getByRole('button', { name: /Global Tasks|Globálne úlohy|Globális feladatok/ }).first().click();
    const card = page.locator('div').filter({ hasText: /^Objednať krytinu/ }).first();
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();
    await expect(card).toBeVisible();
  });
});
