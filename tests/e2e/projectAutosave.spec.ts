import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * The project view has no Save button: every change saves itself. The name is
 * renamed from the header, the project card is edited in place (managers
 * included), and the custom attributes card keeps an Edit mode of its own that
 * does not drag the project card along with it.
 *
 * Checked on the wire: what reached /sync.php is what counts, not what the
 * screen happens to show.
 */

const PROJECT_NAME = 'Strecha Silvia — etapa 1';
const RENAMED = 'Strecha Silvia — QA premenovaná';

/** Every project the app pushed to /sync.php, newest write winning per id. */
function recordSyncedProjects(page: Page) {
  const pushed = new Map<string, Record<string, unknown>>();
  // Registered after the fixture's mocks, so Playwright asks this one first.
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { projects?: Record<string, unknown>[] };
        for (const project of body?.projects ?? []) pushed.set(String(project.id), project);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

const pushedProject = (pushed: Map<string, Record<string, unknown>>) => () => pushed.get('project-1') ?? {};

test.describe('Project autosave', () => {
  test('no Save button; rename, managers and attributes save themselves', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedProjects(page);
    await gotoView(page, '#projects');
    await page.getByText(PROJECT_NAME).first().click();

    await expect(page.getByTestId('project-save-state')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Save Changes|Uložiť zmeny|Mentés)$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Save|Uložiť)$/ })).toHaveCount(0);

    // Rename from the header: pencil, type, Enter.
    await page.getByRole('button', { name: /Rename project|Premenovať projekt|Projekt átnevezése/ }).click();
    const nameInput = page.locator('h2 input');
    await nameInput.fill(RENAMED);
    await nameInput.press('Enter');
    await expect(page.getByRole('heading', { name: RENAMED })).toBeVisible();
    await expect.poll(() => pushedProject(pushed)().name, { timeout: 10_000 }).toBe(RENAMED);

    // Escape drops a rename.
    await page.getByRole('button', { name: /Rename project|Premenovať projekt|Projekt átnevezése/ }).click();
    await page.locator('h2 input').fill('Toto sa neuloží');
    await page.locator('h2 input').press('Escape');
    await expect(page.getByRole('heading', { name: RENAMED })).toBeVisible();

    // Managers are edited in place — no Edit mode on the project card.
    const managerPicker = page.getByRole('button', { name: /Add another manager|Pridať ďalšieho manažéra|További menedzser/ });
    await managerPicker.click();
    await page.getByRole('option', { name: 'Mária' }).click();
    await expect
      .poll(() => pushedProject(pushed)().managers, { timeout: 10_000 })
      .toEqual(['Erik', 'Mária']);

    // Custom attributes are edited in place too — no Edit/Done mode.
    await expect(page.getByRole('button', { name: /^(Edit|Upraviť|Szerkesztés|Done|Hotovo|Kész)$/ })).toHaveCount(0);
    const area = page.locator('input[type="number"]').first();
    await area.fill('200');
    await expect
      .poll(() => String((pushedProject(pushed)().data as Record<string, unknown> | undefined)?.['attr-area']), { timeout: 10_000 })
      .toBe('200');

    await expect(page.getByTestId('project-save-state')).toHaveText(/All changes saved|Všetko uložené|Minden mentve/);
    await page.screenshot({ path: 'test-results/project-autosave.png', fullPage: false });
  });

  test('an edit made just before leaving is still saved', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedProjects(page);
    await gotoView(page, '#projects');
    await page.getByText(PROJECT_NAME).first().click();

    await page.getByRole('button', { name: /Rename project|Premenovať projekt|Projekt átnevezése/ }).click();
    await page.locator('h2 input').fill(RENAMED);
    await page.locator('h2 input').press('Enter');
    // Straight back to the list, inside the autosave pause.
    await page.getByRole('button', { name: /Back to list|Späť na zoznam|Vissza a listához/ }).click();

    await expect(page.getByText(RENAMED).first()).toBeVisible();
    await expect.poll(() => pushedProject(pushed)().name, { timeout: 10_000 }).toBe(RENAMED);
    // And the list stays the list — the late save does not reopen the project.
    await expect(page.getByTestId('project-save-state')).toHaveCount(0);
  });
});
