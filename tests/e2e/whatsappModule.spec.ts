import { expect, test, type Page } from '@playwright/test';
import { startSession } from './helpers/appDriver';
import { TEST_USER } from './helpers/fixture';

/**
 * The WhatsApp module (docs/WAAI-INTEGRATION.md §4.7): WAAI in a frame, signed in by a one-time token that
 * the CRM hands over by postMessage, kept in step with the CRM's address bar, sidebar badge and theme.
 *
 * WAAI is a stand-in served from https://wa.test by `page.route`: a sign-in page that answers like the real
 * `/embed/sso`, and an app page that reports its route and unread count and logs what it receives. The real
 * WAAI is exercised by hand (docs/WAAI-INTEGRATION.md, phase 7 notes), because it needs Postgres and Redis.
 *
 * The fixture runs in Slovak.
 */

const WAAI = 'https://wa.test';
const TOKEN = 'header.payload.signature';

interface Frame {
  signedIn: boolean;
  tokensIssued: number;
  /** What the stand-in app page says right after it loads. */
  unread: number;
  /** Extra script for the app page, e.g. to ask for a CRM record. */
  appScript: string;
}

/** The stand-in: `/embed/sso` trades the token, any other path is the app. Everything it receives lands in #log. */
async function installWaai(page: Page, over: Partial<Frame> = {}, configured = true) {
  const state: Frame = { signedIn: false, tokensIssued: 0, unread: 3, appScript: '', ...over };

  await page.route('**/api/waai_sso.php', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        json: configured
          ? { success: true, configured: true, embed_url: WAAI, can_manage: true, user_id: TEST_USER.id }
          : { success: true, configured: false, embed_url: null, can_manage: true, user_id: TEST_USER.id },
      });
    }
    state.tokensIssued++;
    return route.fulfill({ json: { success: true, token: TOKEN, expires_in: 60 } });
  });

  await page.route(`${WAAI}/**`, async (route) => {
    const url = new URL(route.request().url());
    const html = (body: string) =>
      route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><title>WAAI</title></head><body><pre id="log"></pre><script>
        const parentOrigin = (location.ancestorOrigins && location.ancestorOrigins[0]) || new URL(document.referrer).origin;
        const log = (m) => { document.getElementById('log').textContent += JSON.stringify(m) + '\\n'; };
        const send = (m) => parent.postMessage(m, parentOrigin);
        ${body}
      </script></body></html>` });

    if (url.pathname === '/__signin') {
      state.signedIn = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/embed/sso') {
      const next = url.searchParams.get('next') ?? '/';
      return html(`
        window.addEventListener('message', async (e) => {
          if (e.origin !== parentOrigin) return;
          log(e.data);
          if (e.data.type === 'ccrm:sso') { await fetch('/__signin'); location.replace(${JSON.stringify(next)}); }
          if (e.data.type === 'ccrm:navigate') location.replace(e.data.path);
        });
        send({ type: 'waai:ready', authed: ${state.signedIn}, userCrmId: ${state.signedIn ? JSON.stringify(TEST_USER.id) : 'undefined'} });
      `);
    }
    // The app.
    return html(`
      window.addEventListener('message', (e) => {
        if (e.origin !== parentOrigin) return;
        log(e.data);
        if (e.data.type === 'ccrm:navigate') { history.pushState(null, '', e.data.path); send({ type: 'waai:route', path: e.data.path, title: 'WAAI' }); }
        if (e.data.type === 'ccrm:appearance') document.documentElement.dataset.theme = e.data.theme + '/' + e.data.locale;
      });
      send({ type: 'waai:ready', authed: true, userCrmId: ${JSON.stringify(TEST_USER.id)} });
      send({ type: 'waai:route', path: location.pathname + location.search, title: 'WAAI' });
      send({ type: 'waai:unread', chats: ${state.unread} });
      ${state.appScript}
    `);
  });
  return state;
}

const frameLog = async (page: Page) => page.frameLocator('iframe[title="WhatsApp"]').locator('#log').textContent();

test.describe('WhatsApp module', () => {
  test('signs the user in with a one-time token, opens the chat asked for and badges the sidebar', async ({ page }) => {
    await startSession(page);
    const waai = await installWaai(page);
    await page.goto('/#whatsapp/c/abc123');

    const frame = page.frameLocator('iframe[title="WhatsApp"]');
    await expect(frame.locator('#log')).toContainText('"ccrm:appearance"', { timeout: 15_000 });
    await expect.poll(() => frameLog(page)).toContain('"type":"ccrm:navigate","path":"/c/abc123"');
    expect(waai.tokensIssued).toBe(1);
    // The token went in a message, and the address of the frame never carried it.
    await expect(page.locator('iframe[title="WhatsApp"]')).toHaveAttribute('src', `${WAAI}/embed/sso?next=%2Fc%2Fabc123`);

    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="3"]').first()).toBeVisible();
    expect(await page.evaluate(() => window.location.hash)).toBe('#whatsapp/c/abc123');
  });

  test('moves the frame when the address changes, and comes back to where it was', async ({ page }) => {
    await startSession(page);
    await installWaai(page);
    await page.goto('/#whatsapp/c/first');
    await expect.poll(() => frameLog(page), { timeout: 15_000 }).toContain('"path":"/c/first"');

    await page.evaluate(() => { window.location.hash = '#whatsapp/c/second?m=msg9'; });
    await expect.poll(() => frameLog(page)).toContain('"path":"/c/second?m=msg9"');
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#whatsapp/c/second?m=msg9');

    // Another module: the frame stays alive but hidden.
    await page.evaluate(() => { window.location.hash = '#tasks'; });
    await expect(page.locator('iframe[title="WhatsApp"]')).toBeHidden();
    await expect(page.locator('iframe[title="WhatsApp"]')).toHaveCount(1);

    // The sidebar item (a bare #whatsapp) returns to the chat that was open, not to the chat list.
    await page.evaluate(() => { window.location.hash = '#whatsapp'; });
    await expect(page.locator('iframe[title="WhatsApp"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#whatsapp/c/second?m=msg9');
  });

  test('tells the frame the CRM theme and language', async ({ page }) => {
    await startSession(page);
    await installWaai(page);
    await page.goto('/#whatsapp');
    await expect.poll(() => frameLog(page), { timeout: 15_000 }).toContain('"type":"ccrm:appearance"');
    expect(await frameLog(page)).toMatch(/"theme":"(light|dark)","locale":"sk"/);

    await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
    await expect.poll(() => frameLog(page)).toContain('"theme":"dark"');
  });

  test('a request from WAAI to open a client opens it in the CRM', async ({ page }) => {
    await startSession(page);
    await installWaai(page, { appScript: "send({ type: 'waai:open-crm', kind: 'lead', id: 'client-kovac' });" });
    await page.goto('/#whatsapp');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(window.location.hash)), { timeout: 15_000 }).toBe('#client-Kováč Reality s.r.o.');
  });

  test('ignores a message that is not from the frame', async ({ page }) => {
    await startSession(page);
    await installWaai(page);
    await page.goto('/#whatsapp');
    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="3"]').first()).toBeVisible({ timeout: 15_000 });
    // The page itself is a different origin and window than the frame.
    await page.evaluate(() => window.postMessage({ type: 'waai:unread', chats: 77 }, '*'));
    await page.waitForTimeout(300);
    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="77"]')).toHaveCount(0);
  });

  test('an account WAAI does not know gets a clear screen, not a blank frame', async ({ page }) => {
    await startSession(page);
    await installWaai(page, { appScript: '' });
    // The stand-in reports the refusal instead of signing in.
    await page.route(`${WAAI}/embed/sso*`, (route) =>
      route.fulfill({ contentType: 'text/html', body: `<!doctype html><body><script>
        const o = (location.ancestorOrigins && location.ancestorOrigins[0]) || new URL(document.referrer).origin;
        parent.postMessage({ type: 'waai:ready', authed: false }, o);
        window.addEventListener('message', (e) => { if (e.data.type === 'ccrm:sso') parent.postMessage({ type: 'waai:error', code: 'not_linked' }, o); });
      </script></body>` }),
    );
    await page.goto('/#whatsapp');
    await expect(page.getByRole('heading', { name: /nie je prepojený s WAAI/ })).toBeVisible({ timeout: 15_000 });
  });

  test('before it is connected, an administrator is sent to the settings', async ({ page }) => {
    await startSession(page);
    await installWaai(page, {}, false);
    await page.goto('/#whatsapp');
    await expect(page.getByRole('heading', { name: 'WhatsApp ešte nie je pripojený' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Otvoriť nastavenia' })).toHaveAttribute('href', '#settings/integrations/waai');
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});
