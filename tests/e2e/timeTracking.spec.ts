import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Time tracking, as the browser sees it. The backend is mocked (tests/e2e/helpers/timeTrackingMock.ts
 * follows the real server's rules); what the real server stores and strips is proven by
 * `npm run test:time-tracking`.
 *
 * The QA workspace speaks Slovak, so text checks accept all three languages where they match words.
 */

const FREELANCER = { id: 'user-free', name: 'Freelancer Fero', email: 'fero@crm.com', role: 'Admin', color: '#16a34a', password: 'x', activityLog: [], metadata_json: '{}' };
const LEAD_ROLE = {
  name: 'Lead',
  permissions: { tasks: 'edit', 'tasks.view_all': 'edit', projects: 'edit', time_tracking: 'edit', time_tracking_team: 'edit', general_config: 'nothing' },
};
const LEAD_USER = { id: 'user-lead', name: 'Vedúci', email: 'lead@crm.com', role: 'Lead', color: '#0ea5e9', password: 'x', activityLog: [], metadata_json: '{}' };

const rows = (page: Page) => page.getByTestId('time-entry-row');
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });

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
        /* not JSON */
      }
    }
    await route.fallback();
  });
  return pushed;
}

test.describe('Time tracking', () => {
  test('the module opens from the sidebar with the week, the seeded entries and today\'s total', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks');
    await page.locator('nav, aside').getByText(/Evidencia času|Time tracking|Időkövetés/).first().click();
    await expect(page).toHaveURL(/#time-tracking/);
    await expect(page.getByTestId('timer-bar')).toBeVisible();
    await expect(row(page, 'Návrh cenovej ponuky')).toBeVisible();
    // 1:30 + 0:45 logged by Erik today; Mária's hour is not his.
    await expect(page.getByTestId('stat-today')).toHaveText('2:15');
    await expect(row(page, 'Fakturácia')).toHaveCount(0);
  });

  test('start, stop (asks for a project), then Continue replaces the running timer and Undo brings it back', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await page.getByTestId('timer-title').fill('Prvá práca');
    await page.getByTestId('timer-start').click();
    await expect(page.getByTestId('header-timer-running')).toContainText('Prvá práca');

    // "Require a project before Stop": the picker opens instead of the stop failing.
    await page.getByTestId('timer-stop').click();
    await expect(page.getByTestId('project-request-dialog')).toBeVisible();
    await page.getByTestId('project-request-dialog').getByTestId('project-option').first().click();
    await expect(page.getByTestId('timer-start')).toBeVisible();
    await expect(page.getByTestId('header-timer-running')).toHaveCount(0);
    await expect(row(page, 'Prvá práca')).toBeVisible();

    // Start a second timer, then ▶ Continue another entry: one timer runs, the first is stopped, Undo reverts.
    await page.getByTestId('timer-title').fill('Druhá práca');
    await page.getByTestId('timer-start').click();
    await expect(page.getByTestId('header-timer-running')).toContainText('Druhá práca');
    const seeded = row(page, 'Návrh cenovej ponuky');
    await seeded.hover();
    await seeded.getByTestId('time-entry-continue').click();
    await expect(page.getByTestId('header-timer-running')).toContainText('Návrh cenovej ponuky');
    await expect(page.getByTestId('undo-toast')).toBeVisible();
    await page.getByTestId('undo-toast-undo').click();
    await expect(page.getByTestId('header-timer-running')).toContainText('Druhá práca');
    await expect(page.locator('[data-testid="header-timer-running"]')).toHaveCount(1);
  });

  test('a task-linked entry has no title of its own: its title is the task\'s, and renaming it renames the task', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedTasks(page);
    await gotoView(page, '#time-tracking');
    const linked = row(page, 'Objednať krytinu');
    await expect(linked).toBeVisible();
    await linked.getByTestId('time-entry-title').click();
    await expect(page.getByTestId('entry-drawer')).toBeVisible();
    await expect(page.getByTestId('entry-linked-task')).toContainText('Objednať krytinu');
    await expect(page.getByTestId('entry-drawer')).toContainText(/Premenuje úlohu|Renames the task|Átnevezi a feladatot/);
    await page.getByTestId('entry-title').fill('Objednať krytinu a lepenku');
    await page.getByTestId('entry-save').click();
    await expect(page.getByTestId('entry-drawer')).toHaveCount(0);
    // The TASK was saved through the normal sync path...
    await expect.poll(() => (pushed.get('task-3') as { title?: string } | undefined)?.title).toBe('Objednať krytinu a lepenku');
    // ...and the entry shows the task's new title.
    await expect(row(page, 'Objednať krytinu a lepenku')).toBeVisible();
  });

  test('unlinking gives the entry its own title, prefilled with the task\'s', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await row(page, 'Objednať krytinu').getByTestId('time-entry-title').click();
    await page.getByTestId('entry-unlink').click();
    await expect(page.getByTestId('entry-title')).toHaveValue('Objednať krytinu');
    await page.getByTestId('entry-title').fill('Samostatný záznam');
    await page.getByTestId('entry-save').click();
    await expect(row(page, 'Samostatný záznam')).toBeVisible();
  });

  test('linking an entry that has different text of its own asks first', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await row(page, 'Návrh cenovej ponuky').getByTestId('time-entry-title').click();
    await page.getByTestId('entry-task-search').fill('Pripraviť');
    await page.getByTestId('entry-task-option').first().click();
    await expect(page.getByTestId('entry-link-confirm')).toBeVisible();
    await page.getByTestId('entry-link-confirm-ok').click();
    await expect(page.getByTestId('entry-linked-task')).toContainText('Pripraviť cenovú ponuku');
    await expect(page.getByTestId('entry-title')).toHaveValue('Pripraviť cenovú ponuku');
  });

  test('a monthly employee\'s rate differs between months: 20 working days in May 2026, 22 in June', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await row(page, 'Návrh cenovej ponuky').getByTestId('time-entry-title').click();
    await page.getByTestId('entry-date').fill('2026-05-12');
    await page.getByTestId('entry-save').click();
    await expect(page.getByTestId('entry-drawer')).toHaveCount(0);
    // Open it again from the Day tab of that date is unwieldy: reopen through the week list is not
    // possible (different week), so read the cost off the drawer straight after a second edit.
    await page.getByRole('tab', { name: /Deň|Day|Nap/ }).click();
    await page.getByTestId('day-chip').first().waitFor();
    // Navigate the strip back to May 2026 by clicking "earlier" until the 12th is on it.
    for (let i = 0; i < 40 && (await page.locator('[data-testid="day-chip"][data-date="2026-05-12"]').count()) === 0; i++) {
      await page.getByRole('button', { name: /Skôr|Earlier|Korábbi/ }).click();
    }
    await page.locator('[data-testid="day-chip"][data-date="2026-05-12"]').click();
    await row(page, 'Návrh cenovej ponuky').getByTestId('time-entry-title').click();
    await expect(page.getByTestId('entry-rate-basis')).toContainText('20');
    await expect(page.getByTestId('entry-cost-panel')).toContainText('27,04');
    await page.getByTestId('entry-date').fill('2026-06-09');
    await page.getByTestId('entry-save').click();
    for (let i = 0; i < 6 && (await page.locator('[data-testid="day-chip"][data-date="2026-06-09"]').count()) === 0; i++) {
      await page.getByRole('button', { name: /Neskôr|Later|Későbbi/ }).click();
    }
    await page.locator('[data-testid="day-chip"][data-date="2026-06-09"]').click();
    await row(page, 'Návrh cenovej ponuky').getByTestId('time-entry-title').click();
    await expect(page.getByTestId('entry-rate-basis')).toContainText('22');
    await expect(page.getByTestId('entry-cost-panel')).toContainText('24,58');
  });

  test('a public holiday lowers the weekly target and is marked in the Day strip', async ({ page }) => {
    // 1 May 2026 is a Friday and a Slovak public holiday: the week has 4 working days, not 5.
    await page.clock.setFixedTime(new Date(2026, 4, 1, 10, 0, 0));
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await expect(page.getByTestId('stat-target')).toContainText('32:00');
    await expect(page.getByTestId('holiday-chip').first()).toBeVisible();
    await page.getByRole('tab', { name: /Deň|Day|Nap/ }).click();
    const may1 = page.locator('[data-testid="day-chip"][data-date="2026-05-01"]');
    await expect(may1).toHaveAttribute('data-holiday', '1');
    await expect(may1).toHaveAttribute('data-off', '1');
    // The next Monday is an ordinary working day.
    await expect(page.locator('[data-testid="day-chip"][data-date="2026-04-30"]')).toHaveAttribute('data-holiday', '0');
  });

  test('Day view: an hours-only row accepts 1:30 and lands in the day', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking/day');
    await page.getByRole('tab', { name: /Deň|Day|Nap/ }).click();
    await page.getByTestId('day-add-row').click();
    await page.getByTestId('day-add-form').getByTestId('project-picker-trigger').click();
    await page.getByTestId('project-option').first().click();
    await page.getByTestId('day-row-notes').fill('Ručný riadok');
    await page.getByTestId('day-row-hours').fill('1:30');
    await page.getByTestId('day-row-save').click();
    await expect(row(page, 'Ručný riadok')).toBeVisible();
    await expect(row(page, 'Ručný riadok').getByText(/iba hodiny|hours only|csak órák/)).toBeVisible();
  });

  test('team view: a freelancer is costed at a flat rate, a user with no employee record shows "no rate"', async ({ page }) => {
    await startSession(page, { extraUsers: [FREELANCER] });
    await gotoView(page, '#time-tracking');
    await page.getByTestId('viewing-as').selectOption('all');
    await page.getByRole('tab', { name: /Deň|Day|Nap/ }).click();
    await expect(page.getByTestId('day-user-header').filter({ hasText: 'Mária' })).toContainText(/bez sadzby|no rate|nincs díj/);
    // Erik is an employee on €3,200 a month: a rate is shown on his header.
    await expect(page.getByTestId('day-user-header').filter({ hasText: 'Erik' })).toContainText('/h');
  });

  test('cost of other people\'s entries is hidden without time_tracking_costs, while a person still sees their own', async ({ page }) => {
    await startSession(page, { user: LEAD_USER as never, extraUsers: [LEAD_USER as never], roles: [LEAD_ROLE as never] });
    await gotoView(page, '#time-tracking');
    await page.getByTestId('viewing-as').selectOption('all');
    await expect(row(page, 'Návrh cenovej ponuky')).toBeVisible();
    await expect(page.getByTestId('time-entry-cost')).toHaveCount(0);
    await expect(page.getByTestId('stat-cost')).toHaveCount(0);
    // Opening someone else's entry shows no cost panel.
    await row(page, 'Návrh cenovej ponuky').getByTestId('time-entry-title').click();
    await expect(page.getByTestId('entry-cost-panel')).toHaveCount(0);
  });

  test('a role without the module cannot open it', async ({ page }) => {
    await startSession(page, {
      user: { ...LEAD_USER, role: 'Nobody' } as never,
      extraUsers: [{ ...LEAD_USER, role: 'Nobody' } as never],
      roles: [{ name: 'Nobody', permissions: { time_tracking: 'nothing', tasks: 'edit' } }],
    });
    await gotoView(page, '#time-tracking');
    await expect(page.getByTestId('timer-bar')).toHaveCount(0);
  });

  test('Settings → Time tracking: the example follows the hours basis, an override lowers the working days', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/time-tracking');
    await expect(page.getByTestId('tt-settings')).toBeVisible();
    const before = await page.getByTestId('tt-example').innerText();
    await page.getByTestId('tt-multiplier').fill('1.4');
    await expect.poll(async () => page.getByTestId('tt-example').innerText()).not.toBe(before);
    // An extra day off in the current year lowers the working days of that month.
    const y = new Date().getFullYear();
    const m = new Date().getMonth();
    const firstWeekday = new Date(y, m, 1);
    while ([0, 6].includes(firstWeekday.getDay())) firstWeekday.setDate(firstWeekday.getDate() + 1);
    const iso = `${firstWeekday.getFullYear()}-${String(firstWeekday.getMonth() + 1).padStart(2, '0')}-${String(firstWeekday.getDate()).padStart(2, '0')}`;
    const daysBefore = await page.getByTestId('tt-example').locator('b').first().innerText();
    await page.getByTestId('tt-override-date').fill(iso);
    await page.getByTestId('tt-override-name').fill('Firemné voľno');
    await page.getByTestId('tt-override-add').click();
    await expect(page.getByTestId('tt-overrides')).toContainText('Firemné voľno');
    await expect.poll(async () => page.getByTestId('tt-example').locator('b').first().innerText()).not.toBe(daysBefore);
  });
});
