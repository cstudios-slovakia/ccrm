import { expect, test, type Page, type Route } from '@playwright/test';
import { startSession } from './helpers/appDriver';
import { buildSyncPayload, TEST_USER } from './helpers/fixture';

/**
 * "Remember me" from the browser's side: a new tab has an empty sessionStorage,
 * but the PHP session cookie (or the remember-me token that rebuilds it) may
 * still be good. The server then answers the first /sync.php pull with
 * `authenticated: true` and `sessionUser`, and the app has to sign the tab in
 * from that instead of showing the login screen.
 *
 * /sync.php is mocked, so this covers the app's side only. The cookie, token
 * rotation and revocation are exercised against the real backend by hand (see
 * the v1.12.57 changelog entry).
 */

/** The login form's password field: present exactly when the login screen is up. */
const PASSWORD_FIELD = 'input[autocomplete~="current-password"]';

type SyncAnswer = Record<string, unknown> | { status: 401 };

/** A tab that has just been opened: the fixture's seeded login is removed again. */
async function freshTab(page: Page, answer: () => SyncAnswer) {
  await startSession(page);
  await page.addInitScript(() => {
    try {
      window.sessionStorage.removeItem('crm_current_user_rbac');
      window.sessionStorage.removeItem('crm_session_token');
    } catch {
      /* nothing seeded */
    }
    // Remember whether the login screen was ever on the page, not only whether it is now.
    (window as unknown as { __sawLogin: boolean }).__sawLogin = false;
    new MutationObserver(() => {
      if (document.querySelector('input[autocomplete~="current-password"]')) {
        (window as unknown as { __sawLogin: boolean }).__sawLogin = true;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  // Registered after the fixture's own route, so it answers first.
  await page.route('**/sync.php**', (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const a = answer();
    if ('status' in a && a.status === 401) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(a) });
  });
}

const liveSession = (email: string) => ({ ...buildSyncPayload(), authenticated: true, sessionUser: { email } });

const sawLogin = (page: Page) => page.evaluate(() => (window as unknown as { __sawLogin: boolean }).__sawLogin);

test.describe('Remember me: adopting the server session', () => {
  test('a new tab with a live server session shows the app, never the login screen', async ({ page }) => {
    await freshTab(page, () => liveSession(TEST_USER.email));
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0);
    expect(await sawLogin(page)).toBe(false);

    // The other components read the signed-in user from sessionStorage.
    const stored = await page.evaluate(() => window.sessionStorage.getItem('crm_current_user_rbac'));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).email).toBe(TEST_USER.email);
    // The landing page the user asked for is kept, not replaced by their default one.
    expect(new URL(page.url()).hash).toBe('#dashboard');
  });

  test('the e-mail match ignores case', async ({ page }) => {
    await freshTab(page, () => liveSession(TEST_USER.email.toUpperCase()));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0);
  });

  test('no server session (401) still shows the login screen', async ({ page }) => {
    await freshTab(page, () => ({ status: 401 }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(PASSWORD_FIELD)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('main')).toHaveCount(0);
  });

  test('"authenticated: false" shows the login screen even when it names a user', async ({ page }) => {
    await freshTab(page, () => ({
      installed: true,
      authenticated: false,
      users: [TEST_USER],
      sessionUser: { email: TEST_USER.email },
    }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(PASSWORD_FIELD)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('main')).toHaveCount(0);
  });

  test('an answer that names nobody (or somebody unknown) adopts nobody', async ({ page }) => {
    await freshTab(page, () => ({ ...buildSyncPayload(), authenticated: true, sessionUser: { email: 'ghost@nowhere.test' } }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(PASSWORD_FIELD)).toBeVisible({ timeout: 15_000 });
  });

  test('only the first pull adopts: a session that appears later does not undo a logout', async ({ page }) => {
    let serverHasSession = false;
    await freshTab(page, () => (serverHasSession ? liveSession(TEST_USER.email) : { status: 401 }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(PASSWORD_FIELD)).toBeVisible({ timeout: 15_000 });

    // A pull that was already in flight when the user logged out lands after it and
    // finds the old session: the app must keep showing the login screen. The poller
    // runs every 5 s, so give it two rounds.
    serverHasSession = true;
    await page.waitForTimeout(11_000);
    await expect(page.locator(PASSWORD_FIELD)).toBeVisible();
    await expect(page.locator('main')).toHaveCount(0);
  });
});
