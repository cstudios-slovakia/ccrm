import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';
import { holdToConfirm } from './helpers/hold';

/** The hold that confirms is 500 ms; hold for three times that so a starved animation frame on a loaded machine cannot turn it into an early release. */
const CONFIRM_HOLD_MS = 1500;

/**
 * Settings > Reset data > Re-seed demo data (docs/DEMO-MODE.md, phase 3).
 *
 * The suite mocks `/api/demo_reseed.php`; the real endpoint, the wipe and the seed are covered offline
 * by `php scripts/test-demo-wipe.php`. What only a browser can see: the section exists in demo mode
 * and is absent otherwise, the selects are pre-filled from the status, the notice names the modules an
 * old install lacks, the button needs a hold, the POST carries what was chosen, and the result - the
 * new logins, the password and the per-module table - is readable after the app drops to the login.
 *
 * The fixture runs in Slovak, so labels are matched in more than one language where they are not test ids.
 */

const SETTLE = { timeout: 20_000 };

interface Status {
  demoMode: boolean;
  language: string;
  currency: string;
  dataset: Record<string, unknown> | null;
  currentVersion: number;
  modules: string[];
  missing: string[];
  unavailable: string[];
  outdated: boolean;
}

const MODULES = ['company', 'employees', 'clients', 'projects', 'tasks', 'offers', 'warehouse', 'orders', 'finance', 'tickets', 'time', 'whatsapp', 'email', 'meetings', 'workflows', 'sai'];

/** An install made before DEMO_DATASET existed: it has the old modules, not the new ones. */
const OLD_INSTALL: Status = {
  demoMode: true,
  language: 'sk',
  currency: 'EUR',
  dataset: null,
  currentVersion: 2,
  modules: MODULES,
  missing: ['company', 'employees', 'time', 'tickets', 'meetings', 'workflows', 'sai'],
  unavailable: [],
  outdated: true,
};
const CURRENT_INSTALL: Status = { ...OLD_INSTALL, dataset: { version: 2, language: 'hu', currency: 'EUR' }, missing: [], outdated: false };

const RESULT = {
  success: true,
  loggedOut: true,
  language: 'hu',
  currency: 'EUR',
  resetCompany: true,
  wiped: { leads: 5, tasks: 4, users: 3 },
  report: {
    company: { ok: true, rows: 7, error: null },
    clients: { ok: true, rows: 11, error: null },
    time: { ok: true, rows: 96, error: null },
    sai: { ok: false, rows: 0, error: 'SQLSTATE[42S22]: Column not found' },
    tickets: { ok: true, rows: 0, error: null, skipped: true },
  },
  failed: ['sai'],
  logins: [
    { role: 'owner', name: 'Kollár András', email: 'kollar.andras@lapidea.example' },
    { role: 'pm', name: 'Szabó Szilvia', email: 'szabo.szilvia@lapidea.example' },
    { role: 'sales', name: 'Juhász János', email: 'juhasz.janos@lapidea.example' },
  ],
  password: 'password',
  loginsReady: true,
};

/** Opens the reset section. `demo` turns demo mode on in the sync answer; `status` is what the endpoint reports. */
async function openReset(page: Page, opts: { demo: boolean; status?: Status; post?: (body: unknown) => { status: number; body: unknown } }) {
  const posts: unknown[] = [];
  await startSession(page);
  if (opts.demo) {
    // Later registrations win: answer the pull with demoMode on, leave pushes to the fixture.
    await page.route('**/sync.php**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...buildSyncPayload(), demoMode: true }) })
        : route.fallback(),
    );
  }
  await page.route('**/api/demo_reseed.php**', (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, ...(opts.status ?? OLD_INSTALL) }) });
    }
    const body = req.postDataJSON();
    posts.push(body);
    const answer = opts.post?.(body) ?? { status: 200, body: RESULT };
    return route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) });
  });
  await gotoView(page, '#settings/system/reset');
  await expect(page.getByTestId('settings-section-system-reset')).toBeVisible(SETTLE);
  return posts;
}

test.describe('Re-seed demo data', () => {
  test('the section is absent when the install is not in demo mode', async ({ page }) => {
    await openReset(page, { demo: false });
    // The rest of the page is there (the danger card), the re-seed card is not.
    await expect(page.getByTestId('settings-section-system-reset')).toBeVisible();
    await expect(page.getByTestId('demo-reseed')).toHaveCount(0);
  });

  test('in demo mode it renders, pre-filled from the status, with a notice naming what an old install lacks', async ({ page }) => {
    await openReset(page, { demo: true });
    const section = page.getByTestId('demo-reseed');
    await expect(section).toBeVisible(SETTLE);
    await expect(page.getByTestId('demo-reseed-language')).toHaveValue('sk');
    await expect(page.getByTestId('demo-reseed-currency')).toHaveValue('EUR');
    await expect(page.getByTestId('demo-reseed-reset-company')).toBeChecked();
    // Currencies of the demo (B4); a Hungarian install can pick forint.
    expect(await page.getByTestId('demo-reseed-currency').locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).toEqual(['EUR', 'HUF', 'CZK', 'PLN', 'USD', 'GBP']);

    const notice = page.getByTestId('demo-reseed-notice');
    await expect(notice).toBeVisible();
    // time tracking, SAI, meetings, automations (the fixture's UI language is Slovak)
    await expect(notice).toContainText(/Sledovanie času|Time tracking|Időkövetés/);
    await expect(notice).toContainText(/SAI/);
    await expect(notice).toContainText(/AI zasadačka|AI meeting room|AI tárgyaló/);
    await expect(notice).toContainText(/Automatizácie|Automations|Automatizálások/);
    // The confirm text says what is kept and what happens to the session.
    await expect(page.getByTestId('demo-reseed-confirm-text')).toContainText(/odhlási|signs you out|kijelentkeztet/);
  });

  test('an install on the current dataset shows no notice', async ({ page }) => {
    await openReset(page, { demo: true, status: CURRENT_INSTALL });
    await expect(page.getByTestId('demo-reseed')).toBeVisible(SETTLE);
    await expect(page.getByTestId('demo-reseed-notice')).toHaveCount(0);
  });

  test('modules this version cannot seed yet are not promised in the notice', async ({ page }) => {
    await openReset(page, { demo: true, status: { ...OLD_INSTALL, unavailable: ['time', 'sai'] } });
    const notice = page.getByTestId('demo-reseed-notice');
    await expect(notice).toBeVisible(SETTLE);
    await expect(notice).not.toContainText(/Sledovanie času|Time tracking/);
    await expect(notice).not.toContainText(/SAI/);
    await expect(notice).toContainText(/Automatizácie|Automations/);
  });

  test('a plain click does nothing; holding posts the chosen language, currency and company choice', async ({ page }) => {
    const posts = await openReset(page, { demo: true });
    const language = page.getByTestId('demo-reseed-language');
    const currency = page.getByTestId('demo-reseed-currency');
    await expect(language).toBeVisible(SETTLE);

    // Picking a language re-defaults the currency until the user has touched it (B4: hu -> HUF).
    await language.selectOption('hu');
    await expect(currency).toHaveValue('HUF');
    await currency.selectOption('EUR');
    await language.selectOption('en');
    await expect(currency).toHaveValue('EUR'); // touched: it stays
    await language.selectOption('hu');

    const run = page.getByTestId('demo-reseed-run');
    await run.click();                       // a click is not a confirmation
    await holdToConfirm(run, 200);           // neither is an early release
    await page.waitForTimeout(400);
    expect(posts).toHaveLength(0);
    await expect(page.getByTestId('demo-reseed-result')).toHaveCount(0);

    await holdToConfirm(run, CONFIRM_HOLD_MS);
    await expect.poll(() => posts.length, SETTLE).toBe(1);
    expect(posts[0]).toEqual({ language: 'hu', currency: 'EUR', resetCompany: true });
  });

  test('the company box is sent as chosen', async ({ page }) => {
    const posts = await openReset(page, { demo: true });
    await expect(page.getByTestId('demo-reseed-reset-company')).toBeVisible(SETTLE);
    await page.getByTestId('demo-reseed-reset-company').uncheck();
    await holdToConfirm(page.getByTestId('demo-reseed-run'), CONFIRM_HOLD_MS);
    await expect.poll(() => posts.length, SETTLE).toBe(1);
    expect(posts[0]).toMatchObject({ language: 'sk', currency: 'EUR', resetCompany: false });
  });

  test('the result shows the new logins, the password and a per-module table', async ({ page }) => {
    await openReset(page, { demo: true });
    await holdToConfirm(page.getByTestId('demo-reseed-run'), CONFIRM_HOLD_MS);

    const dialog = page.getByTestId('demo-reseed-result');
    await expect(dialog).toBeVisible(SETTLE);
    await expect(dialog.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    const emails = await dialog.getByTestId('demo-reseed-login-email').allTextContents();
    expect(emails).toEqual(RESULT.logins.map((l) => l.email));
    await expect(dialog.getByTestId('demo-reseed-password')).toHaveText('password');

    const table = dialog.getByTestId('demo-reseed-report');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(table.locator('tr[data-module="time"]')).toContainText('96');
    await expect(table.locator('tr[data-module="sai"]')).toHaveAttribute('data-state', 'failed');
    await expect(table.locator('tr[data-module="sai"]')).toContainText('Column not found');
    await expect(table.locator('tr[data-module="tickets"]')).toHaveAttribute('data-state', 'skipped');

    // The same table is in the section while Settings is still on screen.
    await expect(page.getByTestId('demo-reseed').getByTestId('demo-reseed-report')).toBeVisible();
    // The way out is a button that reloads to the login picker; it is focused, so Enter works.
    await expect(dialog.getByTestId('demo-reseed-continue')).toBeFocused();
  });

  test('a refusal is shown in the section and nothing else happens', async ({ page }) => {
    await openReset(page, { demo: true, post: () => ({ status: 409, body: { success: false, code: 'not_demo_mode' } }) });
    await holdToConfirm(page.getByTestId('demo-reseed-run'), CONFIRM_HOLD_MS);
    await expect(page.getByTestId('demo-reseed-error')).toBeVisible(SETTLE);
    await expect(page.getByTestId('demo-reseed-result')).toHaveCount(0);
    // Not stuck "running": the controls are back.
    await expect(page.getByTestId('demo-reseed-run')).toBeEnabled();
  });
});
