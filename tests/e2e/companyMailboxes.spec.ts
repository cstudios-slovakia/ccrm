import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Company mailboxes and the mail the background job files onto timelines.
 *
 * Two things matter to a user and neither can be judged by the crawler: an admin can
 * define a shared mailbox without the password ever coming back to the browser, and a
 * colleague can read a message that arrived in a mailbox they do not have (a company
 * mailbox) while a message in their own mailbox is still read live, as before.
 *
 * The server side (matching, chunked backfill, tombstones, one broken mailbox) is pinned
 * by `npm run test:mail-filing` against a real IMAP server; here the endpoints are mocked.
 * The fixture runs in Slovak, as the admin Erik (erik@crm.com).
 */

const CLIENT = 'Kováč Reality s.r.o.';

const STORED_BOX = {
  id: 'cmb-info',
  name: 'Info',
  address: 'info@villatesta.sk',
  isActive: true,
  ownerUserId: null,
  backfillSince: '2025-06-01',
  settings: {
    provider: 'smtp', imapHost: 'imap.villatesta.sk', imapPort: '993', imapSecure: 'ssl', imapUsername: 'info@villatesta.sk',
    imapPassword: '********', smtpHost: 'smtp.villatesta.sk', smtpPort: '465', smtpSecure: 'ssl', smtpUsername: 'info@villatesta.sk',
    smtpPassword: '********', exchangeUrl: '', imapAllowSelfSigned: false,
  },
  lastRunAt: '2026-10-23 10:00:00',
  lastSuccessAt: null,
  lastError: 'IMAP "INBOX": Can not authenticate to IMAP server',
  folders: [{ folder: 'INBOX', lastUid: 12, backfillDone: false, filedCount: 4, lastRunAt: '2026-10-23 10:00:00', lastError: null }],
};

/** Mocks api/company_mailboxes.php and records what the page sends to it. */
async function mockMailboxApi(page: Page) {
  const sent: { action: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/company_mailboxes.php**', async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action') ?? '';
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, mailboxes: [STORED_BOX], userMailboxes: [], imapAvailable: true }),
      });
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push({ action, body });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(action === 'save' ? { success: true, mailbox: STORED_BOX } : { success: true }),
    });
  });
  return sent;
}

test.describe('Company mailboxes', () => {
  test('an admin adds a mailbox; the password goes to the server once and a stored one is never shown', async ({ page }) => {
    await startSession(page);
    const sent = await mockMailboxApi(page);
    await gotoView(page, '#settings/email/mailboxes');

    const panel = page.getByTestId('company-mailboxes');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('company-mailbox-cmb-info')).toContainText('info@villatesta.sk');
    // the job's last problem with it is on screen, not buried in a log
    await expect(panel.getByTestId('company-mailbox-error')).toContainText('Can not authenticate');

    // edit the stored one: its password is a mask, and stays one
    await panel.getByTitle('Upraviť').click();
    const form = panel.getByTestId('company-mailbox-form');
    await expect(form.getByLabel('Heslo')).toHaveValue('********');
    await form.getByRole('button', { name: 'Otestovať spojenie' }).click();
    await expect.poll(() => sent.find((s) => s.action === 'test')?.body, { timeout: 10_000 }).toMatchObject({ id: 'cmb-info' });
    expect((sent.find((s) => s.action === 'test')!.body.settings as Record<string, unknown>).imapPassword).toBe('********');
    await form.getByRole('button', { name: 'Zrušiť' }).click();

    // add a new one
    await panel.getByRole('button', { name: 'Pridať schránku' }).click();
    await form.getByLabel('Názov', { exact: true }).fill('Steel');
    await form.getByLabel('Adresa').fill('STEEL@Villatesta.sk');
    await form.getByLabel('Server IMAP').fill('imap.villatesta.sk');
    await form.getByLabel('Prihlasovacie meno').fill('steel@villatesta.sk');
    await form.getByLabel('Heslo').fill('s3cret');
    await form.getByLabel(/Evidovať poštu od dátumu/).fill('2026-01-01');
    await form.getByRole('button', { name: 'Uložiť schránku' }).click();

    await expect.poll(() => sent.find((s) => s.action === 'save')?.body, { timeout: 10_000 }).toMatchObject({
      name: 'Steel',
      address: 'steel@villatesta.sk',
      backfillSince: '2026-01-01',
      isActive: true,
    });
    const saved = sent.find((s) => s.action === 'save')!.body;
    expect((saved.settings as Record<string, unknown>).imapPassword).toBe('s3cret');
    expect((saved.settings as Record<string, unknown>).smtpUsername).toBe('steel@villatesta.sk');
    expect(saved.id).toBeUndefined();
    await page.screenshot({ path: 'test-results/company-mailboxes-settings.png', fullPage: false });
  });
});

/** The fixture plus two filed mails on client-kovac: one from a company mailbox, one from the viewer's own. */
async function seedFiledMail(page: Page) {
  // what the page asked the mail endpoint for: stored bodies by event id, live reads by uid
  const requested = { stored: [] as string[], live: [] as string[] };
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const base = buildSyncPayload();
    const event = (id: string, title: string, extra: object) => ({
      id, type: 'email', timestamp: '2026-10-20 09:15', title, content: `From: Kováč <obchod@kovacreality.sk>\nTo: x\nSubject: ${title}`, isOutgoing: false, ...extra,
    });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ...base,
        leads: base.leads.map((l: Record<string, unknown>) =>
          l.id === 'client-kovac'
            ? {
                ...l,
                timeline: [
                  event('email-inbox-aaaaaaaaaaaa-11', 'Dopyt na krytinu', { mailAccount: 'Info', hasStoredBody: true }),
                  event('email-inbox-bbbbbbbbbbbb-12', 'Moja vlastná správa', { mailAccount: 'erik@crm.com', mailOwner: 'erik@crm.com', hasStoredBody: true }),
                ],
              }
            : l,
        ),
      }),
    });
  });
  await page.route('**/api/mail_broker.php**', async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    if (action === 'get_filed_mail') {
      requested.stored.push(url.searchParams.get('id') ?? '');
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, email: { uid: 'x', html: '', text: 'Dobrý deň, potrebujeme 120 m² krytiny.', attachments: [{ name: 'vykres.pdf', size: 4096, stored: true }, { name: 'zaznam.mov', size: 9_000_000, stored: false }], stored: true, mail_account: 'Info' } }),
      });
    }
    if (action === 'get_email_detail') {
      requested.live.push(`uid=${url.searchParams.get('uid')}`);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, email: { uid: '12', html: '', text: 'TEXT Z MOJEJ SCHRÁNKY', attachments: [], seen: true } }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, emails: [], pagination: { total: 0 } }) });
  });
  return requested;
}

test.describe('Mail filed by the background job', () => {
  test('a message from a mailbox the viewer does not have shows where it came from and is read from the stored body', async ({ page }) => {
    await startSession(page);
    const requests = await seedFiledMail(page);
    await gotoView(page, `#client-${encodeURIComponent(CLIENT)}`);

    // first entry in the timeline: the company mailbox's message
    await expect(page.getByTestId('mail-account-badge').first()).toHaveText('Info');
    const body = page.getByTestId('filed-mail-body').first();

    // the body is read on demand, and only then
    expect(requests.stored).toEqual([]);
    await body.getByRole('button', { name: 'Zobraziť správu' }).click();
    await expect(body).toContainText('potrebujeme 120 m² krytiny');
    await expect(body.getByTestId('filed-mail-attachments')).toContainText('vykres.pdf');
    // a kept file opens from the server by message and position; one that was not kept is only a name
    const links = body.getByTestId('filed-mail-attachment-link');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute('href', '/api/mail_broker.php?action=get_filed_mail_attachment&id=email-inbox-aaaaaaaaaaaa-11&n=0');
    await expect(body.getByTestId('filed-mail-attachments')).toContainText('zaznam.mov');
    expect(requests.stored).toEqual(['email-inbox-aaaaaaaaaaaa-11']);
    await body.getByRole('button', { name: 'Skryť správu' }).click();
    await expect(body).not.toContainText('potrebujeme 120 m²');

    // opening the entry itself asks the store, not a mailbox the viewer does not have
    requests.stored.length = 0;
    await page.getByText('Dopyt na krytinu', { exact: true }).first().click();
    await expect.poll(() => requests.stored, { timeout: 10_000 }).toEqual(['email-inbox-aaaaaaaaaaaa-11']);
    expect(requests.live).toEqual([]);
  });

  test('opening a message from the own mailbox of the viewer still reads it live', async ({ page }) => {
    await startSession(page);
    const requests = await seedFiledMail(page);
    await gotoView(page, `#client-${encodeURIComponent(CLIENT)}`);

    await page.getByText('Moja vlastná správa', { exact: true }).first().click();
    await expect.poll(() => requests.live, { timeout: 10_000 }).toEqual(['uid=12']);
    expect(requests.stored).not.toContain('email-inbox-bbbbbbbbbbbb-12');
  });
});
