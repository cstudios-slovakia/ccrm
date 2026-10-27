import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { SETTINGS_CATEGORIES } from '../../src/components/settings/settingsRegistry.ts';

/**
 * The regrouped Settings: 12 category tiles in three groups (or a sidebar), one
 * category per page with one real tab per section (only the open one is rendered),
 * inline search, the old `#settings/<id>` links, settings that save themselves, and
 * the phone layout (tiles only, a section dropdown).
 *
 * The fixture runs in Slovak, so labels are matched in more than one language.
 */

const SETTLE = { timeout: 20_000 };
const CATEGORY_IDS = [
  'company', 'access', 'modules', 'leads', 'projects', 'offers', 'orders',
  'finance', 'tickets', 'email', 'integrations', 'system',
];

const hashOf = (page: Page) => page.evaluate(() => window.location.hash);

async function noPageScroll(page: Page, label = '') {
  // 16 px gutters and no horizontal page scroll: nothing wider than the viewport.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector('main.workspace') as HTMLElement | null;
    return { page: doc.scrollWidth - doc.clientWidth, main: main ? main.scrollWidth - main.clientWidth : 0 };
  });
  expect.soft(overflow.page, `page overflows on ${label}`).toBeLessThanOrEqual(1);
  expect.soft(overflow.main, `workspace overflows on ${label}`).toBeLessThanOrEqual(1);
}

test.describe('Settings home — tiles', () => {
  test('shows the 12 categories in three groups, all tiles of a group the same height', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');

    await expect(page.getByTestId('settings-home')).toBeVisible(SETTLE);
    for (const id of CATEGORY_IDS) await expect(page.getByTestId(`settings-tile-${id}`)).toBeVisible();
    await expect(page.locator('[data-testid^="settings-tile-"]')).toHaveCount(12);
    await expect(page.getByTestId('settings-layout-switch')).toBeVisible();

    // Every tile is one link, with no section chips inside it.
    const tile = page.getByTestId('settings-tile-leads');
    expect(await tile.evaluate((el) => el.tagName)).toBe('A');
    expect(await tile.evaluate((el) => el.querySelectorAll('a, button').length)).toBe(0);

    // Equal heights: the longest description and the shortest produce the same box.
    const heights = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="settings-tile-"]')).map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    expect(new Set(heights).size).toBe(1);

    // The description is clamped to two lines, never overflowing the tile.
    const overflowing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="settings-tile-"]')).filter((el) => el.scrollHeight > el.clientHeight + 1).length,
    );
    expect(overflowing).toBe(0);
    await noPageScroll(page);
  });

  test('a tile opens its category page, with tabs for every section', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    await page.getByTestId('settings-tile-leads').click();

    await expect(page.getByTestId('settings-category')).toHaveAttribute('data-category', 'leads', SETTLE);
    await expect(page.getByTestId('settings-section-tabs').getByRole('tab')).toHaveCount(5);
    // Real tabs: the first one is open, the others are not even rendered.
    await expect(page.getByRole('tab', { name: /Pipeline stages|Fázy pipeline|Pipeline-fázisok/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('settings-section-leads-stages')).toBeVisible();
    for (const s of ['sources', 'interests', 'assignment', 'intake']) {
      await expect(page.getByTestId(`settings-section-leads-${s}`)).toHaveCount(0);
    }
    // Related settings are cross-links, never a dead end.
    await expect(page.getByTestId('settings-related').getByRole('link').first()).toBeVisible();
    await page.getByTestId('settings-back').click();
    await expect(page.getByTestId('settings-home')).toBeVisible(SETTLE);
  });

  test('the Tiles | Sidebar switch is remembered across a reload', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    await page.getByTestId('settings-layout-sidebar').click();

    await expect(page.getByTestId('settings-nav')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-root')).toHaveAttribute('data-layout', 'sidebar');
    // `settings` opens the first category in this layout; its sections are sub-links of the nav.
    await expect(page.getByTestId('settings-category')).toHaveAttribute('data-category', 'company');

    await gotoView(page, '#settings'); // a fresh document load
    await expect(page.getByTestId('settings-nav')).toBeVisible(SETTLE);

    await page.getByTestId('settings-layout-tiles').click();
    await expect(page.getByTestId('settings-home')).toBeVisible(SETTLE);
    await gotoView(page, '#settings');
    await expect(page.getByTestId('settings-home')).toBeVisible(SETTLE);
  });

  test('the sidebar lists 12 categories and expands the active one', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    await page.getByTestId('settings-layout-sidebar').click();
    await page.getByTestId('settings-nav-leads').click();

    await expect(page.getByTestId('settings-category')).toHaveAttribute('data-category', 'leads', SETTLE);
    await expect(page.locator('[data-testid^="settings-nav-"]')).toHaveCount(12);
    await expect(page.getByTestId('settings-nav').locator('ul a')).toHaveCount(5);
  });
});

test.describe('Settings — every category renders', () => {
  test('all 12 category pages open without an error screen', async ({ page }) => {
    test.setTimeout(240_000);
    await startSession(page);
    for (const id of CATEGORY_IDS) {
      await gotoView(page, `#settings/${id}`);
      await expect(page.getByTestId('settings-category'), id).toHaveAttribute('data-category', id, SETTLE);
      await expect(page.getByText(/could not be displayed|nepodarilo zobraziť|nem sikerült megjeleníteni/), id).toHaveCount(0);
    }
  });
});

test.describe('Settings — old links keep working', () => {
  const cases: Array<[string, string]> = [
    ['#settings/invoicing', '#settings/company/billing'],
    ['#settings/branding', '#settings/company/profile'],
    ['#settings/managers', '#settings/access/users'],
    ['#settings/rbac', '#settings/access/roles'],
    ['#settings/states', '#settings/leads/stages'],
    ['#settings/sources', '#settings/leads/sources'],
    ['#settings/tasks', '#settings/projects/tasks'],
    ['#settings/api', '#settings/integrations/api'],
    ['#settings/danger', '#settings/system/reset'],
    ['#settings/license', '#settings/system/license'],
  ];
  for (const [from, to] of cases) {
    test(`${from} lands on ${to}`, async ({ page }) => {
      await startSession(page);
      await gotoView(page, from);
      await expect.poll(() => hashOf(page), SETTLE).toBe(to);
      await expect(page.getByTestId('settings-category')).toBeVisible(SETTLE);
    });
  }

  test('#settings/invoicing shows the billing details with the IČO field', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/invoicing');
    await expect(page.getByTestId('settings-section-company-billing')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-section-company-billing').getByText('IČO', { exact: true })).toBeVisible();
  });

  test('ids that are also categories open the category itself', async ({ page }) => {
    await startSession(page);
    for (const id of ['finance', 'tickets', 'orders', 'projects']) {
      await gotoView(page, `#settings/${id}`);
      await expect(page.getByTestId('settings-category')).toHaveAttribute('data-category', id, SETTLE);
      expect(await hashOf(page)).toBe(`#settings/${id}`);
    }
  });

  test('the custom record types keep their create route', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/unified/new');
    await expect.poll(() => hashOf(page), SETTLE).toBe('#settings/modules/records/new');
    // Creating takes the whole width and hides the navigation.
    await expect(page.getByTestId('settings-record-editor')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-section-tabs')).toHaveCount(0);
  });
});

test.describe('Settings — inline search', () => {
  test('results appear under the field, in no dialog, and clearing brings the tiles back', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    const field = page.getByRole('combobox');
    await field.fill('IČO');

    const results = page.getByRole('listbox');
    await expect(results).toBeVisible(SETTLE);
    await expect(results.getByRole('option', { name: /Billing details|Fakturačné údaje|Számlázási adatok/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Tiles are replaced while there is a query.
    await expect(page.locator('[data-testid^="settings-tile-"]')).toHaveCount(0);
    // The results sit inside the same card as the field.
    const sameCard = await page.evaluate(() => {
      const input = document.querySelector('[role="combobox"]');
      const list = document.querySelector('[role="listbox"]');
      return !!input && !!list && input.closest('section') === list.closest('section');
    });
    expect(sameCard).toBe(true);

    await page.getByRole('button', { name: /Clear search|Vymazať hľadanie|Keresés törlése/ }).click();
    await expect(page.locator('[data-testid^="settings-tile-"]')).toHaveCount(12);
    await expect(field).toHaveValue('');
  });

  test('"ico" without diacritics finds IČO, and SMTP finds the e-mail sections', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    const field = page.getByRole('combobox');

    await field.fill('ico');
    await expect(page.getByRole('option', { name: /Billing details|Fakturačné údaje|Számlázási adatok/ })).toBeVisible(SETTLE);

    await field.fill('SMTP');
    await expect(page.getByRole('option').filter({ hasText: /Outgoing server|Odchádzajúci server|Kimenő szerver/ })).toBeVisible(SETTLE);
    await expect(page.getByRole('option').filter({ hasText: /Ticket intake|Príjem tiketov|Jegyfogadás/ })).toBeVisible();
  });

  test('Esc clears the query; "/" focuses the field; arrows and Enter open a result', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    const field = page.getByRole('combobox');

    await page.keyboard.press('/');
    await expect(field).toBeFocused();
    await field.fill('smtp');
    await expect(page.getByRole('listbox')).toBeVisible(SETTLE);
    // "/" typed inside the field is just a character.
    await page.keyboard.type('/');
    await expect(field).toHaveValue('smtp/');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    await expect(page.locator('[data-testid^="settings-tile-"]')).toHaveCount(12);

    await field.fill('pipeline');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(() => hashOf(page), SETTLE).toBe('#settings/leads/stages');
  });

  test('the sidebar filters inline the same way', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    await page.getByTestId('settings-layout-sidebar').click();
    await page.getByTestId('settings-nav').getByRole('combobox').fill('smtp');
    await expect(page.getByTestId('settings-nav').getByRole('listbox')).toBeVisible(SETTLE);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('Settings — a category page', () => {
  test('a deep link opens that section as the current tab, and only that section', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/leads/assignment');
    const section = page.getByTestId('settings-section-leads-assignment');
    await expect(section).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-section-tabs').locator('[aria-selected="true"]')).toContainText(/Automatic assignment|Automatické priraďovanie|Automatikus kiosztás/);
    await expect(page.getByTestId('settings-section-leads-stages')).toHaveCount(0);
    await expect.poll(async () => (await section.boundingBox())?.y ?? 9999, SETTLE).toBeLessThan(400);
  });

  test('a section tab moves the address and the current section', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/leads');
    await page.getByTestId('settings-section-tabs').getByRole('tab', { name: /Lead sources|Zdroje leadov|Lead források/ }).click();
    await expect.poll(() => hashOf(page), SETTLE).toBe('#settings/leads/sources');
    await expect(page.getByTestId('settings-section-tabs').locator('[aria-selected="true"]')).toContainText(/Lead sources|Zdroje leadov|Lead források/);
    // The tab swaps the content: the stages are gone, the sources are on screen.
    await expect(page.getByTestId('settings-section-leads-sources')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-section-leads-stages')).toHaveCount(0);
  });

  test('recently opened sections come back as chips on the home screen', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/leads/sources');
    await expect(page.getByTestId('settings-section-leads-sources')).toBeVisible(SETTLE);
    await page.waitForTimeout(600); // let the preference reach the (mocked) server
    await gotoView(page, '#settings');
    await expect(page.getByTestId('settings-recent-chip').first()).toContainText(/Lead sources|Zdroje leadov|Lead források/, SETTLE);
  });

  test('Finance shows the currency read-only and links to its one editor', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/finance/ledger');
    await expect(page.getByTestId('finance-currency-readonly')).toBeVisible(SETTLE);
    await page.getByTestId('finance-currency-link').click();
    await expect.poll(() => hashOf(page), SETTLE).toBe('#settings/company/regional');
  });

  test('the offer templates and statuses are cards that open the Price offers settings', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/offers/templates');
    const link = page.getByTestId('settings-module-link').first();
    await expect(link).toBeVisible(SETTLE);
    await link.click();
    await expect.poll(() => hashOf(page), SETTLE).toBe('#invoices/settings');
    await expect(page.getByText(/Defaults, connectors and templates|Predvolené hodnoty, prepojenia a šablóny|alapértékei, kapcsolatai és sablonjai/)).toBeVisible(SETTLE);
  });

  test('no emoji in the settings navigation or headings', async ({ page }) => {
    await startSession(page);
    const emoji = /[☀-➿️\u{1F300}-\u{1FAFF}]/u;
    for (const hash of ['#settings', '#settings/company', '#settings/integrations/api', '#settings/email', '#settings/leads']) {
      await gotoView(page, hash);
      const text = await page.locator('main.workspace').innerText();
      const headings = await page.locator('main.workspace h1, main.workspace h2, main.workspace h3, main.workspace h4, nav a, nav button').allInnerTexts();
      expect(headings.filter((h) => emoji.test(h)), `${hash}: ${text.slice(0, 40)}`).toEqual([]);
    }
  });
});

test.describe('Settings — one look for every block', () => {
  test('every section is a tab, and every block on it has the same header', async ({ page }) => {
    test.setTimeout(480_000);
    await startSession(page);
    const offenders: string[] = [];
    for (const cat of SETTINGS_CATEGORIES) {
      for (const sec of cat.sections) {
        if (sec.id === 'autocreate') continue; // hidden while the feature flag is off
        await gotoView(page, `#settings/${cat.id}/${sec.id}`);
        const panel = page.getByTestId(`settings-section-${cat.id}-${sec.id}`);
        await expect(panel, `${cat.id}/${sec.id}`).toBeVisible(SETTLE);
        const bad = await panel.evaluate((root) =>
          Array.from(root.querySelectorAll('.glass-panel'))
            .filter((el) => !el.firstElementChild?.querySelector(':scope > div > h3.type-panel-title'))
            .map((el) => (el.textContent ?? '').trim().slice(0, 40)),
        );
        for (const b of bad) offenders.push(`${cat.id}/${sec.id}: "${b}"`);
      }
    }
    expect(offenders, 'blocks without the standard header').toEqual([]);
  });

  test('arrow keys move between the tabs of a category', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/leads');
    const tabs = page.getByTestId('settings-section-tabs').getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => hashOf(page), SETTLE).toBe('#settings/leads/sources');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect.poll(() => hashOf(page), SETTLE).toBe('#settings/leads/intake');
  });

  test('the company blocks have no Save button — they save themselves', async ({ page }) => {
    await startSession(page);
    for (const sec of ['profile', 'billing', 'bank']) {
      await gotoView(page, `#settings/company/${sec}`);
      const panel = page.getByTestId(`settings-section-company-${sec}`);
      await expect(panel).toBeVisible(SETTLE);
      await expect(panel.getByRole('button', { name: /Save|Uložiť|Mentés/ })).toHaveCount(0);
    }
    await gotoView(page, '#settings/company/bank');
    await page.getByTestId('settings-section-company-bank').getByRole('textbox').first().fill('SK31 1200 0000 1987 4263 7541');
    await expect(page.getByTestId('settings-save-status')).toHaveAttribute('data-status', 'saved', SETTLE);
  });

  test('the new-account form appears only when asked for, inside the users block', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/access/users');
    const card = page.getByTestId('settings-users-card');
    await expect(card).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-add-user-form')).toHaveCount(0);

    await card.getByTestId('settings-add-user').click();
    const form = card.getByTestId('settings-add-user-form');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: /Cancel|Zrušiť|Mégse/ }).click();
    await expect(page.getByTestId('settings-add-user-form')).toHaveCount(0);
  });

  test('language dropdowns show names only — no flags, no codes', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/company/regional');
    const panel = page.getByTestId('settings-section-company-regional');
    await expect(panel).toBeVisible(SETTLE);
    await panel.getByRole('button').first().click();
    const options = (await page.getByRole('option').allInnerTexts()).map((o) => o.trim()).filter(Boolean);
    for (const name of ['Slovenčina', 'English', 'Magyar']) expect(options).toContain(name);
    expect(options.filter((o) => /^[A-Z]{2}\b|[\u{1F1E6}-\u{1F1FF}]/u.test(o))).toEqual([]);
  });

  test('the project types block is the same card as the statuses block', async ({ page }) => {
    await startSession(page);
    const look = (el: Element) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, pad: cs.paddingTop, bg: cs.backgroundColor };
    };
    await gotoView(page, '#settings/projects/types');
    const types = page.getByTestId('settings-project-types');
    await expect(types).toBeVisible(SETTLE);
    const typesLook = await types.evaluate(look);

    await gotoView(page, '#settings/projects/statuses');
    const status = page.getByTestId('settings-section-projects-statuses').locator('.glass-panel').first();
    await expect(status).toBeVisible(SETTLE);
    expect(await status.evaluate(look)).toEqual(typesLook);
  });
});

test.describe('Settings — on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('home is a 2-column grid of equal tiles, with no layout switch and no sidebar', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');

    await expect(page.getByTestId('settings-home')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-layout-switch')).toHaveCount(0);
    await expect(page.getByTestId('settings-nav')).toHaveCount(0);

    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="settings-tile-"]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
      }),
    );
    expect(boxes).toHaveLength(12);
    expect(new Set(boxes.map((b) => b.h)).size).toBe(1);
    expect(new Set(boxes.map((b) => b.x)).size).toBe(2); // two columns
    // Nothing is clipped by the fixed height, even for the longest two-line title.
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="settings-tile-"]')).filter((el) => el.scrollHeight > el.clientHeight + 1).length,
    );
    expect(clipped).toBe(0);
    await noPageScroll(page);
  });

  test('a stored sidebar preference is kept, but a phone still shows tiles', async ({ page }) => {
    await startSession(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoView(page, '#settings');
    await page.getByTestId('settings-layout-sidebar').click();
    await expect(page.getByTestId('settings-nav')).toBeVisible(SETTLE);
    await page.waitForTimeout(600);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoView(page, '#settings');
    await expect(page.getByTestId('settings-home')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-nav')).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoView(page, '#settings');
    await expect(page.getByTestId('settings-nav')).toBeVisible(SETTLE); // the choice survived
  });

  test('the only sideways scroller is the recents row, and it shows no scrollbar', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/leads/sources');
    await page.waitForTimeout(500);
    await gotoView(page, '#settings');
    const chip = page.getByTestId('settings-recent-chip').first();
    await expect(chip).toBeVisible(SETTLE);
    const scroller = chip.locator('xpath=ancestor::*[contains(@class,"scroll-fade-x")][1]');
    const style = await scroller.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { overflowX: cs.overflowX, scrollbarWidth: cs.scrollbarWidth, offsetH: (el as HTMLElement).offsetHeight - (el as HTMLElement).clientHeight };
    });
    expect(style.overflowX).toBe('auto');
    expect(style.scrollbarWidth).toBe('none');
    expect(style.offsetH).toBe(0); // no scrollbar strip takes any height
    await noPageScroll(page);
  });

  test('a category page has a sticky bar and a section dropdown, never a chip row', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/leads');
    await expect(page.getByTestId('settings-sticky-bar')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-section-tabs')).toHaveCount(0);

    const menu = page.getByTestId('settings-section-menu');
    await expect(menu).toContainText(/1\D+5/); // "Section 1 of 5"
    await menu.click();
    const list = page.getByTestId('settings-section-menu-list');
    await expect(list.getByRole('link')).toHaveCount(5);

    // Esc closes it; tapping outside closes it; picking a section scrolls and closes it.
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await menu.click();
    await page.getByTestId('settings-sticky-bar').getByRole('heading').click();
    await expect(list).toHaveCount(0);
    await menu.click();
    await list.getByRole('link', { name: /Automatic assignment|Automatické priraďovanie|Automatikus kiosztás/ }).click();
    await expect(list).toHaveCount(0);
    await expect.poll(() => hashOf(page), SETTLE).toBe('#settings/leads/assignment');
    await expect(menu).toContainText(/Automatic assignment|Automatické priraďovanie|Automatikus kiosztás/, SETTLE);
    await noPageScroll(page);
  });

  test('no category page scrolls the page sideways', async ({ page }) => {
    test.setTimeout(240_000);
    await startSession(page);
    for (const id of CATEGORY_IDS) {
      await gotoView(page, `#settings/${id}`);
      await expect(page.getByTestId('settings-category'), id).toBeVisible(SETTLE);
      await noPageScroll(page, id);
    }
  });

  test('a table wider than the screen scrolls inside its card, with no scrollbar strip', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/leads/stages');
    const scroller = page.getByTestId('settings-section-leads-stages').locator('.scroll-fade-x').first();
    await expect(scroller).toBeVisible(SETTLE);
    const info = await scroller.evaluate((el) => ({
      scrolls: el.scrollWidth > el.clientWidth,
      // what is left of the box once the clientHeight and the card's own borders are taken off
      strip: (el as HTMLElement).offsetHeight - (el as HTMLElement).clientHeight - parseFloat(getComputedStyle(el).borderTopWidth) - parseFloat(getComputedStyle(el).borderBottomWidth),
      width: getComputedStyle(el).scrollbarWidth,
      fade: el.getAttribute('data-fade'),
    }));
    expect(info.scrolls).toBe(true);
    expect(info.width).toBe('none');
    expect(info.strip).toBe(0);
    expect(info.fade).toContain('end'); // the fade on the right edge says there is more
    await noPageScroll(page);
  });

  test('search stays on the home screen: results under the field, tiles hidden', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings');
    await page.getByRole('combobox').fill('smtp');
    await expect(page.getByRole('listbox')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-home')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-testid^="settings-tile-"]')).toHaveCount(0);
    await page.getByRole('button', { name: /Clear search|Vymazať hľadanie|Keresés törlése/ }).click();
    await expect(page.locator('[data-testid^="settings-tile-"]')).toHaveCount(12);
  });

  test('an edited company form saves itself: no save bar, no save button, a "Saved" chip', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/company/billing');

    const street = page.getByTestId('settings-section-company-billing').getByRole('textbox').nth(3);
    const before = await street.inputValue();
    // 48 px inputs on a phone.
    expect((await street.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(47);
    await street.fill(before + ' 7');

    await expect(page.getByTestId('settings-save-status')).toBeVisible(SETTLE);
    await expect(page.getByTestId('settings-save-status')).toHaveAttribute('data-status', 'saved', SETTLE);
    await expect(page.getByTestId('settings-save-bar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Save|Uložiť|Mentés/ })).toHaveCount(0);
    await expect(street).toHaveValue(before + ' 7');
  });
});
