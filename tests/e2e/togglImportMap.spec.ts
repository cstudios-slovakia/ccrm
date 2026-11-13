import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { holdToConfirm } from './helpers/hold';

/**
 * Settings → Time tracking → Toggl import: picking a project in a mapping dropdown saves the
 * mapping by itself, without Preview or Import. The import endpoint is mocked here; the rest of
 * /api/time_entries.php falls through to the shared time-tracking mock.
 */
test('a Toggl project mapping is saved as soon as it is picked', async ({ page }) => {
  await startSession(page);
  const saved: Array<Record<string, unknown>> = [];
  await page.route('**/api/time_entries.php**', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const body = req.postDataJSON() as Record<string, unknown>;
    if (body?.action !== 'import') return route.fallback();
    const json = (payload: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    if (body.mode === 'catalog') {
      return json({
        success: true,
        projects: [{ id: '9001', name: 'Toggl Web' }],
        users: [],
        ccrmProjects: [{ id: 'project-1', name: 'Strecha Silvia — etapa 1' }],
        ccrmUsers: [],
        projectMap: {},
        userMap: {},
        defaultUserMap: {},
      });
    }
    if (body.mode === 'saveMap') {
      saved.push(body);
      return json({ success: true, saved: true });
    }
    return json({ success: false, code: 'unexpected_mode' });
  });

  await gotoView(page, '#settings/projects/time');
  const projects = page.getByTestId('toggl-import-projects');
  await projects.locator('li', { hasText: 'Toggl Web' }).getByRole('button').click();
  await page.getByRole('option', { name: 'Strecha Silvia — etapa 1' }).click();

  await expect(page.getByTestId('toggl-import-map-status')).toHaveText(/Priradenie uložené|Mapping saved|Hozzárendelés mentve/);
  expect(saved).toHaveLength(1);
  expect(saved[0].projectMap).toEqual({ '9001': 'project-1' });
});

test('mapped Toggl projects and users are listed first, and a partial project list is flagged', async ({ page }) => {
  await startSession(page);
  await page.route('**/api/time_entries.php**', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const body = req.postDataJSON() as Record<string, unknown>;
    if (body?.action !== 'import' || body.mode !== 'catalog') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        projects: [
          { id: '1', name: 'Alpha unmapped' },
          { id: '2', name: 'Bravo mapped' },
          { id: '3', name: 'Charlie unmapped' },
        ],
        projectsTruncated: true,
        users: [
          { id: '11', name: 'Ann unmapped', email: 'ann@example.com' },
          { id: '12', name: 'Ben mapped', email: 'ben@example.com' },
        ],
        ccrmProjects: [{ id: 'project-1', name: 'Strecha Silvia — etapa 1' }],
        ccrmUsers: [{ id: 'user-1', name: 'Ben Local', email: 'ben@example.com' }],
        projectMap: { '2': 'project-1' },
        userMap: { '12': 'user-1' },
        defaultUserMap: {},
      }),
    });
  });

  await gotoView(page, '#settings/projects/time');
  const projects = page.getByTestId('toggl-import-projects');
  await expect(projects.locator('li').first()).toContainText('Bravo mapped');
  await expect(projects.locator('li').nth(1)).toContainText('Alpha unmapped');
  await expect(page.getByTestId('toggl-import-users').locator('li').first()).toContainText('Ben mapped');
  await expect(page.getByTestId('toggl-import-projects-truncated')).toBeVisible();
});

test('with nobody mapped, "only one Toggl user" is on and the picked user is sent with the import', async ({ page }) => {
  await startSession(page);
  const runs: Array<Record<string, unknown>> = [];
  await page.route('**/api/time_entries.php**', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const body = req.postDataJSON() as Record<string, unknown>;
    if (body?.action !== 'import') return route.fallback();
    const json = (payload: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    if (body.mode === 'catalog') {
      return json({
        success: true,
        projects: [{ id: '1', name: 'WAAI' }],
        users: [
          { id: '77', name: 'Token Owner', email: 'owner@example.com' },
          { id: '78', name: 'Somebody Else', email: 'else@example.com' },
        ],
        me: '77',
        ccrmProjects: [],
        ccrmUsers: [],
        projectMap: {},
        userMap: {},
        defaultUserMap: {},
      });
    }
    if (body.mode === 'preview') {
      runs.push(body);
      return json({ success: true, preview: true, total: 3, ready: 3 });
    }
    return json({ success: true, saved: true });
  });

  await gotoView(page, '#settings/projects/time');
  const onlyMe = page.getByTestId('toggl-import-only-me');
  await expect(onlyMe).toBeChecked();
  // The Toggl user with the signed-in person's e-mail is preselected (never the token's owner).
  const picker = page.getByTestId('toggl-import-only-user');
  await expect(picker).toContainText('Token Owner');
  await page.getByTestId('toggl-import-preview').click();
  await expect(page.getByTestId('toggl-import-result')).toBeVisible();
  expect(runs[0].onlyUser).toBe('77');

  // Any other Toggl user can be picked instead.
  await picker.getByRole('button').click();
  await page.getByRole('option', { name: /Somebody Else/ }).click();
  await page.getByTestId('toggl-import-preview').click();
  await expect.poll(() => runs.length).toBe(2);
  expect(runs[1].onlyUser).toBe('78');

  await onlyMe.uncheck();
  await page.getByTestId('toggl-import-preview').click();
  await expect.poll(() => runs.length).toBe(3);
  expect(runs[2].onlyUser).toBe('');
});

test('a multi-year period imports in short windows, adds up the counts and resets the hold ring', async ({ page }) => {
  await startSession(page);
  const commits: Array<{ from: string; to: string }> = [];
  await page.route('**/api/time_entries.php**', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const body = req.postDataJSON() as Record<string, unknown>;
    if (body?.action !== 'import') return route.fallback();
    const json = (payload: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    if (body.mode === 'catalog') {
      return json({
        success: true,
        projects: [
          { id: '1', name: 'WAAI', archived: false },
          { id: '2', name: 'WAAI', archived: true },
        ],
        users: [],
        ccrmProjects: [{ id: 'project-1', name: 'Strecha Silvia — etapa 1' }],
        ccrmUsers: [],
        projectMap: {},
        userMap: {},
        defaultUserMap: {},
      });
    }
    if (body.mode === 'commit') {
      const from = String(body.from);
      const to = String(body.to);
      // The server refuses more than a year per request; the screen must never send that.
      if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) return json({ success: false, code: 'range_too_long' });
      commits.push({ from, to });
      return json({ success: true, preview: false, total: 2, imported: 2, alreadyImported: 0, ready: 2 });
    }
    return json({ success: true, saved: true });
  });

  await gotoView(page, '#settings/projects/time');
  // Two Toggl projects with one name: the archived one says so.
  await expect(page.getByTestId('toggl-import-projects-archived')).toHaveCount(1);

  await page.getByTestId('toggl-import-from').fill('2024-01-13');
  await page.getByTestId('toggl-import-to').fill('2026-11-13');
  const holdButton = page.getByRole('button', { name: /2024-01-13 – 2026-11-13/ });
  await holdToConfirm(holdButton);

  await expect(page.getByTestId('toggl-import-result')).toContainText(new RegExp(`${commits.length * 2}`));
  expect(commits.length).toBeGreaterThan(3);
  expect(commits[0].from).toBe('2024-01-13');
  expect(commits[commits.length - 1].to).toBe('2026-11-13');
  // (The panel's Surface does not carry a test id, so this is checked on the page.)
  await expect(page.getByText(/Záznam času sa nepodarilo uložiť|Could not save the time entry/)).toHaveCount(0);
  // The ring empties again instead of staying full over the button.
  await expect(holdButton.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});
