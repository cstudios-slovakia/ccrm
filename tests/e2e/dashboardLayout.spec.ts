import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Arranging the Dashboard by hand.
 *
 * The board is a plain twelve-column CSS grid with no coordinates in the data —
 * a card's position is its index in the list plus its width. That made empty
 * cells unreachable: the old drag was an HTML5 one, so the only thing that
 * would accept a drop was another card, and the browser showed a "not allowed"
 * cursor over the empty half of a row. A card now drops into free cells it
 * fits in. The arithmetic deciding what "fits" means is covered by
 * `src/utils/dashboardGrid.test.ts`; what has to be checked in the real app is
 * that the cells lighting up are the ones actually on screen — measured from a
 * live layout, with real card heights.
 *
 * The default layout fills all four of its rows, so each test opens a gap first
 * by widening a card, which also exercises the size change animation. The
 * fixture runs in Slovak.
 */

const EDIT = 'Upraviť';
const DONE = 'Hotovo';

const LEAD_TABLE = 'default_recent_leads';
const TASK_TABLE = 'default_recent_tasks';
const TASK_BREAKDOWN = 'default_tasks_by_status';
const LEAD_BREAKDOWN = 'default_leads_by_status';
const TOTAL_LEADS = 'default_total_leads';

interface Zone {
  insertIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Box {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Every card on the board, in DOM order, in pixels relative to the grid. */
async function boardCards(page: Page): Promise<Box[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-flip]')).map((node) => ({
      id: node.dataset.flip ?? '',
      left: node.offsetLeft,
      top: node.offsetTop,
      width: node.offsetWidth,
      height: node.offsetHeight
    }))
  );
}

/**
 * The free cells currently on offer, in the same coordinates as the cards, plus
 * where the grid itself sits so a zone can be aimed at with the mouse.
 */
async function dropZones(page: Page): Promise<{ origin: { x: number; y: number }; zones: Zone[] }> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-drop-zone]'));
    const grid = nodes[0]?.offsetParent as HTMLElement | undefined;
    const origin = grid ? grid.getBoundingClientRect() : { x: 0, y: 0 };
    return {
      origin: { x: origin.x, y: origin.y },
      zones: nodes.map((node) => ({
        insertIndex: Number(node.dataset.dropZone),
        left: node.offsetLeft,
        top: node.offsetTop,
        width: node.offsetWidth,
        height: node.offsetHeight
      }))
    };
  });
}

function cardById(cards: Box[], id: string): Box {
  const found = cards.find((card) => card.id === id);
  expect(found, `no card ${id} on the board`).toBeTruthy();
  return found as Box;
}

const sameRow = (a: number, b: number) => Math.abs(a - b) < 4;

/** Widens a card one step, and waits until the board has taken the new size. */
async function widen(page: Page, id: string) {
  const before = cardById(await boardCards(page), id).width;
  await page.locator(`[data-flip="${id}"] button[aria-label="Zmeniť veľkosť"]`).click();
  await expect
    .poll(async () => cardById(await boardCards(page), id).width)
    .not.toBe(before);
}

/**
 * Grabs a card by the handle in its edit toolbar and holds it in the air. The
 * board is taller than the window, so the handle has to be brought on screen
 * first — `mouse.down` presses at a coordinate, and a coordinate outside the
 * viewport presses on nothing at all.
 */
async function liftCard(page: Page, id: string) {
  const handle = page.locator(`[data-flip="${id}"] [title^="Potiahnutím"]`).first();
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const grip = await handle.boundingBox();
  expect(grip, `no drag handle on ${id}`).toBeTruthy();

  const x = grip!.x + grip!.width / 2;
  const y = grip!.y + grip!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // The card only picks the cursor up on the first move after the press.
  await page.mouse.move(x, y + 6, { steps: 2 });
  await expect(page.locator('[data-drop-zone]').first()).toBeVisible();
}

/**
 * Scrolls the workspace by `delta` and waits for it to come to rest. A wheel
 * event would do the same thing, but Chromium animates one, and a rect read
 * while that animation is still running points at the wrong row.
 */
async function scrollBoard(page: Page, delta: number) {
  await page.evaluate((dy) => {
    let node = document.querySelector('[data-drop-zone]')?.parentElement ?? null;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        node.scrollTo({ top: node.scrollTop + dy, behavior: 'instant' });
        return;
      }
      node = node.parentElement;
    }
    window.scrollTo({ top: window.scrollY + dy, behavior: 'instant' });
  }, delta);

  let last = Number.NaN;
  await expect
    .poll(async () => {
      const now = (await dropZones(page)).origin.y;
      const settled = now === last;
      last = now;
      return settled;
    })
    .toBe(true);
}

/** The zone the board says the pointer is currently over, if any. */
async function claimedZone(page: Page): Promise<number | null> {
  const active = await page
    .locator('[data-drop-zone][data-drop-active]')
    .first()
    .getAttribute('data-drop-zone', { timeout: 2000 })
    .catch(() => null);
  return active === null ? null : Number(active);
}

/**
 * Moves the held card over the zone matching `wanted`, scrolling the board
 * until that zone is somewhere the mouse can actually be put. The card is fixed
 * to the cursor, so scrolling mid-drag only moves the board underneath it.
 *
 * The aim is confirmed against the board rather than trusted: a scroll is not
 * necessarily finished when `mouse.wheel` returns, and a rect measured mid-glide
 * points at the wrong row. The band it aims inside also keeps clear of the
 * hundred pixels at each edge of the workspace, where holding a card makes the
 * board scroll itself.
 */
async function aimAt(page: Page, wanted: (zone: Zone) => boolean): Promise<Zone | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { origin, zones } = await dropZones(page);
    const zone = zones.find(wanted);
    if (!zone) return null;

    const y = origin.y + zone.top + zone.height / 2;
    if (y < 260 || y > 680) {
      await scrollBoard(page, y - 460);
      continue;
    }

    // One jump, not a glide: every point a glide passes through is a pointer
    // position too, and one of them near an edge starts the board scrolling.
    await page.mouse.move(origin.x + zone.left + zone.width / 2, y);
    if ((await claimedZone(page)) === zone.insertIndex) return zone;
  }
  return null;
}

test.describe('Dashboard layout editing', () => {
  test.beforeEach(async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#dashboard');
    // `exact` matters: the sidebar carries an "Upraviť štruktúru menu" button.
    await page.getByRole('button', { name: EDIT, exact: true }).click();
    await expect(page.getByRole('button', { name: DONE, exact: true })).toBeVisible();
  });

  test('a card drops into free cells it fits in', async ({ page }) => {
    // Widen the task breakdown until it no longer fits beside the task table:
    // the bottom row is left with four free columns.
    await widen(page, TASK_BREAKDOWN);

    // Pick a quarter-width card up. The board closes behind it and every run of
    // free cells it fits in lights up.
    await liftCard(page, TOTAL_LEADS);

    const taskTable = cardById(await boardCards(page), TASK_TABLE);
    const gap = await aimAt(page, (zone) => sameRow(zone.top, taskTable.top));

    expect(gap, 'no free cells offered beside the task table').toBeTruthy();
    expect(gap!.left).toBeGreaterThan(taskTable.left);

    // Exactly one zone claims the pointer, and it is the one it will drop into.
    await expect(page.locator('[data-drop-zone][data-drop-active]')).toHaveCount(1);

    await page.mouse.up();
    await expect(page.locator('[data-drop-zone]')).toHaveCount(0);

    const after = await boardCards(page);
    const moved = cardById(after, TOTAL_LEADS);
    const settled = cardById(after, TASK_TABLE);

    // It landed in the gap — same row as the task table, to its right — and
    // nothing had to be pushed aside to make room for it.
    expect(sameRow(moved.top, settled.top)).toBe(true);
    expect(moved.left).toBeGreaterThan(settled.left);
    expect(after.length).toBe(9);
  });

  test('a card too wide for a gap is never offered it', async ({ page }) => {
    await widen(page, TASK_BREAKDOWN);

    // The lead table is eight columns wide and the gap beside the task table is
    // four. It may be dropped at the end of the board, never into that gap.
    await liftCard(page, LEAD_TABLE);

    const taskTable = cardById(await boardCards(page), TASK_TABLE);
    const { zones } = await dropZones(page);
    await page.mouse.up();

    expect(zones.length).toBeGreaterThan(0);
    for (const zone of zones) expect(sameRow(zone.top, taskTable.top)).toBe(false);
  });

  test('cards glide rather than jump when the board rearranges', async ({ page }) => {
    // Widening a card displaces every card after it; each one should travel.
    await page.locator(`[data-flip="${LEAD_BREAKDOWN}"] button[aria-label="Zmeniť veľkosť"]`).click();
    await expect.poll(() => page.locator('[data-flip-animating]').count(), { timeout: 2000 }).toBeGreaterThan(0);
    // ...and settle again, leaving no inline transform behind.
    await expect.poll(() => page.locator('[data-flip-animating]').count(), { timeout: 3000 }).toBe(0);
  });
});
