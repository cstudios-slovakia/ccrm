import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * The leads filter bar while the window is resized.
 *
 * Which filters sit on the first row is measured at runtime, and the "More
 * filters" chevron only exists while some filter is left over. Two things must
 * hold at every width, whichever way the window got there:
 *   - the chevron is on screen whenever a filter had to drop to the second row;
 *   - the app header keeps its last button (the profile) inside the window.
 */

const WIDTHS_DOWN = Array.from({ length: 60 }, (_, i) => 1900 - i * 22);
const WIDTHS_UP = [...WIDTHS_DOWN].reverse();

/** Rows the filter bar actually occupies: distinct tops of its direct controls. */
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const search = document.querySelector<HTMLInputElement>('input[placeholder^="Vyhľadať lead"]');
    const panel = search?.closest<HTMLElement>('.glass-panel');
    const chevron = [...document.querySelectorAll<HTMLElement>('button[aria-label="Ďalšie filtre"]')].find(
      (b) => b.offsetParent !== null,
    );
    const profile = document.querySelector<HTMLElement>('button[aria-label="Menu používateľského profilu"]');
    const rect = profile?.getBoundingClientRect();
    return {
      width: window.innerWidth,
      panelRight: panel?.getBoundingClientRect().right ?? 0,
      chevron: Boolean(chevron),
      expanded: chevron?.getAttribute('aria-expanded') === 'true',
      // Controls on the first row vs. a stray second row without an expanded chevron.
      rows: panel
        ? new Set(
            [...panel.querySelectorAll<HTMLElement>('input[placeholder^="Vyhľadať lead"], [role="combobox"], button')]
              .filter((el) => el.offsetParent !== null && el.closest('[aria-hidden="true"]') === null)
              .map((el) => Math.round(el.getBoundingClientRect().top / 4)),
          ).size
        : 0,
      profileVisible: rect ? rect.width > 0 && rect.right <= window.innerWidth + 0.5 && rect.left >= 0 : null,
    };
  });
}

for (const [name, widths] of [
  ['narrowing', WIDTHS_DOWN],
  ['widening', WIDTHS_UP],
] as const) {
  test(`leads filter bar and header hold together while ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: widths[0], height: 900 });
    await startSession(page);
    await gotoView(page, '#leads');

    const bad: string[] = [];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(250);
      const s = await snapshot(page);
      // Dense (<ws-sm) layout renders its own chevron; the check works on whichever is visible.
      if (s.rows > 1 && !s.chevron) bad.push(`${w}px: filters wrap to ${s.rows} rows but no chevron`);
      if (s.profileVisible === false) bad.push(`${w}px: profile button is outside the window`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
}
