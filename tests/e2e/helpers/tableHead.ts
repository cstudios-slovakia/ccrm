import { expect, type Locator } from '@playwright/test';

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
 *
 * What `click()` guarded is kept: the click waits until the thing at the button's
 * position is that button, or a button of the same label in the copy. The copy
 * is re-laid after every column change, and a click in that gap would land on
 * the neighbouring column.
 */
export async function clickTableHead(button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  const centre = async () => {
    const box = await button.boundingBox();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  };
  await expect
    .poll(async () => {
      const at = await centre();
      if (!at) return false;
      return button.evaluate((el, { x, y }) => {
        const topButton = document.elementFromPoint(x, y)?.closest('button');
        if (!topButton) return false;
        return (
          topButton === el ||
          (!!topButton.closest('.table-page-head-mirror') && topButton.textContent === el.textContent)
        );
      }, at);
    })
    .toBe(true);
  const at = await centre();
  if (!at) throw new Error('clickTableHead: the head button has no box to click');
  await button.page().mouse.click(at.x, at.y);
}
