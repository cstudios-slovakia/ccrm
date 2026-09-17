import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Finance overview: the weekly trend graph projects 3, 6 or 12 months forward.
 * Switching the horizon has to re-scale the dataset (4 past weeks + the current
 * one + the horizon's future weeks), relabel the chart, and survive a reload.
 */

const HORIZONS = [
  { months: 3, totalWeeks: 18, futureWeeks: 13, skMonths: '3 mesiace' },
  { months: 6, totalWeeks: 31, futureWeeks: 26, skMonths: '6 mesiacov' },
  { months: 12, totalWeeks: 57, futureWeeks: 52, skMonths: '12 mesiacov' }
];

// The horizon is a DB-backed user preference, so a click travels through the
// users entity and a sync push before the chart repaints. That is well inside a
// second in the app, but on a loaded CI box it can outrun the default 5s.
const SETTLE = { timeout: 20_000 };

// The QA dataset runs the app in Slovak, so every assertion accepts either.
// Matched as two plain substrings so the parentheses need no regex escaping.
const horizonLabel = (page: Page, h: (typeof HORIZONS)[number]) =>
  page
    .getByText(`Total Horizon: ${h.totalWeeks} Weeks (${h.months} Months Forward)`)
    .or(page.getByText(`Časový horizont: ${h.totalWeeks} týždňov (${h.skMonths} dopredu)`));

async function openFinanceOverview(page: Page) {
  await gotoView(page, '#financial');
  await expect(page.getByRole('button', { name: /^3M$/ })).toBeVisible(SETTLE);
}

async function openWeeklyTable(page: Page) {
  const toggle = page.getByRole('button', {
    name: /Inspect Full \d+-Week Weekly Breakdown|Zobraziť podrobnú \d+-týždňovú tabuľku/
  });
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
}

test.describe('Finance projection horizon', () => {
  test('3M / 6M / 12M each resize the weekly dataset and its labels', async ({ page }) => {
    await startSession(page);
    await openFinanceOverview(page);
    await openWeeklyTable(page);

    for (const h of HORIZONS) {
      await page.getByRole('button', { name: new RegExp(`^${h.months}M$`) }).click();

      await expect(horizonLabel(page, h)).toBeVisible(SETTLE);
      await expect(
        page.getByText(new RegExp(`${h.months}-MONTH FUTURE FORECAST|${h.months}-MESAČNÁ PROGNÓZA`))
      ).toBeVisible(SETTLE);
      await expect(
        page.getByRole('heading', {
          name: new RegExp(`Weekly Trend & ${h.months}-Month Projection|Týždenný vývoj a ${h.months}-mesačná prognóza`)
        })
      ).toBeVisible(SETTLE);

      // The breakdown table is the dataset itself: one row per week.
      const rows = page.locator('table tbody tr').filter({ hasText: /W\d+/ });
      await expect.poll(async () => rows.count()).toBe(h.totalWeeks);

      // The plotline gets one node per week too.
      await expect
        .poll(async () => page.locator('svg circle[stroke="#ffffff"]').count())
        .toBe(h.totalWeeks);
    }
  });

  test('the chosen horizon survives a reload', async ({ page }) => {
    await startSession(page);
    await openFinanceOverview(page);

    const sixMonths = HORIZONS[1];
    await page.getByRole('button', { name: /^6M$/ }).click();
    await expect(horizonLabel(page, sixMonths)).toBeVisible(SETTLE);

    await page.reload();
    await gotoView(page, '#financial');
    await expect(horizonLabel(page, sixMonths)).toBeVisible(SETTLE);
  });

  test('a 12-month chart stays legible: no overlapping week labels', async ({ page }) => {
    await startSession(page);
    await openFinanceOverview(page);
    await page.getByRole('button', { name: /^12M$/ }).click();
    await expect(page.getByText(/12-MONTH FUTURE FORECAST|12-MESAČNÁ PROGNÓZA/)).toBeVisible(SETTLE);

    const boxes = await page
      .locator('svg text')
      .filter({ hasText: /^W\d+$/ })
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = (n as SVGGraphicsElement).getBoundingClientRect();
          return { left: r.left, right: r.right };
        })
      );

    expect(boxes.length).toBeGreaterThan(5);
    const sorted = boxes.sort((a, b) => a.left - b.left);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].left).toBeGreaterThanOrEqual(sorted[i - 1].right - 0.5);
    }
  });
});
