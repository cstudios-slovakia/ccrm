import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { holdToConfirm } from './helpers/hold';

/**
 * Settings → AI Assistant (MCP): the guided "connect an AI app" flow.
 *
 * `/api/mcp_keys.php` is mocked with a small in-memory key store that behaves like
 * the real endpoint: one active key per user, the full key is returned only by the
 * POST that creates it, and generating a new one replaces the old one.
 */

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const FULL_KEY = 'ccrm_mcp_0123456789abcdef0123456789abcdef';
const PREFIX = 'ccrm_mcp_0123';
const ROTATED_KEY = 'ccrm_mcp_fedcba9876543210fedcba9876543210';

const COPY_BUTTON = /^(Copy|Kopírovať|Másolás):/;
const COPIED = /Copied!|Skopírované!|Másolva!/;

interface KeyStore {
  hasKey: boolean;
  nextToken: string;
  posts: number;
  deletes: number;
}

async function mockKeys(page: Page, initial: { hasKey: boolean }): Promise<KeyStore> {
  const store: KeyStore = { hasKey: initial.hasKey, nextToken: FULL_KEY, posts: 0, deletes: 0 };
  await page.route('**/api/mcp_keys.php', (route) => {
    const method = route.request().method();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'POST') {
      store.posts++;
      store.hasKey = true;
      return json({
        success: true,
        token: store.nextToken,
        prefix: store.nextToken.slice(0, 13),
        name: "Erik's MCP Key",
        created_at: '2026-10-20 09:30:00',
      });
    }
    if (method === 'DELETE') {
      store.deletes++;
      store.hasKey = false;
      return json({ success: true });
    }
    return json({
      success: true,
      has_key: store.hasKey,
      key: store.hasKey
        ? { id: 1, prefix: PREFIX, name: "Erik's MCP Key", created_at: '2026-10-19 08:00:00', last_used_at: null }
        : undefined,
    });
  });
  return store;
}

async function openMcp(page: Page) {
  await gotoView(page, '#personal-settings/mcp');
  await expect(page.getByTestId('mcp-step-key')).toBeVisible();
}

const copyButton = (scope: Locator) => scope.getByRole('button', { name: COPY_BUTTON });
const field = (page: Page, id: string) => page.getByTestId(id);
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

async function copyField(page: Page, id: string): Promise<string> {
  await copyButton(field(page, id)).click();
  // Said twice: on the button and again in a screen-reader live region. The button's is the one seen.
  await expect(field(page, id).getByText(COPIED).first()).toBeVisible();
  return clipboard(page);
}

const tabs = (page: Page) => page.getByRole('tab');

async function generate(page: Page) {
  await page.getByRole('button', { name: /Generate key|Vygenerovať kľúč|Kulcs létrehozása/ }).click();
  await expect(field(page, 'mcp-full-key')).toBeVisible();
}

test.describe('AI Assistant (MCP) settings', () => {
  test('no key → generate → the full key is shown once, with a warning, and can be copied', async ({ page }) => {
    await startSession(page);
    const store = await mockKeys(page, { hasKey: false });
    await openMcp(page);

    await generate(page);
    expect(store.posts).toBe(1);
    await expect(field(page, 'mcp-full-key')).toContainText(FULL_KEY);
    await expect(page.getByRole('alert')).toContainText(/only once|iba raz|csak egyszer/);
    expect(await copyField(page, 'mcp-full-key')).toBe(FULL_KEY);

    // Hide masks the shown value but the Copy button still carries the real key.
    await page.getByRole('button', { name: /Hide key|Skryť kľúč|Kulcs elrejtése/ }).click();
    await expect(field(page, 'mcp-full-key')).not.toContainText(FULL_KEY);
    expect(await copyField(page, 'mcp-full-key')).toBe(FULL_KEY);
  });

  test('after a reload only the prefix is left, and the key-bound Copy buttons are disabled', async ({ page }) => {
    await startSession(page);
    await mockKeys(page, { hasKey: true });
    await openMcp(page);

    const saved = page.getByTestId('mcp-key-saved');
    await expect(saved).toContainText(PREFIX);
    await expect(saved).toContainText(/Never|Nikdy|Soha/);
    await expect(saved).not.toContainText(/encrypt|šifrov|titkosít/i);
    await expect(saved).toContainText(/one-way hash|jednosmerný hash|Egyirányú hash/);
    await expect(field(page, 'mcp-full-key')).toHaveCount(0);

    // Web tab: URL and header name stay copyable, the header value (the key) does not.
    await expect(copyButton(field(page, 'mcp-field-url'))).toBeEnabled();
    await expect(copyButton(field(page, 'mcp-field-header-name'))).toBeEnabled();
    await expect(copyButton(field(page, 'mcp-field-header-value'))).toBeDisabled();
    await expect(field(page, 'mcp-field-header-value')).toContainText('<your key>');
    await expect(field(page, 'mcp-field-header-value')).toContainText(
      /Generate a new key to copy it here|Vygenerujte nový kľúč|Hozzon létre új kulcsot/,
    );
  });

  test('each tab shows its fields and Copy puts the expected text on the clipboard', async ({ page }) => {
    await startSession(page);
    await mockKeys(page, { hasKey: false });
    await openMcp(page);
    await generate(page);
    const origin = new URL(page.url()).origin;
    const url = `${origin}/api/mcp.php`;

    // 1. Web app / connector (the default)
    await expect(tabs(page)).toHaveCount(4);
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true');
    expect(await copyField(page, 'mcp-field-url')).toBe(url);
    expect(await copyField(page, 'mcp-field-header-name')).toBe('X-API-Key');
    expect(await copyField(page, 'mcp-field-header-value')).toBe(FULL_KEY);

    // The Bearer variant sits in a collapsed disclosure.
    await page.getByText(/only accepts a Bearer token|iba Bearer token|csak Bearer tokent/).click();
    expect(await copyField(page, 'mcp-field-bearer-name')).toBe('Authorization');
    expect(await copyField(page, 'mcp-field-bearer-value')).toBe(`Bearer ${FULL_KEY}`);

    // 2. Code editors & config files
    await tabs(page).nth(1).click();
    const editor = JSON.parse(await copyField(page, 'mcp-field-editor'));
    expect(editor).toEqual({ mcpServers: { ccrm: { url, headers: { 'X-API-Key': FULL_KEY } } } });

    // 3. Command line
    await tabs(page).nth(2).click();
    expect(await copyField(page, 'mcp-field-cli')).toBe(
      `claude mcp add --transport http ccrm ${url} --header "X-API-Key: ${FULL_KEY}"`,
    );

    // 4. Local bridge
    await tabs(page).nth(3).click();
    const bridge = JSON.parse(await copyField(page, 'mcp-field-bridge'));
    expect(bridge.mcpServers.ccrm).toEqual({
      command: 'node',
      args: ['/path/to/ccrm-app/mcp-server/dist/index.js'],
      env: { CCRM_API_URL: `${origin}/api`, CCRM_MCP_KEY: FULL_KEY },
    });

    // The optional prompt carries the user, and never invents a role.
    const prompt = await copyField(page, 'mcp-field-prompt');
    expect(prompt).toContain('erik@crm.com');
    expect(prompt).not.toMatch(/Role: undefined|Role: Admin\)/);
  });

  test('without the full key, snippets stay copyable but carry a visible placeholder and a warning', async ({ page }) => {
    await startSession(page);
    await mockKeys(page, { hasKey: true });
    await openMcp(page);

    await tabs(page).nth(1).click();
    const snippet = field(page, 'mcp-field-editor');
    await expect(snippet).toContainText('<your key>');
    await expect(snippet).toContainText(/Replace|Nahraďte|Cserélje le/);
    await expect(copyButton(snippet)).toBeEnabled();
    expect(await copyField(page, 'mcp-field-editor')).toContain('"X-API-Key": "<your key>"');

    await tabs(page).nth(2).click();
    expect(await copyField(page, 'mcp-field-cli')).toContain('--header "X-API-Key: <your key>"');
  });

  test('no screen advertises the legacy header or a query token', async ({ page }) => {
    await startSession(page);
    await mockKeys(page, { hasKey: false });
    await openMcp(page);
    await generate(page);

    const section = page.getByTestId('mcp-step-connect');
    for (let i = 0; i < 4; i++) {
      await tabs(page).nth(i).click();
      for (const text of [await section.innerText(), await clipboardOfAllFields(page)]) {
        expect(text).not.toMatch(/x-ccrm-mcp-key/i);
        expect(text).not.toContain('token=');
      }
    }
  });

  test('a refused clipboard shows no "Copied!" and says so', async ({ page }) => {
    await startSession(page);
    await mockKeys(page, { hasKey: false });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    });
    await openMcp(page);

    await copyButton(field(page, 'mcp-field-url')).click();
    await expect(page.getByText(/Could not copy|Kopírovanie sa nepodarilo|A másolás nem sikerült/)).toBeVisible();
    await expect(field(page, 'mcp-field-url').getByText(COPIED)).toHaveCount(0);
  });

  test('regenerating asks first, and the old key is replaced', async ({ page }) => {
    await startSession(page);
    const store = await mockKeys(page, { hasKey: true });
    await openMcp(page);

    const regenerate = page.getByRole('button', { name: /Regenerate key|Pregenerovať kľúč|Kulcs újragenerálása/ });
    await regenerate.click();
    await page.getByTestId('confirm-dialog-cancel').click();
    expect(store.posts).toBe(0);

    store.nextToken = ROTATED_KEY;
    await regenerate.click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(field(page, 'mcp-full-key')).toContainText(ROTATED_KEY);
    expect(store.posts).toBe(1);
  });

  test('revoking needs a hold, then the key is gone', async ({ page }) => {
    await startSession(page);
    const store = await mockKeys(page, { hasKey: true });
    await openMcp(page);

    const revoke = page.getByRole('button', { name: /Revoke access key|Odvolať prístupový kľúč|Hozzáférési kulcs visszavonása/ });
    await revoke.click(); // a plain click does nothing
    await holdToConfirm(revoke, 150);
    expect(store.deletes).toBe(0);

    await holdToConfirm(revoke);
    await expect(page.getByRole('button', { name: /Generate key|Vygenerovať kľúč|Kulcs létrehozása/ })).toBeVisible();
    expect(store.deletes).toBe(1);
  });

  test('the chosen tab is remembered after a reload', async ({ page }) => {
    await startSession(page);
    await mockKeys(page, { hasKey: false });
    await openMcp(page);

    await tabs(page).nth(2).click();
    await expect(field(page, 'mcp-field-cli')).toBeVisible();
    await openMcp(page);
    await expect(tabs(page).nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(field(page, 'mcp-field-cli')).toBeVisible();
  });

  test('tabs work from the keyboard', async ({ page }) => {
    await startSession(page);
    await mockKeys(page, { hasKey: false });
    await openMcp(page);

    await tabs(page).nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs(page).nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(tabs(page).nth(3)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  });

  for (const width of [390, 1440]) {
    test(`no horizontal overflow at ${width}px, with a key shown and on every tab`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await startSession(page);
      await mockKeys(page, { hasKey: false });
      await openMcp(page);
      await generate(page);

      for (let i = 0; i < 4; i++) {
        await tabs(page).nth(i).click();
        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          const main = document.querySelector('main');
          const wide = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="mcp-"]'))
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .map((el) => el.dataset.testid);
          return {
            page: root.scrollWidth - root.clientWidth,
            main: main ? main.scrollWidth - main.clientWidth : 0,
            wide,
          };
        });
        expect(overflow.page, `page scroll on tab ${i}`).toBeLessThanOrEqual(0);
        expect(overflow.main, `main scroll on tab ${i}`).toBeLessThanOrEqual(0);
        expect(overflow.wide, `fields past the viewport on tab ${i}`).toEqual([]);
      }
    });
  }
});

/** Every value Copy would put on the clipboard, joined, for the tab that is showing. */
async function clipboardOfAllFields(page: Page): Promise<string> {
  const ids = await page
    .locator('[data-testid^="mcp-field-"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.testid ?? ''));
  const values: string[] = [];
  for (const id of ids) {
    const button = copyButton(field(page, id));
    if (!(await button.isVisible()) || (await button.isDisabled())) continue;
    await button.click();
    values.push(await clipboard(page));
  }
  return values.join('\n');
}
