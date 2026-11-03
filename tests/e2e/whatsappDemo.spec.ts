import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * The WhatsApp module on a demo instance without WAAI (docs/WHATSAPP-DEMO-MODULE.md C7): a fake WAAI in the
 * browser (`src/components/whatsapp/demo`) answers the module API from `api/waai_demo.php`. Nothing may reach
 * `/waai-api` or a WAAI address; the spec fails if anything does.
 *
 * The fixture runs in Slovak, and the dataset is the real sk file, so chat titles, task numbers and links match
 * what the demo seeder writes.
 */

const DATASET = JSON.parse(readFileSync(new URL('../../public/api/demo_seed/whatsapp_demo.sk.json', import.meta.url), 'utf8'));

const C1 = 'demo-wa-c1-site';
const CLIENT_NAME = 'Horský park Development';

const demoLead = (n: number, name: string, client: boolean) => ({
  id: `demo-clients-${n}`,
  name,
  city: 'Bratislava',
  clientType: 'business',
  status: 'accepted',
  source: 'website',
  owner: 'Erik',
  value: 0,
  adjustment: client ? 1000 : 0,
  createdAt: new Date().toISOString(),
  timeline: [],
});

const demoProject = (n: number, name: string, leadId: string) => ({
  id: `demo-projects-${n}`,
  projectTypeId: 'ptype-roof',
  name,
  leadId,
  clientId: leadId,
  status: 'active',
  managers: ['Erik'],
  data: {},
});

/** The demo records the chats link to: three clients, one plain lead, three projects. */
const DEMO_LEADS = [
  demoLead(1, CLIENT_NAME, true),
  demoLead(2, 'Horváth Residence', true),
  demoLead(6, 'Hotel Aurum', true),
  demoLead(10, 'Müller Architekten', false),
];
const DEMO_PROJECTS = [
  demoProject(1, 'Fasáda Horský park', 'demo-clients-1'),
  demoProject(2, 'Kuchyňa Horváth', 'demo-clients-2'),
  demoProject(3, 'Wellness stena Aurum', 'demo-clients-6'),
];

async function installDemo(page: Page, config: { demoMode: boolean }) {
  const leaks: string[] = [];
  const waaiCalls: string[] = [];
  await startSession(page);

  await page.route('**/sync.php**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const base = buildSyncPayload();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...base,
        demoMode: config.demoMode,
        leads: [...base.leads, ...(config.demoMode ? DEMO_LEADS : [])],
        projects: [...base.projects, ...(config.demoMode ? DEMO_PROJECTS : [])],
      }),
    });
  });
  await page.route('**/api/waai_sso.php', (route) =>
    route.fulfill({
      json: { success: true, configured: false, module: { ui: 'native', transport: 'proxy', base: '/waai-api' }, standalone_url: null, embed_url: null, can_manage: true, user_id: null },
    }),
  );
  await page.route('**/api/waai_demo.php', (route) => {
    waaiCalls.push(route.request().method());
    return route.fulfill({ json: { success: true, edition: 'sk', dataset: DATASET } });
  });
  // Nothing of the demo may leave the browser for WAAI.
  await page.route('**/waai-api/**', (route) => {
    leaks.push(route.request().url());
    return route.fulfill({ status: 500, json: { error: { code: 'server_error', message: 'leak', request_id: 'x' } } });
  });
  return { leaks, waaiCalls };
}

const tab = (page: Page, name: string) => page.getByTestId('wa-tabs').getByRole('tab', { name });
const row = (page: Page, title: string) => page.getByTestId('wa-chat-row').filter({ hasText: title });

/** Opens a chat from the list and switches to the Chat view (a chat opens on the AI view at this width). */
async function openChat(page: Page, title: string) {
  await row(page, title).click();
  const chat = page.getByTestId('wa-conversation');
  await expect(chat).toBeVisible();
  await chat.getByTestId('wa-view-chat').click();
  return chat;
}

async function openDemo(page: Page, hash = '#whatsapp') {
  const demo = await installDemo(page, { demoMode: true });
  await page.goto(`/${hash}`);
  await expect(page.getByTestId('wa-account-pill')).toHaveText('Ukážkové dáta', { timeout: 20_000 });
  return demo;
}

test.describe('WhatsApp module in demo mode, without WAAI', () => {
  test('the chat list: four chats, unread badges on two, the summary cards, the demo pill and subtitle', async ({ page }) => {
    const { leaks, waaiCalls } = await openDemo(page);

    await expect(page.getByTestId('wa-chat-row')).toHaveCount(4);
    await expect(page.getByText('Ukážkové konverzácie. Nič sa neodosiela do WhatsAppu.').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Otvoriť v novej karte' })).toHaveCount(0);

    // Two chats have two unread messages each.
    await expect(page.getByTestId('wa-chat-row').locator('[aria-label="2 neprečítané správy"]')).toHaveCount(2);
    await expect(row(page, 'Horský park').locator('[aria-label="2 neprečítané správy"]')).toHaveCount(1);
    await expect(row(page, 'Hotel Aurum').locator('[aria-label="2 neprečítané správy"]')).toHaveCount(1);
    await expect(row(page, 'Andrea Horváthová').locator('[aria-label*="neprečítan"]')).toHaveCount(0);
    // The sidebar badge counts chats, not messages.
    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="2"]').first()).toBeVisible();

    // The summary cards of docs/WHATSAPP-DEMO-MODULE.md C4: 4 / 2 / 3 / 1 open bullets.
    const bullets = async (title: string) => row(page, title).getByTestId('wa-row-summary-bullet').count();
    await expect.poll(() => bullets('Horský park')).toBe(4);
    expect(await bullets('Thomas Müller')).toBe(2);
    expect(await bullets('Hotel Aurum')).toBe(3);
    expect(await bullets('Andrea Horváthová')).toBe(1);

    // StrictMode runs the session effect twice in the dev server, so one or two reads; never a write.
    expect(waaiCalls.length).toBeGreaterThan(0);
    expect(waaiCalls.every((m) => m === 'GET')).toBe(true);
    expect(leaks, 'a request left the browser for WAAI').toEqual([]);
  });

  test('an open chat: messages, a document, an image, a quoted reply, and the CRM link chip', async ({ page }) => {
    const { leaks } = await openDemo(page);
    const chat = await openChat(page, 'Horský park');
    await expect(chat.getByTestId('wa-message')).toHaveCount(13);
    await expect(chat.getByText('Harmonogram montáže – Horský park.pdf').first()).toBeVisible();
    await expect(chat.locator('img[src*="svg"]').first()).toBeVisible();
    // m09 quotes m08: the quote is a button inside the bubble.
    await expect(chat.locator('button.border-l-4').first()).toBeVisible();
    // The chip names the first linked record, through the CRM's own leads and projects.
    await expect(chat.getByRole('button', { name: new RegExp(`${CLIENT_NAME}`) })).toBeVisible();
    // Opening the chat read it; the sidebar badge follows on its ten-second poll.
    await expect(page.locator('nav button[data-dock-id="whatsapp"] span[aria-label="1"]').first()).toBeVisible({ timeout: 20_000 });

    expect(leaks).toEqual([]);
  });

  test('send a message and react: both stay, in memory only', async ({ page }) => {
    const { leaks } = await openDemo(page);
    const chat = await openChat(page, 'Horský park');
    await expect(chat.getByTestId('wa-message')).toHaveCount(13);

    await chat.getByPlaceholder('Napíšte správu…').fill('Test');
    await chat.getByRole('button', { name: 'Odoslať' }).click();
    await expect(chat.getByTestId('wa-message')).toHaveCount(14);
    const last = chat.getByTestId('wa-message').last();
    await expect(last).toContainText('Test');
    await expect(last).toHaveClass(/justify-end/);

    // React 👍 to the first message.
    const first = chat.getByTestId('wa-message').first();
    await first.getByRole('button', { name: 'Možnosti správy' }).click({ force: true });
    await page.getByTestId('wa-reaction-bar').getByRole('button', { name: '👍' }).click();
    await expect(first.getByRole('button', { name: '👍' })).toBeVisible();

    expect(leaks).toEqual([]);
  });

  test('a deep link opens the chat and highlights that message', async ({ page }) => {
    const { leaks } = await openDemo(page, `#whatsapp/c/${C1}?m=${C1}-m11`);
    const target = page.locator(`#wa-msg-${C1}-m11`);
    await expect(target).toBeVisible({ timeout: 15_000 });
    await expect(target.locator('.ring-green-500')).toBeVisible();
    expect(leaks).toEqual([]);
  });

  test('Digest: one bullet per chat and the open tasks; no error card, listening is refused calmly', async ({ page }) => {
    const { leaks } = await openDemo(page, '#whatsapp/digest');
    await expect(tab(page, 'Súhrn')).toHaveAttribute('aria-selected', 'true');
    const digest = page.getByTestId('wa-digest');
    await expect(digest.locator('div.space-y-2 > ul > li')).toHaveCount(4, { timeout: 15_000 });
    await expect(digest).toContainText('Marek Šimko');
    // Open tasks are listed under the summary (five of the nine are open).
    await expect(digest.getByRole('link', { name: /Marek Šimko – Horský park|Thomas Müller|Hotel Aurum|Andrea Horváthová/ }).first()).toBeVisible();

    await digest.getByRole('button', { name: /Prehrať/ }).click();
    await expect(digest).not.toContainText(/not_implemented|\[object|undefined|Error:/);
    await expect(digest.getByTestId('wa-digest-regenerate')).toBeEnabled();
    expect(leaks).toEqual([]);
  });

  test('Tasks: nine tasks across the four chats, ticking an open one moves it to Done', async ({ page }) => {
    const { leaks } = await openDemo(page, '#whatsapp/tasks');
    await expect(tab(page, 'Úlohy')).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Všetky', exact: true }).click();
    const items = page.locator('main ul.divide-y > li');
    await expect(items).toHaveCount(9, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Otvorené', exact: true }).click();
    const open = await items.count();
    expect(open).toBeGreaterThan(0);
    await items.first().getByRole('checkbox').click();
    await expect(items).toHaveCount(open - 1);
    // A done task stays linked to the CRM: it cannot be reopened.
    await page.getByRole('button', { name: 'Hotové', exact: true }).click();
    await expect(items.first().getByRole('checkbox')).toBeDisabled();
    expect(leaks).toEqual([]);
  });

  test('Ask: a word from the chats returns citations that open the message; an unknown word says so', async ({ page }) => {
    const { leaks } = await openDemo(page, '#whatsapp/search');
    await expect(tab(page, 'Opýtať sa')).toHaveAttribute('aria-selected', 'true');
    const box = page.getByPlaceholder('Opýtajte sa na svoje chaty');
    await box.fill('dosky');
    await box.press('Enter');
    await expect(page.getByText('V ukážke Opýtať sa prehľadáva ukážkové konverzácie.')).toBeVisible({ timeout: 15_000 });
    const citation = page.locator('a[href^="#whatsapp/c/demo-wa-"][href*="?m=demo-wa-"]');
    expect(await citation.count()).toBeGreaterThan(0);
    await citation.first().click();
    await expect(tab(page, 'Chaty')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('wa-conversation')).toBeVisible();

    await page.goto('/#whatsapp/search');
    const again = page.getByPlaceholder('Opýtajte sa na svoje chaty');
    await again.fill('zzzzqqqq');
    await again.press('Enter');
    await expect(page.getByText('V ukážkových konverzáciách sa nič nenašlo.')).toBeVisible({ timeout: 15_000 });
    expect(leaks).toEqual([]);
  });

  test('Settings: opens without an error card, the demo account is listed and a change is refused with a calm note', async ({ page }) => {
    const { leaks } = await openDemo(page, '#whatsapp/settings');
    await expect(tab(page, 'Nastavenia')).toHaveAttribute('aria-selected', 'true');
    const settings = page.getByTestId('wa-settings');
    await expect(settings).toBeVisible();
    // A member has no AI or CRM section.
    await expect(page.getByTestId('wa-settings-ai')).toHaveCount(0);
    await expect(page.getByTestId('wa-settings-crm')).toHaveCount(0);

    await page.getByTestId('wa-settings-whatsapp').click();
    await expect(settings).toContainText('Andrej Kollár');
    await expect(settings).toContainText('connected');
    await page.getByRole('button', { name: 'Prepojiť účet WhatsApp' }).click();
    await expect(settings.getByText('V ukážke nie je dostupné.')).toBeVisible();
    await expect(settings).not.toContainText(/not_implemented/);

    await page.getByTestId('wa-settings-system').click();
    const toggle = settings.getByRole('checkbox');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    expect(leaks).toEqual([]);
  });

  test('a real instance is untouched: no demo mode and no connection still says "not configured", and asks for no demo data', async ({ page }) => {
    const { leaks, waaiCalls } = await installDemo(page, { demoMode: false });
    await page.goto('/#whatsapp');
    await expect(page.getByTestId('wa-not-configured')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('wa-chat-row')).toHaveCount(0);
    expect(waaiCalls).toEqual([]);
    expect(leaks).toEqual([]);
  });
});
