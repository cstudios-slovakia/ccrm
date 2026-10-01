import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Project statuses are configured in Settings → Project settings, the way the
 * lead pipeline stages are — and "paid in full" settles a project's value in
 * one finance row. Both are pinned as journeys because what matters is what
 * reaches the server: a status list the next device loads, projects moved off
 * a deleted status, and an income row every finance view counts.
 *
 * The dataset has project-1 and project-3 "active" and project-2 "on_hold".
 * Project-1 is worth 18 400 € (its money attribute) with 2 500 € already paid.
 * The fixture runs in Slovak.
 */

type Pushed = {
  settings?: { projectStatuses?: { key: string; label?: string; group: string }[] };
  projects: Map<string, Record<string, unknown>>;
  financialRecords: Map<string, Record<string, unknown>>;
};

/** What the app pushed to /sync.php, newest write winning. */
function recordPushes(page: Page): Pushed {
  const pushed: Pushed = { projects: new Map(), financialRecords: new Map() };
  // Registered after the fixture's mocks, so Playwright asks this one first.
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as {
          settings?: Pushed['settings'];
          projects?: Record<string, unknown>[];
          financialRecords?: Record<string, unknown>[];
        };
        if (body?.settings) pushed.settings = body.settings;
        for (const p of body?.projects ?? []) pushed.projects.set(String(p.id), p);
        for (const r of body?.financialRecords ?? []) pushed.financialRecords.set(String(r.id), r);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

const statusRow = (page: Page, key: string) => page.getByTestId(`project-status-row-${key}`);
const pushedKeys = (pushed: Pushed) => (pushed.settings?.projectStatuses ?? []).map((d) => d.key);

test.describe('Project statuses', () => {
  test('statuses are added, renamed and removed in settings, and the projects list follows', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushes(page);
    page.on('dialog', (dialog) => void dialog.accept());
    await gotoView(page, '#settings/projects');

    // The five built-ins, each under its group.
    for (const key of ['new', 'active', 'on_hold', 'completed', 'cancelled']) {
      await expect(statusRow(page, key)).toBeVisible();
    }

    // Add one — it lands in "In progress", the form's default group.
    await page.getByLabel('Nový stav projektu').fill('Čaká na klienta');
    await page.getByRole('button', { name: 'Pridať stav' }).click();
    await expect(statusRow(page, 'caka_na_klienta')).toContainText('Čaká na klienta');
    await expect
      .poll(() => pushedKeys(pushed), { timeout: 10_000 })
      .toEqual(['new', 'active', 'on_hold', 'caka_na_klienta', 'completed', 'cancelled']);

    // Rename a built-in: only the label changes, the key projects store stays.
    await statusRow(page, 'active').getByTitle('Premenovať').click();
    const input = statusRow(page, 'active').locator('input');
    await input.fill('V realizácii');
    await input.press('Enter');
    await expect(statusRow(page, 'active')).toContainText('V realizácii');
    await expect
      .poll(() => pushed.settings?.projectStatuses?.find((d) => d.key === 'active')?.label, { timeout: 10_000 })
      .toBe('V realizácii');

    // Remove "on hold": project-2 sits in it and is moved to where projects start.
    await statusRow(page, 'on_hold').getByRole('button', { name: 'Odstrániť stav' }).click();
    await expect(statusRow(page, 'on_hold')).toHaveCount(0);
    await expect.poll(() => pushed.projects.get('project-2')?.status, { timeout: 10_000 }).toBe('new');
    await expect.poll(() => pushedKeys(pushed), { timeout: 10_000 }).not.toContain('on_hold');
    await page.screenshot({ path: 'test-results/project-statuses-settings.png', fullPage: false });

    // The projects list speaks the new list: a chip per status, renamed included.
    await gotoView(page, '#projects');
    await expect(page.getByRole('button', { name: /V realizácii/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Čaká na klienta/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Pozastavený/ })).toHaveCount(0);
  });

  test('the last open status cannot be removed', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/projects');
    page.on('dialog', (dialog) => void dialog.accept());

    for (const key of ['on_hold', 'active']) {
      await statusRow(page, key).getByRole('button', { name: 'Odstrániť stav' }).click();
      await expect(statusRow(page, key)).toHaveCount(0);
    }
    // "new" is now the only open status left — a new project would have nowhere to start.
    await statusRow(page, 'new').getByRole('button', { name: 'Odstrániť stav' }).click();
    await expect(statusRow(page, 'new')).toBeVisible();
  });
});

test.describe('Project value paid in full', () => {
  test('one click settles the rest of the value as a paid income row', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushes(page);
    page.on('dialog', (dialog) => void dialog.accept());
    await gotoView(page, '#projects/project-1?tab=finances');

    // 18 400 € value, 2 500 € already paid: 15 900 € left.
    const settle = page.getByRole('button', { name: /Označiť zvyšok ako uhradený/ });
    await expect(settle).toBeVisible();
    await expect(settle).toContainText(/15\s?900/);
    await settle.click();

    await expect(page.getByText('Plne vyfakturované')).toBeVisible();
    await expect(settle).toHaveCount(0);

    await expect
      .poll(
        () =>
          [...pushed.financialRecords.values()].find(
            (r) => r.projectId === 'project-1' && r.id !== 'fr-1',
          ),
        { timeout: 10_000 },
      )
      .toMatchObject({
        type: 'income',
        status: 'paid',
        amountReal: 15900,
        amountPlanned: 15900,
        clientId: 'lead-silvia',
        isRecurring: false,
      });
    await page.screenshot({ path: 'test-results/project-paid-in-full.png', fullPage: false });
  });
});
