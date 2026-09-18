import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * A project's star rating — the same 1-5 priority a lead carries, and the same
 * three jobs: read it in the list, set it with one click, narrow the list by it.
 *
 * Pinned as a journey rather than left to the crawler for two reasons. The
 * crawler would never check that a click on a star writes anything (it sees the
 * dot fill and moves on), and the star sits inside a row that opens the project
 * when clicked — so "rate it" and "open it" are one pixel apart, and a missing
 * stopPropagation passes every visual check while making the control unusable.
 *
 * The dataset rates project-1 five stars, project-2 two, and leaves project-3
 * unrated on purpose. The fixture runs in Slovak.
 */

const RATED_FIVE = 'Strecha Silvia — etapa 1';
const UNRATED = 'Havarijná oprava — bytový dom Košice';
const RATED_TWO = /Novák/;

/** Every project the app pushed to /sync.php, newest write winning per id. */
function recordSyncedProjects(page: Page) {
  const pushed = new Map<string, Record<string, unknown>>();
  // Registered after the fixture's mocks, so Playwright asks this one first.
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { projects?: Record<string, unknown>[] };
        for (const project of body?.projects ?? []) pushed.set(String(project.id), project);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

const row = (page: Page, name: string | RegExp) => page.locator('tbody tr').filter({ hasText: name });

/** How many of the five dots in this row (or card) are lit. */
const litStars = (scope: Locator) => scope.locator('div.bg-amber-500');

/** The rating block on the project card: the label's own wrapper. */
const ratingBlock = (page: Page) => page.getByText('Priorita a hodnotenie').locator('xpath=..');

/**
 * The table's Rating column header. Scoped to `thead` on purpose: once the list
 * is sorted by rating the sort dropdown in the filter bar reads "Hodnotenie"
 * too, and it sits earlier in the DOM.
 */
const ratingHeader = (page: Page) => page.locator('thead').getByRole('button', { name: /Hodnotenie/ });

/** The rating dropdown in the filter bar, found by whatever it currently reads. */
async function setRatingFilter(page: Page, current: string | RegExp, option: string) {
  await page.getByRole('button', { name: current }).first().click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('Project rating', () => {
  test('the list shows every project\'s stars, and one click rates it', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedProjects(page);
    await gotoView(page, '#projects');

    // The column is there, and each row wears what the dataset gave it.
    await expect(ratingHeader(page)).toBeVisible();
    await expect(litStars(row(page, RATED_FIVE))).toHaveCount(5);
    await expect(litStars(row(page, RATED_TWO))).toHaveCount(2);
    await expect(litStars(row(page, UNRATED))).toHaveCount(0);
    await page.screenshot({ path: 'test-results/project-rating-list.png', fullPage: false });

    // One click on the third star rates the unrated project — and does NOT
    // open it, even though the whole row is a way into the project.
    await row(page, UNRATED).getByRole('button', { name: 'Hodnotiť 3' }).click();
    await expect(litStars(row(page, UNRATED))).toHaveCount(3);
    await expect(page.getByPlaceholder(/Vyhľadať projekty/)).toBeVisible();

    await expect.poll(() => pushed.get('project-3')?.rating, { timeout: 10_000 }).toBe(3);

    // Clicking the star it already wears is the way back to "not rated".
    await row(page, UNRATED).getByRole('button', { name: 'Hodnotiť 3' }).click();
    await expect(litStars(row(page, UNRATED))).toHaveCount(0);
    await expect.poll(() => pushed.get('project-3')?.rating, { timeout: 10_000 }).toBe(0);
  });

  test('the rating filter narrows the list the way the leads list does', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#projects');
    await expect(row(page, RATED_FIVE)).toHaveCount(1);

    // Four stars and up: only the five-star project survives.
    await setRatingFilter(page, /Všetky hodnotenia/, '★★★★ a viac');
    await expect(row(page, RATED_FIVE)).toHaveCount(1);
    await expect(row(page, RATED_TWO)).toHaveCount(0);
    await expect(row(page, UNRATED)).toHaveCount(0);

    // Exactly two stars: only the two-star one.
    await setRatingFilter(page, /★★★★ a viac/, '★★☆☆☆');
    await expect(row(page, RATED_TWO)).toHaveCount(1);
    await expect(row(page, RATED_FIVE)).toHaveCount(0);

    // Not rated: only the project nobody has rated.
    await setRatingFilter(page, /★★☆☆☆/, 'Bez hodnotenia');
    await expect(row(page, UNRATED)).toHaveCount(1);
    await expect(row(page, RATED_FIVE)).toHaveCount(0);
    await expect(row(page, RATED_TWO)).toHaveCount(0);

    // And back to everything.
    await setRatingFilter(page, /Bez hodnotenia/, 'Všetky hodnotenia');
    await expect(row(page, RATED_FIVE)).toHaveCount(1);
    await expect(row(page, RATED_TWO)).toHaveCount(1);
    await expect(row(page, UNRATED)).toHaveCount(1);
  });

  test('sorting by rating puts the best first and the unrated last', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#projects');

    const header = ratingHeader(page);
    await header.click(); // ascending
    await expect(page.locator('tbody tr').first()).toContainText(RATED_TWO);
    // Unrated has no rating to sort by, so it sits last either way.
    await expect(page.locator('tbody tr').last()).toContainText(UNRATED);

    await header.click(); // descending
    await expect(page.locator('tbody tr').first()).toContainText(RATED_FIVE);
    await expect(page.locator('tbody tr').last()).toContainText(UNRATED);
  });

  test('the project card carries the same rating, and saves it on the spot', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedProjects(page);
    await gotoView(page, '#projects');
    await page.getByText(RATED_FIVE).first().click();

    const block = ratingBlock(page);
    await expect(litStars(block)).toHaveCount(5);
    await page.screenshot({ path: 'test-results/project-rating-card.png', fullPage: false });

    // No edit mode, no Save button — the same as the status select above it.
    await block.getByRole('button', { name: 'Hodnotiť 4' }).click();
    await expect(litStars(block)).toHaveCount(4);
    await expect.poll(() => pushed.get('project-1')?.rating, { timeout: 10_000 }).toBe(4);
  });
});
