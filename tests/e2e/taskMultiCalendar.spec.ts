import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

const SETTLE = { timeout: 20_000 };

test.describe('Tasks — Multi-Calendar Hub & Custom Calendars', () => {
  test('switches between Tasks, Work, and Payments, favorites from 3-dots menu, and creates Meeting Room custom calendar', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks');

    await expect(page.getByTestId('calendar-lens-tab-tasks')).toBeVisible(SETTLE);
    await expect(page.getByTestId('calendar-lens-tab-work')).toBeVisible(SETTLE);
    await expect(page.getByTestId('calendar-lens-tab-payments')).toBeVisible(SETTLE);

    // Switch to Work Calendar and verify panel renders
    await page.getByTestId('calendar-lens-tab-work').click();
    await expect(page.getByTestId('multi-calendar-panel-work')).toBeVisible(SETTLE);

    // Switch to Payment Calendar and verify panel renders
    await page.getByTestId('calendar-lens-tab-payments').click();
    await expect(page.getByTestId('multi-calendar-panel-payments')).toBeVisible(SETTLE);

    // Open 3-dots menu, favorite Team & Holidays, verify it pins to the bar
    await page.getByTestId('calendar-lens-more-btn').click();
    await expect(page.getByTestId('calendar-lens-more-menu')).toBeVisible(SETTLE);
    await page.getByTestId('calendar-fav-toggle-team').click();
    await expect(page.getByTestId('calendar-lens-tab-team')).toBeVisible(SETTLE);

    // Create a custom "Meeting Room" calendar from the 3-dots menu
    await page.getByTestId('new-custom-calendar-btn').click();
    await page.getByTestId('custom-calendar-name-input').fill('Meeting Room');
    await page.getByTestId('custom-calendar-save-btn').click();

    await expect(page.getByText('Meeting Room', { exact: true }).first()).toBeVisible(SETTLE);

    // Add a timed event (10:00–11:00)
    await page.getByTestId('custom-calendar-add-event-btn').click();
    await page.getByTestId('custom-event-title-input').fill('Client Kickoff');
    await page.getByTestId('custom-event-start-time').fill('10:00');
    await page.getByTestId('custom-event-end-time').fill('11:00');
    await page.getByTestId('custom-event-save-btn').click();
    await expect(page.getByText(/Client Kickoff/).first()).toBeVisible(SETTLE);

    // Open new event modal with overlapping time (10:30–11:30) -> shows overlap warning
    await page.getByTestId('custom-calendar-add-event-btn').click();
    await page.getByTestId('custom-event-start-time').fill('10:30');
    await page.getByTestId('custom-event-end-time').fill('11:30');
    await expect(page.getByTestId('custom-calendar-overlap-warning')).toBeVisible(SETTLE);
  });
});
