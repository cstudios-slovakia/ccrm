import { expect, test, type Page } from '@playwright/test';
import { startSession } from './helpers/appDriver';
import { TEST_USER } from './helpers/fixture';

/**
 * The native WhatsApp module (docs/WAAI-NATIVE-MODULE.md): ordinary CRM screens on WAAI's module API.
 * WAAI is a stand-in: `page.route` answers `/waai-api/*` like the real `/api/ccrm/v1/*` (token exchange,
 * `/meta`, `/unread`, `/conversations`, `/digest`, `/tasks`, `/search`, `/preferences`, `/wa-accounts`,
 * `/admin/*`, and the error envelope) and records what it was asked.
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

async function installNative(
  page: Page,
  over: Partial<Waai> = {},
  config: { configured?: boolean; canManage?: boolean; standalone?: string | null } = {},
) {
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
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/waai-api/, '');
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
          features: ['session', 'meta', 'unread', 'media', 'chats', 'chat_write', 'chat_ai', 'home', 'settings'],
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
    if (path === '/wa/health') {
      return route.fulfill({
        json: { ok: true, worker_offline: false, disconnected: [], connecting: [] },
      });
    }
    if (path === '/conversations' && method === 'GET') {
      return route.fulfill({
        json: {
          conversations: [
            {
              id: 'abc123',
              title: 'Acme Stavba',
              is_group: false,
              owner_email: 'peter@example.sk',
              avatar_url: null,
              unread_count: 1,
              last_message_at: '2026-04-20T09:15:00.000Z',
              last_message: {
                kind: 'text',
                body: 'Pošlite prosím cenovú ponuku.',
                sender: 'Acme Stavba',
                direction: 'in',
              },
            },
          ],
          summaries: {},
          completed_task_ids: [],
          ai_configured: true,
          has_wa_account: waai.accounts.length > 0,
          user_name: 'Peter',
          user_avatar_url: null,
        },
      });
    }
    if (path === '/conversations/abc123' && method === 'GET') {
      return route.fulfill({
        json: {
          id: 'abc123',
          title: 'Acme Stavba',
          is_group: false,
          avatar_url: null,
          last_message_at: '2026-04-20T09:15:00.000Z',
          detected_locale: 'sk',
          sender_name: 'Peter',
          is_self_chat: false,
          unread_count: 0,
          quick_reactions: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
          crm_links: { supported: true, links: [], ambiguous: null },
        },
      });
    }
    if (path === '/conversations/abc123/messages' && method === 'GET') {
      return route.fulfill({
        json: {
          messages: [
            {
              id: 'm1',
              conversation_id: 'abc123',
              kind: 'text',
              direction: 'in',
              sender: 'Acme Stavba',
              sender_avatar_url: null,
              body: 'Pošlite prosím cenovú ponuku.',
              translation_note: null,
              media: null,
              transcription: null,
              transcription_status: null,
              sent_at: '2026-04-20T09:15:00.000Z',
              edited_at: null,
              quoted: null,
              task_update_id: null,
              reactions: [],
            },
          ],
          next_cursor: null,
          server_time: '2026-04-20T09:16:00.000Z',
        },
      });
    }
    if (path === '/conversations/abc123/mark-read' && method === 'POST') {
      return route.fulfill({ json: { unread_count: 0 } });
    }
    if (path === '/messages/search' && method === 'GET') {
      return route.fulfill({
        json: {
          hits: [
            {
              message_id: 'm1',
              conversation_id: 'abc123',
              conversation_title: 'Acme Stavba',
              avatar_url: null,
              is_group: false,
              kind: 'text',
              direction: 'in',
              sender: 'Acme Stavba',
              snippet: 'Pošlite prosím cenovú ponuku.',
              sent_at: '2026-04-20T09:15:00.000Z',
            },
          ],
          next_cursor: null,
        },
      });
    }
    if (path === '/digest') {
      return route.fulfill({
        json: {
          id: 'dig1',
          window: (url.searchParams.get('window') ?? 'today') as 'today',
          cached: true,
          chat_count: 1,
          narrative: 'Prehľad dnešných správ pre **Acme Stavba**.',
          tasks: [],
          meetings: [],
          has_audio: false,
          audio_url: null,
          auto_audio: false,
          created_at: '2026-04-20T09:20:00.000Z',
        },
      });
    }
    if (path === '/tasks' && method === 'GET') {
      return route.fulfill({
        json: {
          tasks: [
            {
              id: 't1',
              title: 'Pripraviť cenovú ponuku pre Acme',
              description: 'Do piatku',
              assignee: 'Peter',
              assignee_contact_id: null,
              start_at: null,
              due_at: '2026-04-24T12:00:00.000Z',
              status: 'open',
              completed_at: null,
              notified_at: null,
              created_at: '2026-04-20T09:15:00.000Z',
              conversation_id: 'abc123',
              conversation_title: 'Acme Stavba',
              source_message_id: 'm1',
              is_group: false,
              origin: 'waai',
              crm_sync_state: 'none',
              crm_state: null,
              crm_error: null,
              crm_url: null,
              crm_task_id: null,
              crm_linked: false,
              attachments: [],
            },
          ],
          crm_push_enabled: true,
        },
      });
    }
    if (path === '/search') {
      return route.fulfill({
        json: {
          answer: 'Zákazník žiada cenovú ponuku [1].',
          sources: [
            {
              index: 1,
              message_id: 'm1',
              conversation_id: 'abc123',
              conversation_title: 'Acme Stavba',
              is_group: false,
              sender: 'Acme Stavba',
              snippet: 'Pošlite prosím cenovú ponuku.',
              sent_at: '2026-04-20T09:15:00.000Z',
            },
          ],
        },
      });
    }
    if (path === '/preferences' && method === 'GET') {
      return route.fulfill({
        json: {
          auto_detect_summary_lang: true,
          quick_reactions: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
          quick_reaction_count: 6,
        },
      });
    }
    if (path === '/wa-accounts' && method === 'GET') {
      return route.fulfill({
        json: {
          accounts: waai.accounts.map((a) => ({
            ...a,
            phone_number: '+421905123456',
            last_error: null,
            owner_email: 'peter@example.sk',
            owner_user_id: null,
          })),
        },
      });
    }
    if (path === '/admin/ai' && method === 'GET') {
      return route.fulfill({
        json: {
          provider: 'openai',
          openai_key_set: true,
          anthropic_key_set: false,
          prompts: {
            general: '',
            general_file_name: null,
            summary: '',
            summary_file_name: null,
            task: '',
            task_file_name: null,
          },
          models: { text: 'gpt-4o-mini', embed: 'text-embedding-3-small', transcribe: 'whisper-1' },
          cost_limit_usd: 25,
          speech: { model: 'tts-1', speed: 1 },
          digest_audio_auto: false,
        },
      });
    }
    if (path === '/admin/crm' && method === 'GET') {
      return route.fulfill({
        json: {
          push_enabled: true,
          pull_enabled: true,
          paused_reason: null,
          default_country: 'SK',
          last_ping: { ok: true, at: '2026-04-20T09:00:00.000Z' },
          accounts: [],
          contacts: [],
          linked_chats: [],
          task_errors: [],
        },
      });
    }
    if (path === '/admin/people' && method === 'GET') {
      return route.fulfill({ json: { crm_users: [], waai_users: [] } });
    }
    if (path === '/admin/members' && method === 'GET') {
      return route.fulfill({ json: { members: [] } });
    }
    if (path === '/admin/wa-invites' && method === 'GET') {
      return route.fulfill({ json: { invites: [] } });
    }
    if (path === '/admin/wa-accounts' && method === 'GET') {
      return route.fulfill({ json: { accounts: [] } });
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
    await expect(page.getByTestId('wa-chat-row').first()).toContainText('Acme Stavba');

    expect(waai.exchanges).toEqual([{ token: SSO_TOKEN }]);
    expect(waai.bearers.length).toBeGreaterThan(0);
    expect(waai.bearers.every((b) => b === 'Bearer wam_token-1')).toBe(true);
    // The unread count of chats (not messages) is the sidebar badge.
    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="4"]').first()).toBeVisible();
    // No frame, no second application.
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('the tabs follow the address, clicking one moves it, and a deep link opens the chat and message', async ({ page }) => {
    await startSession(page);
    await installNative(page);
    await page.goto('/#whatsapp/digest');
    await expect(tab(page, 'Súhrn')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
    await expect(page.getByText(/Prehľad dnešných správ/)).toBeVisible();

    await tab(page, 'Úlohy').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#whatsapp/tasks');
    await expect(tab(page, 'Úlohy')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Pripraviť cenovú ponuku pre Acme')).toBeVisible();

    await tab(page, 'Opýtať sa').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#whatsapp/search');
    await expect(tab(page, 'Opýtať sa')).toHaveAttribute('aria-selected', 'true');

    await tab(page, 'Nastavenia').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#whatsapp/settings');
    await expect(tab(page, 'Nastavenia')).toHaveAttribute('aria-selected', 'true');
    // WAAI's own settings: a menu of five sections beside the open one, which starts on System.
    await expect(page.getByTestId('wa-settings-system')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('wa-settings-whatsapp').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#whatsapp/settings/whatsapp');
    await expect(page.getByRole('button', { name: 'Prepojiť účet WhatsApp' })).toBeVisible();

    // A task footer's deep link opens the chat tab and renders the target message.
    await page.evaluate(() => { window.location.hash = '#whatsapp/c/abc123?m=m1'; });
    await expect(tab(page, 'Chaty')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('wa-conversation')).toBeVisible();
    await expect(page.locator('#wa-msg-m1')).toContainText('Pošlite prosím cenovú ponuku.');
  });

  test('the digest writes itself when it is opened, as in WAAI, and the refresh button writes it again', async ({ page }) => {
    await startSession(page);
    await installNative(page);
    const asked: { window: string; regenerate: boolean }[] = [];
    await page.route('**/waai-api/digest', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      asked.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          id: 'dig2',
          window: 'd30',
          cached: false,
          chat_count: 1,
          narrative: `Nový súhrn číslo ${asked.length} pre **Acme Stavba**.`,
          tasks: [],
          meetings: [],
          has_audio: false,
          audio_url: null,
          auto_audio: false,
          created_at: '2026-10-30T09:20:00.000Z',
        },
      });
    });
    await page.goto('/#whatsapp/digest');
    // Nobody pressed anything: opening the tab asked for the digest, and let WAAI write it.
    await expect(page.getByText(/Nový súhrn číslo 1/)).toBeVisible({ timeout: 15_000 });
    expect(asked[0]).toMatchObject({ regenerate: false });

    await page.getByTestId('wa-digest-regenerate').click();
    await expect(page.getByText(/Nový súhrn číslo 2/)).toBeVisible();
    expect(asked[1]).toMatchObject({ regenerate: true });
  });

  test('a chat has WAAI\'s views: AI view and Chat, and Combined where both fit', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await startSession(page);
    await installNative(page);
    await page.goto('/#whatsapp/c/abc123');
    await expect(page.getByTestId('wa-conversation')).toBeVisible({ timeout: 15_000 });

    // Wide enough: both halves at once.
    await expect(page.getByTestId('wa-view-combined')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('wa-ai-view')).toBeVisible();
    await expect(page.locator('#wa-msg-m1')).toBeVisible();

    await page.getByTestId('wa-view-chat').click();
    await expect(page.locator('#wa-msg-m1')).toBeVisible();
    await expect(page.getByTestId('wa-ai-view')).toBeHidden();

    await page.getByTestId('wa-view-ai').click();
    await expect(page.getByTestId('wa-ai-view')).toBeVisible();
    await expect(page.locator('#wa-msg-m1')).toBeHidden();

    // Too narrow for two halves: Combined is not offered and the AI view opens.
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(page.getByTestId('wa-view-combined')).toHaveCount(0);
    await expect(page.getByTestId('wa-view-ai')).toBeVisible();
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
