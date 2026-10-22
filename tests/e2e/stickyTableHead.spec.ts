import { expect, test, type Page } from '@playwright/test';
import { gotoView } from './helpers/appDriver';
import { readHead, scrollMain, startInflatedSession } from './stickyTableHead.shared';

/**
 * The page scrolls as a whole. A list's head row pins to the top of the page
 * scroller (`main.workspace`), no block inside a view gets a vertical scrollbar
 * of its own, and a table wider than its card keeps a sideways scrollbar within
 * reach. Measured in a real browser, because none of it can be read from the code:
 * `position: sticky` binds to the nearest scroll container, and one stray
 * `overflow-x: auto` between a head and the page quietly breaks it.
 */

test.use({ viewport: { width: 1440, height: 900 } });

/** Elements inside `main` that would show a vertical scrollbar of their own. */
async function innerVerticalScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector('main.workspace') as HTMLElement;
    const found: string[] = [];
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      if (el.offsetParent === null || el.clientHeight === 0) continue;
      if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
      if (el.scrollHeight > el.clientHeight + 1) {
        found.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 4).join('.')}`);
      }
    }
    return found;
  });
}

test.describe('page-sticky table heads', () => {
  test.beforeEach(async ({ page }) => {
    await startInflatedSession(page, 12);
  });

  for (const [name, hash] of [
    ['Leads', '#leads'],
    ['Projects', '#projects'],
  ] as const) {
    test(`${name}: the head stays at the top of the page while the rows scroll under it`, async ({ page }) => {
      await gotoView(page, hash);
      const start = await readHead(page);
      expect(start.headOffset, 'the table is on screen below the toolbar').toBeGreaterThan(100);

      // Mid-table: a screen below the top of the table, far from its end.
      const tableTop = await page.evaluate(() => {
        const main = document.querySelector('main.workspace') as HTMLElement;
        const table = document.querySelector('.table-page-wrap table') as HTMLElement;
        return table.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      });
      for (const down of [400, 1200, 2400]) {
        await scrollMain(page, tableTop + down);
        const now = await readHead(page);
        expect(Math.abs(now.headOffset ?? 999), `head flush under the app header after ${down}px`).toBeLessThanOrEqual(1);
        expect(now.tableBottom ?? 0, 'the table still runs past the head').toBeGreaterThan(200);
        expect(now.mainOverflowsX, 'the page itself never scrolls sideways').toBe(false);
      }
      expect(await innerVerticalScrollers(page), 'no list has a vertical scrollbar of its own').toEqual([]);
    });
  }

  test('a table wider than its card keeps a sideways scrollbar in reach', async ({ page }) => {
    // Projects is wider than its card at this width (several attribute columns).
    await gotoView(page, '#projects');
    const wrap = page.locator('.table-page-wrap').first();
    await expect(wrap).toHaveAttribute('data-hscroll', 'true');
    const proxy = page.locator('[data-sticky-hscrollbar]');
    await expect(proxy).toHaveCount(1);

    // Top of the page: the table's own bar is far below the fold, so the proxy is up.
    await expect(proxy).toHaveAttribute('data-sticky-hscrollbar', 'shown');
    const box = (await proxy.boundingBox())!;
    const mainBox = (await page.locator('main.workspace').boundingBox())!;
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(Math.round(mainBox.y + mainBox.height) - 1);

    // Dragging it (here: scrolling it) moves the table, and the table moves it back.
    await proxy.evaluate((el) => {
      el.scrollLeft = 120;
    });
    await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await wrap.evaluate((el) => {
      el.scrollLeft = 40;
    });
    await expect.poll(() => proxy.evaluate((el) => el.scrollLeft)).toBeLessThan(60);

    // The head is a copy outside the sideways scroller, pinned by plain CSS
    // sticky (nothing moves it per scroll step), lying exactly over the real one.
    const mirror = page.locator('.table-page-head-mirror');
    await expect(mirror).toHaveCount(1);
    const fit = await mirror.evaluate((m) => {
      const real = Array.from(m.nextElementSibling!.querySelectorAll('thead th')).map((th) => th.getBoundingClientRect());
      const copy = Array.from(m.querySelectorAll('thead th')).map((th) => th.getBoundingClientRect());
      const misfit = real.map((r, i) => Math.max(...[r.left - copy[i].left, r.top - copy[i].top, r.width - copy[i].width].map(Math.abs)));
      return { position: getComputedStyle(m).position, cells: [real.length, copy.length], misfit: Math.max(...misfit) };
    });
    expect(fit.position).toBe('sticky');
    expect(fit.cells[1]).toBe(fit.cells[0]);
    expect(fit.misfit, 'the copy covers the real head cell for cell').toBeLessThanOrEqual(0.5);

    // A click on the copy reaches the real head: select-all selects every row.
    await scrollMain(page, 600);
    const selectAll = mirror.locator('thead button').first();
    await selectAll.click();
    await expect(page.locator('.table-page-wrap thead button').first()).toHaveAttribute('title', /Deselect|Zrušiť|törlése/);
    await expect(selectAll).toHaveAttribute('title', /Deselect|Zrušiť|törlése/);
    await selectAll.click();
    await expect(selectAll).toHaveAttribute('title', /Select all|Vybrať|Összes/);

    // The end of the table: its own bar is on screen, so the proxy gets out of the way.
    await scrollMain(page, 'end');
    await expect(proxy).toHaveAttribute('data-sticky-hscrollbar', 'hidden');
  });

  test('a table that fits has no proxy scrollbar and sticks with plain CSS', async ({ page }) => {
    await gotoView(page, '#orders');
    const wrap = page.locator('.table-page-wrap').first();
    await expect(wrap).toHaveAttribute('data-hscroll', 'false');
    await expect(page.locator('[data-sticky-hscrollbar]')).toHaveCount(0);
    await expect(page.locator('.table-page-head-mirror')).toHaveCount(0);
    expect(await wrap.evaluate((el) => getComputedStyle(el).overflowX)).toBe('visible');
  });
});

test.describe('Tasks', () => {
  test.beforeEach(async ({ page, context }) => {
    await startInflatedSession(page, 12);
    await context.addCookies([{ name: 'ccrm_task_calendar_scope', value: 'hide', url: 'http://localhost:5273' }]);
  });

  test('the create bar stays pinned under the app header and nothing scrolls inside the view', async ({ page }) => {
    await gotoView(page, '#tasks');
    // The list is collapsed by default; open the long sections.
    await page.getByText(/Budúce|Upcoming|Jövő/).first().click();
    await page.getByText(/Zajtra|Tomorrow|Holnap/).first().click();
    await page.waitForTimeout(400);

    expect(await innerVerticalScrollers(page)).toEqual([]);
    await scrollMain(page, 500);
    const barTop = await page.evaluate(() => {
      const main = document.querySelector('main.workspace') as HTMLElement;
      const bar = Array.from(main.querySelectorAll<HTMLElement>('*')).find((el) => getComputedStyle(el).position === 'sticky');
      return bar ? Math.round(bar.getBoundingClientRect().top - main.getBoundingClientRect().top) : null;
    });
    expect(barTop, 'the create bar is pinned flush under the app header').toBe(0);
    expect(await innerVerticalScrollers(page)).toEqual([]);
  });

  test('Global Tasks has a single vertical scroller: the page', async ({ page }) => {
    await gotoView(page, '#tasks');
    await page.getByRole('button', { name: /Global Tasks|Globálne úlohy/ }).click();
    await page.waitForTimeout(500);
    expect(await innerVerticalScrollers(page)).toEqual([]);
  });
});

test.describe('AI views', () => {
  test('the missing-key banner is an ordinary block, and opening the view does not scroll the page', async ({ page }) => {
    // A connected vector database but no OpenAI key: the assistant opens, with the banner above it.
    await startInflatedSession(page, 1, { integrations: { vectorDb: 'qdrant', vectorDbValidated: true } });
    await gotoView(page, '#rag_ai');
    const banner = page.getByText(/OpenAI API key is missing|Chýba OpenAI API kľúč|Hiányzik az OpenAI API kulcs/).first();
    await expect(banner).toBeVisible();
    const sticky = await banner.evaluate((el) => {
      for (let node: Element | null = el; node && node.tagName !== 'MAIN'; node = node.parentElement) {
        if (getComputedStyle(node).position === 'sticky') return true;
      }
      return false;
    });
    expect(sticky, 'the banner scrolls away with the page').toBe(false);
    expect(await page.evaluate(() => (document.querySelector('main.workspace') as HTMLElement).scrollTop)).toBe(0);
  });
});
