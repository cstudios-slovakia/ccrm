import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

const SETTLE = { timeout: 20_000 };

const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Tasks — Expandable Activity & Chat Panel, Reactions & State History', () => {
  test('allows task reactions, expandable chat with image upload, message reactions, and shows state changes', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks');

    const taskTitle = 'Zavolať klientke Silvii';
    // Tomorrow's bucket starts collapsed — expand it first so the card renders cleanly.
    const tomorrowBtn = page.getByRole('button', { name: /^(Tomorrow|Zajtra|Holnap) \(\d+\)/ }).first();
    await expect(tomorrowBtn).toBeVisible(SETTLE);
    await tomorrowBtn.click();

    const taskCard = page.locator('[data-task-card]').filter({ hasText: taskTitle }).first();
    await expect(taskCard).toBeVisible(SETTLE);
    await taskCard.getByTitle(/^(Edit Task|Upraviť úlohu|Feladat szerkesztése)$/).locator('visible=true').first().click();

    // Expanded by default on desktop
    const activityPanel = page.getByTestId('task-activity-panel');
    await expect(activityPanel).toBeVisible(SETTLE);

    // Toggle collapse and expand again
    await page.getByTestId('task-activity-collapse-btn').click();
    await expect(activityPanel).toBeHidden(SETTLE);
    await page.getByTestId('task-drawer-chat-toggle').click();
    await expect(activityPanel).toBeVisible(SETTLE);

    // React to the task directly with 👍
    await page.getByTestId('task-quick-react-👍').click();
    await expect(page.getByTestId('task-reaction-chip-👍')).toContainText('1', SETTLE);

    // Upload an image and send a chat message
    await page.getByTestId('task-activity-file-input').setInputFiles({
      name: 'board-screenshot.png',
      mimeType: 'image/png',
      buffer: TINY_PNG_BUFFER,
    });

    await page.getByTestId('task-activity-composer-input').fill('Checked with @Mária — looks good!');
    const sendBtn = page.getByTestId('task-activity-send-btn');
    await expect(sendBtn).toBeEnabled(SETTLE);
    await sendBtn.click();

    const commentBubble = page.getByTestId('task-activity-comment-item').first();
    await expect(commentBubble).toBeVisible(SETTLE);
    await expect(commentBubble).toContainText('Checked with', SETTLE);
    await expect(commentBubble.locator('img')).toBeVisible(SETTLE);

    // Click image thumbnail -> lightbox opens; Escape closes only the lightbox (drawer stays open)
    await commentBubble.locator('img').click();
    await expect(page.getByTestId('task-activity-lightbox')).toBeVisible(SETTLE);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-activity-lightbox')).toBeHidden(SETTLE);
    await expect(activityPanel).toBeVisible(SETTLE);

    // React to the posted message with ❤️
    await commentBubble.getByRole('button', { name: '❤️' }).click();
    await expect(commentBubble).toContainText('❤️', SETTLE);

    // Change task priority (high -> medium) and save
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Medium|Stredná|Közepes/i }).click();
    await dialog.locator('button[type="submit"]').click();

    // Board row shows live comment count and task reaction badge
    await expect(taskCard.getByTestId('task-comment-count-badge')).toContainText('1', SETTLE);
    await expect(taskCard.getByTestId('task-reaction-badge')).toContainText('👍', SETTLE);

    // Reopen task and verify ClickUp-style state change entry & History filter
    await taskCard.getByTitle(/^(Edit Task|Upraviť úlohu|Feladat szerkesztése)$/).locator('visible=true').first().click();
    await expect(page.getByTestId('task-activity-panel')).toBeVisible(SETTLE);
    await expect(page.getByTestId('task-activity-state-item').first()).toBeVisible(SETTLE);

    await page.getByTestId('task-activity-filter-history').click();
    await expect(page.getByTestId('task-activity-comment-item')).toHaveCount(0);
    await expect(page.getByTestId('task-activity-state-item').first()).toBeVisible(SETTLE);

    await page.getByTestId('task-activity-filter-comments').click();
    await expect(page.getByTestId('task-activity-comment-item')).toHaveCount(1);
    await expect(page.getByTestId('task-activity-state-item')).toHaveCount(0);
  });
});
