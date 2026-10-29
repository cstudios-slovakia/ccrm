import { expect, test, type Page } from '@playwright/test';
import { startSession } from './helpers/appDriver';
import { TEST_USER } from './helpers/fixture';

/**
 * The native WhatsApp module (docs/WAAI-NATIVE-MODULE.md): ordinary CRM screens on WAAI's module API.
 * WAAI is a stand-in: `page.route` answers `/waai-api/*` like the real `/api/ccrm/v1/*` (token exchange,
 * `/meta`, `/unread`, the error envelope) and records what it was asked. The real WAAI is exercised by hand
 * and by WAAI's own tests, because it needs Postgres and Redis.
 *
 * The fixture runs in Slovak.
 */

const SSO_TOKEN = 'header.payload.signature';

interface Waai {
  /** Bodies of the token exchange. */
  exchanges: { token: string }[];
  /** `Authorization` headers of every other call, in order. */
  bearers: string[];
  /** Overrides, changed by a test mid-way. */
  unread: { chats: number; messages: number };
  exchangeError: { status: number; code: string } | null;
  metaError: { status: number } | null;
  apiVersion: number;
  accounts: { id: string; status: string; display_name: string | null }[];
  /** The first `/unread` answers 401 once. */
  rejectNextUnread: boolean;
}

const envelope = (code: string, message = 'x') => ({ error: { code, message, request_id: 'req-1' } });

async function installNative(page: Page, over: Partial<Waai> = {}, config: { configured?: boolean; canManage?: boolean; standalone?: string | null } = {}) {
  const waai: Waai = {
    exchanges: [],
    bearers: [],
    unread: { chats: 4, messages: 9 },
    exchangeError: null,
    metaError: null,
    apiVersion: 1,
    accounts: [{ id: 'acc1', status: 'connected', display_name: 'Peter' }],
    rejectNextUnread: false,
    ...over,
  };
  let issued = 0;

  await page.route('**/api/waai_sso.php', async (route) => {
    if (route.request().method() === 'GET') {
      const standalone = config.standalone === undefined ? 'https://wa.test' : config.standalone;
      return route.fulfill({
        json: {
          success: true,
          configured: config.configured ?? true,
          module: { ui: 'native', transport: 'proxy', base: '/waai-api' },
          standalone_url: standalone,
          embed_url: standalone,
          can_manage: config.canManage ?? true,
          user_id: TEST_USER.id,
        },
      });
    }
    return route.fulfill({ json: { success: true, token: SSO_TOKEN, expires_in: 60 } });
  });

  await page.route('**/waai-api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/waai-api/, '');
    const method = req.method();

    if (path === '/session' && method === 'POST') {
      waai.exchanges.push(req.postDataJSON());
      if (waai.exchangeError) return route.fulfill({ status: waai.exchangeError.status, json: envelope(waai.exchangeError.code) });
      issued++;
      return route.fulfill({
        json: {
          access_token: `wam_token-${issued}`,
          expires_in: 3600,
          api_version: waai.apiVersion,
          user: { id: 'u1', role: 'admin', name: 'peter@example.sk', crm_user_id: TEST_USER.id },
        },
      });
    }
    if (path === '/session' && method === 'DELETE') return route.fulfill({ status: 204 });

    waai.bearers.push(req.headers()['authorization'] ?? '');
    if (path === '/meta') {
      if (waai.metaError) return route.fulfill({ status: waai.metaError.status, json: envelope('server_error') });
      return route.fulfill({
        json: {
          api_version: waai.apiVersion,
          features: ['session', 'meta', 'unread', 'media'],
          user: { id: 'u1', role: 'admin', name: 'peter@example.sk', crm_user_id: TEST_USER.id },
          ai_configured: true,
          standalone_url: null,
          wa_accounts: waai.accounts,
        },
      });
    }
    if (path === '/unread') {
      if (waai.rejectNextUnread) {
        waai.rejectNextUnread = false;
        return route.fulfill({ status: 401, json: envelope('invalid_token') });
      }
      return route.fulfill({ json: waai.unread });
    }
    return route.fulfill({ status: 404, json: envelope('route_not_found') });
  });
  return waai;
}

const tab = (page: Page, name: string) => page.getByTestId('wa-tabs').getByRole('tab', { name });

test.describe('Native WhatsApp module', () => {
  test('signs in with the CRM token, shows the header, the account state and the five tabs, and badges the sidebar', async ({ page }) => {
    await startSession(page);
    const waai = await installNative(page);
    await page.goto('/#whatsapp');

    await expect(page.getByRole('heading', { name: 'WhatsApp' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('wa-account-pill')).toHaveText('Pripojený');
    for (const name of ['Chaty', 'Súhrn', 'Úlohy', 'Opýtať sa', 'Nastavenia']) {
      await expect(tab(page, name)).toBeVisible();
    }
    await expect(tab(page, 'Chaty')).toHaveAttribute('aria-selected', 'true');

    expect(waai.exchanges).toEqual([{ token: SSO_TOKEN }]);
    expect(waai.bearers.length).toBeGreaterThan(0);
    expect(waai.bearers.every((b) => b === 'Bearer wam_token-1')).toBe(true);
    // The unread count of chats (not messages) is the sidebar badge.
    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="4"]').first()).toBeVisible();
    // No frame, no second application.
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('the tabs follow the address, and clicking one moves it', async ({ page }) => {
    await startSession(page);
    await installNative(page);
    await page.goto('/#whatsapp/digest');
    await expect(tab(page, 'Súhrn')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });

    await tab(page, 'Opýtať sa').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#whatsapp/search');
    await expect(tab(page, 'Opýtať sa')).toHaveAttribute('aria-selected', 'true');

    // An address that exists today (a task footer's link) opens the chat tab.
    await page.evaluate(() => { window.location.hash = '#whatsapp/c/abc123?m=m1'; });
    await expect(tab(page, 'Chaty')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('V tomto rozhraní zatiaľ nie je')).toBeVisible();
  });

  test('a user WAAI does not know gets a clear screen', async ({ page }) => {
    await startSession(page);
    await installNative(page, { exchangeError: { status: 403, code: 'not_linked' } });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-not-linked')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Váš účet nie je prepojený s WAAI' })).toBeVisible();
  });

  test('a WAAI that speaks another version says it needs an update', async ({ page }) => {
    await startSession(page);
    await installNative(page, { apiVersion: 2 });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-needs-update')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/verziu 1 rozhrania WhatsApp a WAAI verziu 2/)).toBeVisible();
  });

  test('a WAAI without a sign-in secret is called by its name', async ({ page }) => {
    await startSession(page);
    await installNative(page, { exchangeError: { status: 503, code: 'sso_not_configured' } });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-waai-not-ready')).toBeVisible({ timeout: 15_000 });
  });

  test('an unreachable WAAI offers a retry that works once it is back', async ({ page }) => {
    await startSession(page);
    const waai = await installNative(page, { metaError: { status: 502 } });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-unreachable')).toBeVisible({ timeout: 15_000 });

    waai.metaError = null;
    await page.getByRole('button', { name: 'Skúsiť znova' }).click();
    await expect(page.getByTestId('wa-account-pill')).toBeVisible();
    expect(waai.exchanges.length).toBe(2);
  });

  test('a rejected token is renewed once and the call goes through', async ({ page }) => {
    await startSession(page);
    const waai = await installNative(page, { rejectNextUnread: true });
    await page.goto('/#whatsapp');
    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="4"]').first()).toBeVisible({ timeout: 15_000 });
    expect(waai.exchanges.length).toBe(2);
    expect(waai.bearers).toContain('Bearer wam_token-2');
  });

  test('an account that is not linked yet says so', async ({ page }) => {
    await startSession(page);
    await installNative(page, { accounts: [] });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-account-pill')).toHaveText('Nie je prepojený žiadny účet WhatsApp', { timeout: 15_000 });
  });

  test('the standalone address is offered only when there is one', async ({ page }) => {
    await startSession(page);
    await installNative(page, {}, { standalone: 'https://wa.test' });
    await page.goto('/#whatsapp');
    await expect(page.getByRole('link', { name: 'Otvoriť v novej karte' })).toHaveAttribute('href', 'https://wa.test');
  });

  test('without a standalone address there is no such link, and the module still works', async ({ page }) => {
    await startSession(page);
    await installNative(page, {}, { standalone: null });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-account-pill')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Otvoriť v novej karte' })).toHaveCount(0);
  });

  test('before it is connected, an administrator is sent to the settings', async ({ page }) => {
    await startSession(page);
    const waai = await installNative(page, {}, { configured: false });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-not-configured')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Otvoriť nastavenia' })).toHaveAttribute('href', '#settings/integrations/waai');
    expect(waai.exchanges).toHaveLength(0);
  });
});
