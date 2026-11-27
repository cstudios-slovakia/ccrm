import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Microsoft 365 (Exchange Online) mailboxes: connected by signing in with Microsoft, never
 * with a password.
 *
 * What a user has to be able to do, and the crawler cannot judge: pick Microsoft 365, see no
 * server or password field, sign in in a small window, and end up with a connected mailbox
 * that names the account; and an admin does the same for a company mailbox after saving it.
 *
 * The server side (tokens, the Graph calls, filing, the OAuth state checks) is pinned by
 * `npm run test:graph-mail` and `npm run test:graph-oauth`; here the endpoints are mocked and
 * Microsoft's sign-in page is a stand-in that reports back the way api/graph_oauth.php's last
 * page does. The fixture runs in Slovak, as the admin Erik (erik@crm.com).
 */

interface OauthMock {
  configured: boolean;
  /** What the stand-in sign-in page reports. */
  outcome: { ok: boolean; account?: string; error?: string };
  connected: boolean;
  account: string;
  started: Record<string, unknown>[];
  disconnected: Record<string, unknown>[];
}

/** Mocks api/graph_oauth.php and the page Microsoft would show. */
async function mockOauth(page: Page, initial: Partial<OauthMock> = {}): Promise<OauthMock> {
  const state: OauthMock = { configured: true, outcome: { ok: true, account: 'erik@laminam.sk' }, connected: false, account: '', started: [], disconnected: [], ...initial };
  // The sign-in window lives in the same browser context, so the route is set there.
  await page.context().route('**/__microsoft-signin**', (route) => {
    if (state.outcome.ok) {
      state.connected = true;
      state.account = state.outcome.account ?? '';
    }
    return route.fulfill({
      status: 200, contentType: 'text/html',
      body: `<!doctype html><title>sign-in</title><script>
        window.opener.postMessage(${JSON.stringify({ type: 'ccrm-graph-oauth', ...state.outcome })}, window.location.origin);
        window.close();
      </script>`,
    });
  });
  // On the page, not the context: the suite's catch-all API mock is a page route and would win.
  await page.route('**/api/graph_oauth.php**', async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action') ?? '';
    const json = (body: object, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (action === 'status') {
      return json({ success: true, configured: state.configured, connected: state.connected, account: state.account, needsReconnect: false });
    }
    if (action === 'app') {
      return json({ success: true, clientId: '', tenantId: '', clientSecret: '', configured: state.configured, source: state.configured ? 'own' : null, redirectUri: 'https://crm.example.sk/api/graph_oauth.php' });
    }
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    if (action === 'start') {
      state.started.push(body);
      return json({ success: true, url: `${url.origin}/__microsoft-signin`, connected: state.connected });
    }
    if (action === 'disconnect') {
      state.disconnected.push(body);
      state.connected = false;
      state.account = '';
      return json({ success: true });
    }
    if (action === 'save_app') {
      state.configured = true;
      return json({ success: true, configured: true });
    }
    return json({ success: false, error: 'unknown' }, 400);
  });
  return state;
}

/**
 * Personal settings → E-mail with the form open on Microsoft 365. The fixture user already has
 * a (password) mailbox, so that one is reset first; resetting it asks the server for nothing.
 */
async function chooseMicrosoft(page: Page) {
  await gotoView(page, '#personal-settings/email');
  await page.getByRole('button', { name: 'Resetovať nastavenia' }).click();
  await page.getByRole('button', { name: 'IMAP / SMTP server' }).first().click();
  await page.getByRole('option', { name: 'Microsoft 365 / Exchange Online' }).click();
  await expect(page.getByTestId('microsoft-mailbox-panel')).toBeVisible();
}

test.describe('Microsoft 365 mailboxes', () => {
  test('a user connects their own mailbox by signing in, without a server or a password', async ({ page }) => {
    await startSession(page);
    const oauth = await mockOauth(page);
    // choose Microsoft 365: the IMAP / SMTP fields and the save button give way to one button
    await chooseMicrosoft(page);
    const panel = page.getByTestId('microsoft-mailbox-panel');
    await expect(page.getByPlaceholder('imap.domain.sk')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Uložiť integráciu' })).toBeHidden();

    await panel.getByTestId('microsoft-sign-in').click();
    await expect(page.getByTestId('microsoft-mailbox-account')).toContainText('erik@laminam.sk', { timeout: 15_000 });
    expect(oauth.started).toEqual([{ target: 'user' }]);
    expect(oauth.disconnected).toEqual([]);
    await expect(page.getByTestId('microsoft-reconnect')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/microsoft-mail-connected.png', fullPage: false });

    // resetting forgets the sign-in on the server and goes back to the button
    await page.getByRole('button', { name: 'Resetovať nastavenia' }).click();
    await expect(page.getByTestId('microsoft-mailbox-panel')).toBeVisible();
    await expect.poll(() => oauth.disconnected, { timeout: 10_000 }).toEqual([{ target: 'user' }]);
  });

  test('a sign-in Microsoft refuses says why, and nothing is connected', async ({ page }) => {
    await startSession(page);
    await mockOauth(page, { outcome: { ok: false, error: 'Your Microsoft 365 administrator has to approve this application for your organisation first.' } });
    await chooseMicrosoft(page);
    await page.getByTestId('microsoft-sign-in').click();
    await expect(page.getByTestId('microsoft-sign-in-error')).toContainText('administrator has to approve', { timeout: 15_000 });
    await expect(page.getByTestId('microsoft-mailbox-account')).toHaveCount(0);
  });

  test('without the app registration the button is off and says what is missing', async ({ page }) => {
    await startSession(page);
    await mockOauth(page, { configured: false });
    await chooseMicrosoft(page);
    await expect(page.getByTestId('microsoft-mail-connect')).toContainText('ešte nie je nastavené');
    await expect(page.getByTestId('microsoft-sign-in')).toBeDisabled();
  });

  test('an admin saves a company mailbox with its address only and then signs it in', async ({ page }) => {
    await startSession(page);
    const oauth = await mockOauth(page, { outcome: { ok: true, account: 'info@laminam.sk' } });
    const box = () => ({
      id: 'cmb-m365', name: 'Info', address: 'info@laminam.sk', isActive: true, ownerUserId: null, backfillSince: null,
      settings: { provider: 'microsoft365', ...(oauth.connected ? { graphRefreshToken: '********' } : {}) },
      connected: oauth.connected, account: oauth.account,
      lastRunAt: null, lastSuccessAt: null, lastError: null, folders: [],
    });
    const saved: Record<string, unknown>[] = [];
    await page.route('**/api/company_mailboxes.php**', async (route) => {
      const action = new URL(route.request().url()).searchParams.get('action') ?? '';
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, mailboxes: saved.length ? [box()] : [], userMailboxes: [], imapAvailable: true }) });
      }
      if (action === 'save') saved.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action === 'save' ? { success: true, mailbox: box() } : { success: true }) });
    });
    await gotoView(page, '#settings/email/mailboxes');

    const panel = page.getByTestId('company-mailboxes');
    // the app registration, with the address to copy into Microsoft Entra
    await panel.getByTestId('microsoft-app-settings').getByRole('button').first().click();
    await expect(panel.getByTestId('microsoft-redirect-uri')).toHaveText('https://crm.example.sk/api/graph_oauth.php');

    await panel.getByRole('button', { name: 'Pridať schránku' }).click();
    const form = panel.getByTestId('company-mailbox-form');
    await form.getByLabel('Názov', { exact: true }).fill('Info');
    await form.getByLabel('Adresa').fill('Info@Laminam.sk');
    await form.getByRole('button', { name: /IMAP \/ SMTP/ }).click();
    await page.getByRole('option', { name: /Microsoft 365/ }).click();
    await expect(form.getByTestId('company-mailbox-microsoft-hint')).toBeVisible();
    await expect(form.getByLabel('Server IMAP')).toHaveCount(0);
    await expect(form.getByLabel('Heslo')).toHaveCount(0);
    await form.getByRole('button', { name: 'Uložiť schránku' }).click();

    await expect.poll(() => saved[0], { timeout: 10_000 }).toMatchObject({ name: 'Info', address: 'info@laminam.sk', settings: { provider: 'microsoft365' } });
    expect(Object.keys(saved[0].settings as object)).toEqual(['provider']);

    // saved, not signed in yet: the row says so and offers the button
    const row = panel.getByTestId('company-mailbox-cmb-m365');
    await expect(row.getByTestId('company-mailbox-microsoft')).toContainText('Zatiaľ neprihlásené');
    await row.getByTestId('microsoft-sign-in').click();
    await expect(row.getByTestId('company-mailbox-microsoft')).toContainText('Prihlásené ako', { timeout: 15_000 });
    await expect(row.getByTestId('company-mailbox-microsoft')).toContainText('info@laminam.sk');
    expect(oauth.started).toEqual([{ target: 'company', mailboxId: 'cmb-m365' }]);
    await page.screenshot({ path: 'test-results/microsoft-mail-company.png', fullPage: false });
  });
});
