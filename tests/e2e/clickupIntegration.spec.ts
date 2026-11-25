import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

test.describe('ClickUp integration & project list sync', () => {
  test('Settings -> Integrations -> ClickUp tests connection, picks workspace and saves', async ({ page }) => {
    const consoleErrors = await startSession(page);
    await gotoView(page, '#settings/integrations/clickup');

    await expect(page.getByTestId('settings-clickup-connection')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('settings-clickup-sync')).toBeVisible();

    const tokenInput = page.getByPlaceholder('pk_...');
    await tokenInput.fill('pk_test_123456');
    await page.getByTestId('clickup-test-btn').click();

    await expect(page.getByTestId('clickup-test-success')).toContainText('QA User');
    await expect(page.getByTestId('clickup-enabled-toggle')).toBeChecked();
    expect(consoleErrors.errors).toEqual([]);
    expect(consoleErrors.exceptions).toEqual([]);
  });

  test('ClickUp project tasks & subtasks show under Project, allow time tracking, and stay hidden in #tasks lists', async ({ page }) => {
    const consoleErrors = await startSession(page);

    // Override sync & clickup routes so clickupConnected=true and ClickUp parent+subtask exist on project-1.
    await page.route('**/sync.php**', async (route) => {
      if (route.request().method() !== 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, serverTime: new Date().toISOString(), dataVersion: 2 }),
        });
      }
      const base = buildSyncPayload();
      const payload: any = { ...base };
      payload.settings = { ...(payload.settings || {}), clickupConnected: true };
      payload.projects = (payload.projects || []).map((p: any) =>
        p.id === 'project-1'
          ? {
              ...p,
              clickupLists: [
                { id: 'lst-1', name: 'Sprint Backlog', spaceName: 'Client Delivery', folderName: 'Web Projects' },
                { id: 'lst-2', name: 'Support Queue', spaceName: 'Client Delivery', folderName: null },
              ],
            }
          : p,
      );
      payload.tasks = [
        ...(payload.tasks || []),
        {
          id: 'cu-parent-1',
          title: 'ClickUp Parent Deliverable',
          description: 'Synced from ClickUp',
          status: 'In progress',
          priority: 'high',
          deadline: '2026-11-30',
          owner: 'Erik',
          assignedUsers: ['Erik'],
          relatedProjectId: 'project-1',
          externalSource: 'clickup',
          externalUrl: 'https://app.clickup.com/t/abc1',
          clickupMeta: {
            clickupId: 'abc1',
            listId: 'lst-1',
            listName: 'Sprint Backlog',
            statusName: 'in dev',
            statusColor: '#7c3aed',
          },
        },
        {
          id: 'cu-sub-1',
          title: 'ClickUp Nested Subtask',
          description: '',
          status: 'New',
          priority: 'medium',
          deadline: '2026-11-28',
          owner: 'Erik',
          assignedUsers: ['Erik'],
          relatedProjectId: 'project-1',
          parentTaskId: 'cu-parent-1',
          externalSource: 'clickup',
          externalUrl: 'https://app.clickup.com/t/abc2',
          clickupMeta: {
            clickupId: 'abc2',
            listId: 'lst-2',
            listName: 'Support Queue',
            statusName: 'open',
            statusColor: '#0ea5e9',
          },
        },
      ];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    // 1. Project -> Tasks tab shows selector bar, nested ClickUp parent + subtask, and read-only drawer with active Time Tracking
    await gotoView(page, '#projects/project-1?tab=tasks');
    await expect(page.getByTestId('project-clickup-lists-bar')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('ClickUp Parent Deliverable')).toBeVisible();
    await expect(page.getByText('ClickUp Nested Subtask')).toBeVisible();
    await expect(page.getByText('in dev')).toBeVisible();

    // Multi-list selector opens hierarchy popover
    const listsBar = page.getByTestId('project-clickup-lists-bar');
    await listsBar.getByTestId('project-clickup-lists-trigger').click();
    await expect(listsBar.getByTestId('project-clickup-lists-popover')).toBeVisible();
    await expect(listsBar.getByTestId('project-clickup-lists-popover')).toContainText('Client Delivery');
    await page.keyboard.press('Escape');

    // Open drawer for ClickUp task: read-only banner shown, Save/Delete hidden, Time Tracking active
    await page.getByText('ClickUp Parent Deliverable').click();
    await expect(page.getByTestId('task-drawer-clickup-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: /Uložiť zmeny|Save Changes/ })).toHaveCount(0);
    await expect(page.getByTestId('task-time-start')).toBeEnabled();
    await page.keyboard.press('Escape');

    // 2. Main #tasks lists must NEVER display ClickUp tasks (My Tasks, Global, Archive)
    await gotoView(page, '#tasks');
    await expect(page.getByText('ClickUp Parent Deliverable')).toHaveCount(0);
    await expect(page.getByText('ClickUp Nested Subtask')).toHaveCount(0);

    // Switch to Global Tasks & Archive tabs if visible
    const globalTab = page.getByRole('button', { name: /Všetky úlohy|Global Tasks/i }).first();
    if (await globalTab.isVisible()) {
      await globalTab.click();
      await expect(page.getByText('ClickUp Parent Deliverable')).toHaveCount(0);
      await expect(page.getByText('ClickUp Nested Subtask')).toHaveCount(0);
    }

    expect(consoleErrors.errors).toEqual([]);
    expect(consoleErrors.exceptions).toEqual([]);
  });
});
