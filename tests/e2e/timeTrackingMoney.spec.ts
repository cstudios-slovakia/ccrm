import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { TEST_USER } from './helpers/fixture';

/**
 * Money in time tracking: hidden until the toolbar eye is clicked, and not shown at all to an
 * employee whose pay is a fixed salary (it does not move with tracked hours). The backend is mocked;
 * the mock freezes each entry's cost source from the employee's pay type like the real server.
 */

const LEAD_ROLE = {
  name: 'Lead',
  permissions: { tasks: 'edit', 'tasks.view_all': 'edit', projects: 'edit', time_tracking: 'edit', time_tracking_team: 'edit', general_config: 'nothing' },
};
const lead = (user: Record<string, unknown>) => ({ ...user, role: 'Lead' }) as never;
const FREELANCER = { id: 'user-free', name: 'Freelancer Fero', email: 'fero@crm.com', role: 'Lead', color: '#16a34a', password: 'x', activityLog: [], metadata_json: '{}' };

test.describe('Time tracking money', () => {
  test('amounts start hidden, the eye reveals them, and another section hides them again', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#time-tracking');
    await expect(page.getByTestId('time-entry-row').first()).toBeVisible();
    await expect(page.getByTestId('stat-cost')).toHaveText('•••••');
    await expect(page.getByTestId('money-reveal')).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('money-reveal').click();
    await expect(page.getByTestId('stat-cost')).toHaveText(/\d/);
    await expect(page.getByTestId('stat-cost')).not.toHaveText('•••••');
    await expect(page.getByTestId('money-reveal')).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('tab', { name: /Deň|Day|Nap/ }).click();
    await page.getByTestId('day-chip').first().waitFor();
    await expect(page.getByTestId('money-reveal')).toHaveAttribute('aria-pressed', 'false');
  });

  test('an employee on a fixed monthly salary sees no amount and no eye', async ({ page }) => {
    await startSession(page, { user: lead({ ...TEST_USER }), extraUsers: [lead({ ...TEST_USER })], roles: [LEAD_ROLE as never] });
    await gotoView(page, '#time-tracking');
    await expect(page.getByTestId('time-entry-row').first()).toBeVisible();
    await expect(page.getByTestId('stat-cost')).toHaveCount(0);
    await expect(page.getByTestId('money-reveal')).toHaveCount(0);
    await page.getByTestId('time-entry-row').first().getByTestId('time-entry-title').click();
    await expect(page.getByTestId('entry-cost-panel')).toHaveCount(0);
  });

  test('a contractor paid by the hour still sees his labour cost, behind the eye', async ({ page }) => {
    await startSession(page, { user: FREELANCER as never, extraUsers: [FREELANCER as never], roles: [LEAD_ROLE as never] });
    await gotoView(page, '#time-tracking');
    await expect(page.getByTestId('time-entry-row').first()).toBeVisible();
    await expect(page.getByTestId('stat-cost')).toHaveText('•••••');
    await page.getByTestId('money-reveal').click();
    await expect(page.getByTestId('stat-cost')).toContainText('20');
  });
});
