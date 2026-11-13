import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

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
