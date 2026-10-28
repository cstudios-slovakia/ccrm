import type { Locator } from '@playwright/test';

/**
 * Clicks a button in a list table's head the way a user does: at its position.
 *
 * `locator.click()` refuses when another element covers the target, and on a
 * table wider than its card something always does. `useStickyTableHead` lays an
 * aria-hidden copy of the head over the real one, and that copy is meant to take
 * the click and replay it on the real button. Playwright reads the cover as an
 * obstruction and retries until the test times out, so a wide table (which
 * depends on the runner's fonts) made every sort test hang in CI while passing
 * on a machine where the table fits.
 */
export async function clickTableHead(button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error('clickTableHead: the head button has no box to click');
  await button.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
