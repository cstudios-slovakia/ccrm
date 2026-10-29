import { expect, test, type Page } from '@playwright/test';
import { gotoView } from './helpers/appDriver';
import { startInflatedSession } from './stickyTableHead.shared';

/**
 * The View menu in a list's filter bar opens over the table below it. The table's pinned head sits
 * at a higher z-index than its own rows, so the menu has to out-rank it: a header cell painted
 * through the menu hides the options and takes the clicks meant for them.
 *
 * The themes `paper`, `minimalist` and `retro` strip `backdrop-filter` from `.glass-panel`, which
 * is what made the table's card a stacking context in the glass themes. Without it the head's
 * z-index competed with the toolbar's directly and won, so every theme is checked.
 *
 * Measured by hit-testing, because a stacking order cannot be read from the code: every point on
 * the open menu must resolve to an element inside the menu.
 */

/** Points on the menu that resolve to something outside it. */
async function pointsCoveredByPage(page: Page, menu: RegExp): Promise<string[]> {
  return page.evaluate((label) => {
    const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((d) =>
      new RegExp(label).test(d.getAttribute('aria-label') ?? ''),
    ) as HTMLElement | undefined;
    if (!dialog) return ['no menu'];
    const box = dialog.getBoundingClientRect();
    const covered: string[] = [];
    for (let fx = 0.05; fx < 1; fx += 0.15) {
      for (let fy = 0.03; fy < 1; fy += 0.1) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        // The phone-width tab bar is fixed over the bottom of the window; that is not the head.
        if (y < 0 || y > window.innerHeight - 100) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !dialog.contains(hit)) {
          covered.push(`${Math.round(x)},${Math.round(y)} -> ${hit?.tagName.toLowerCase()}.${String(hit?.className).slice(0, 50)}`);
        }
      }
    }
    return covered;
  }, menu.source);
}

const MENU = /Nastavenia pohľadu|View settings|Nézet beállításai/;

for (const [name, hash] of [
  ['Projects', '#projects'],
  ['Leads', '#leads'],
] as const) {
  test(`${name}: the View menu sits above the table head in every theme, width and scroll position`, async ({ page }) => {
    await startInflatedSession(page, 12);
    await gotoView(page, hash);
    const trigger = page.getByRole('button', { name: /^(Pohľad|Nézet|View)/ }).first();
    const seen: string[] = [];
    for (const theme of ['basic', 'paper', 'minimalist', 'retro']) {
      await page.evaluate((id) => document.documentElement.setAttribute('data-theme', id), theme);
      // 1100 is narrow enough for the table to scroll sideways, which gives it a mirrored head.
      for (const width of [1100, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        for (const scroll of [0, 60]) {
          await page.evaluate((y) => ((document.querySelector('main.workspace') as HTMLElement).scrollTop = y), scroll);
          await trigger.click();
          await expect(page.getByRole('dialog', { name: MENU })).toBeVisible();
          const covered = await pointsCoveredByPage(page, MENU);
          if (covered.length) seen.push(`${theme}, ${width}px, scrolled ${scroll}: ${covered.slice(0, 2).join(' | ')}`);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog', { name: MENU })).toHaveCount(0);
        }
      }
    }
    expect(seen).toEqual([]);
  });
}
